"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { jsonFetch } from "@/lib/http";
import { notifyToast } from "@/lib/ui/toast";

type ExtractedPage = {
  id: string;
  pageNumber: number;
  text: string;
  confidence: number;
};

type ExtractionRun = {
  id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "NEEDS_OCR" | "FAILED";
  isScanned: boolean;
  overallConfidence: number | null;
  engineVersion: string;
  startedAt: string;
  finishedAt?: string | null;
  warnings?: any[] | null;
  error?: string | null;
  sourceMeta?: any;
  pages: ExtractedPage[];
};

type Submission = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  student?: { id: string; fullName: string; email?: string | null; externalRef?: string | null } | null;
  assignment?: {
    id: string;
    unitCode: string;
    assignmentRef?: string | null;
    title: string;
  } | null;
  studentLinkedAt?: string | null;
  studentLinkedBy?: string | null;
  extractionRuns: ExtractionRun[];
  assessments?: Array<{
    id: string;
    createdAt: string;
    overallGrade: string | null;
    feedbackText?: string | null;
    annotatedPdfPath: string | null;
    resultJson?: any;
  }>;
};

type TriageInfo = {
  unitCode?: string | null;
  assignmentRef?: string | null;
  studentName?: string | null;
  email?: string | null;
  sampleLines?: string[];
  warnings?: string[];
  studentDetection?: {
    detected: boolean;
    linked: boolean;
    source: "text" | "filename" | "email" | null;
  };
  coverage?: {
    hasUnitSpec: boolean;
    hasAssignmentBrief: boolean;
    missing: string[];
  };
};

type GradingConfig = {
  model: string;
  tone: "supportive" | "professional" | "strict";
  strictness: "lenient" | "balanced" | "strict";
  useRubricIfAvailable: boolean;
  maxFeedbackBullets: number;
};

type StudentSearchResult = {
  id: string;
  fullName: string;
  email?: string | null;
  externalRef?: string | null;
};

type AssessmentRequirement = {
  task?: string;
  section?: string;
  needsTable?: boolean;
  needsPercentage?: boolean;
  charts?: string[];
  needsEquation?: boolean;
  needsImage?: boolean;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function normalizeRequirementSection(section?: string) {
  const s = String(section || "").trim();
  if (!s || s.toLowerCase() === "task") return "Task";
  return `Part ${s.toUpperCase()}`;
}

function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700">
      {children}
    </span>
  );
}

function nextAction(status: string) {
  switch (status) {
    case "UPLOADED":
    case "EXTRACTING":
      return "Extraction running";
    case "EXTRACTED":
      return "Ready to assess";
    case "NEEDS_OCR":
      return "Needs OCR";
    case "ASSESSING":
    case "MARKING":
      return "Assessment running";
    case "DONE":
      return "Upload back to Totara";
    case "FAILED":
      return "Needs attention";
    default:
      return "—";
  }
}

export default function SubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = String(params?.submissionId || "");

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [triageInfo, setTriageInfo] = useState<TriageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [gradingBusy, setGradingBusy] = useState(false);
  const [gradingCfg, setGradingCfg] = useState<GradingConfig | null>(null);
  const [tone, setTone] = useState<GradingConfig["tone"]>("professional");
  const [strictness, setStrictness] = useState<GradingConfig["strictness"]>("balanced");
  const [useRubric, setUseRubric] = useState(true);

  // Auto-run extraction once for freshly uploaded submissions.
  const autoStartedRef = useRef(false);

  /* ---------- Student linking state ---------- */
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);

  /* ---------- Extraction view state ---------- */
  const [activePage, setActivePage] = useState(0);
  const refreshSeq = useRef(0);

  const latestRun = useMemo(() => {
    const runs = submission?.extractionRuns ?? [];
    if (!runs.length) return null;
    return [...runs].sort((a, b) => {
      const at = new Date(a.finishedAt ?? a.startedAt).getTime();
      const bt = new Date(b.finishedAt ?? b.startedAt).getTime();
      return bt - at;
    })[0];
  }, [submission]);

  const pagesSorted = useMemo(
    () => [...(latestRun?.pages ?? [])].sort((a, b) => a.pageNumber - b.pageNumber),
    [latestRun]
  );

  const active = pagesSorted[Math.min(Math.max(activePage, 0), Math.max(pagesSorted.length - 1, 0))];
  const coverMeta = useMemo(() => {
    const c = latestRun?.sourceMeta?.coverMetadata;
    return c && typeof c === "object" ? c : null;
  }, [latestRun]);

  const latestAssessment = useMemo(() => {
    const a = submission?.assessments ?? [];
    if (!a.length) return null;
    return a[0];
  }, [submission]);

  const checklist = useMemo(() => {
    const studentLinked = !!submission?.student;
    const assignmentLinked = !!submission?.assignment;
    const extractionComplete = latestRun?.status === "DONE" || latestRun?.status === "NEEDS_OCR";
    const gradeGenerated = !!latestAssessment?.overallGrade;
    const feedbackGenerated = !!String(latestAssessment?.feedbackText || "").trim();
    const markedPdfGenerated = !!latestAssessment?.annotatedPdfPath;

    const readyToUpload =
      studentLinked &&
      assignmentLinked &&
      extractionComplete &&
      gradeGenerated &&
      feedbackGenerated &&
      markedPdfGenerated;

    return {
      studentLinked,
      assignmentLinked,
      extractionComplete,
      gradeGenerated,
      feedbackGenerated,
      markedPdfGenerated,
      readyToUpload,
    };
  }, [submission, latestRun, latestAssessment]);

  const modalityCompliance = useMemo(() => {
    const reqsRaw = Array.isArray(latestAssessment?.resultJson?.assessmentRequirements)
      ? (latestAssessment?.resultJson?.assessmentRequirements as AssessmentRequirement[])
      : [];
    const evidence = (latestAssessment?.resultJson?.submissionAssessmentEvidence || {}) as Record<string, any>;

    const found = {
      table: Boolean(evidence.hasTableWords) || Number(evidence.dataRowLikeCount || 0) >= 2,
      bar: Boolean(evidence.hasBarWords),
      pie: Boolean(evidence.hasPieWords),
      graph: Boolean(evidence.hasFigureWords),
      image: Boolean(evidence.hasImageWords) || Boolean(evidence.hasFigureWords),
      equation:
        Boolean(evidence.hasEqMarker) ||
        Boolean(evidence.hasEquationTokenWords) ||
        Number(evidence.equationLikeLineCount || 0) > 0,
      percentage: Number(evidence.percentageCount || 0) > 0,
    };

    const rows = reqsRaw.map((r, idx) => {
      const charts = Array.isArray(r.charts) ? r.charts.map((c) => String(c || "").toLowerCase()) : [];
      const chartRequired = charts.length > 0;
      const chartFound = !chartRequired
        ? true
        : charts.every((c) => (c === "bar" ? found.bar : c === "pie" ? found.pie : found.graph));
      const tableRequired = !!r.needsTable;
      const tableFound = !tableRequired || found.table;
      const equationRequired = !!r.needsEquation;
      const equationFound = !equationRequired || found.equation;
      const imageRequired = !!r.needsImage;
      const imageFound = !imageRequired || found.image;
      const percentageRequired = !!r.needsPercentage;
      const percentageFound = !percentageRequired || found.percentage;
      const ok = chartFound && tableFound && equationFound && imageFound && percentageFound;
      return {
        id: `${String(r.task || "Task")}-${String(r.section || "task")}-${idx}`,
        task: String(r.task || "Task"),
        section: normalizeRequirementSection(r.section),
        required: {
          chart: chartRequired ? charts.join(", ") : "—",
          table: tableRequired ? "Yes" : "—",
          equation: equationRequired ? "Yes" : "—",
          image: imageRequired ? "Yes" : "—",
          percentage: percentageRequired ? "Yes" : "—",
        },
        found: {
          chart: chartRequired ? (chartFound ? "Yes" : "No") : "—",
          table: tableRequired ? (tableFound ? "Yes" : "No") : "—",
          equation: equationRequired ? (equationFound ? "Yes" : "No") : "—",
          image: imageRequired ? (imageFound ? "Yes" : "No") : "—",
          percentage: percentageRequired ? (percentageFound ? "Yes" : "No") : "—",
        },
        ok,
      };
    });

    return {
      rows,
      foundSignals: found,
      hasData: rows.length > 0,
      passCount: rows.filter((r) => r.ok).length,
      failCount: rows.filter((r) => !r.ok).length,
    };
  }, [latestAssessment]);

  /* =========================
     Data loading
  ========================= */

  async function refresh() {
    if (!submissionId) return;
    const seq = ++refreshSeq.current;
    const data = await jsonFetch<{ submission: Submission }>(
      `/api/submissions/${submissionId}?t=${Date.now()}`,
      { cache: "no-store" }
    );
    if (seq !== refreshSeq.current) return;
    setSubmission(data.submission);
  }

  useEffect(() => {
    if (!submissionId) return;
    refresh().catch((e) => setErr(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  useEffect(() => {
    let cancelled = false;
    async function loadCfg() {
      try {
        const res = await jsonFetch<GradingConfig>("/api/admin/grading-config", { cache: "no-store" });
        if (cancelled) return;
        setGradingCfg(res);
        setTone(res.tone);
        setStrictness(res.strictness);
        setUseRubric(!!res.useRubricIfAvailable);
      } catch {
        // keep defaults
      }
    }
    loadCfg();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!submissionId) return;
    if (!submission) return;
    const hasRun = (submission.extractionRuns?.length ?? 0) > 0;
    const isFresh = submission.status === "UPLOADED" && !hasRun;
    if (!isFresh) return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    runExtraction().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, submission]);

  /* =========================
     Extraction + Triage
  ========================= */

  async function runExtraction() {
    if (!submissionId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setTriageInfo(null);
    try {
      await jsonFetch(`/api/submissions/${submissionId}/extract`, { method: "POST" });
      const triage = await jsonFetch<{ triage?: TriageInfo; submission?: Submission }>(
        `/api/submissions/${submissionId}/triage`,
        { method: "POST" }
      );
      if (triage.triage) setTriageInfo(triage.triage);
      if (triage.submission) setSubmission(triage.submission);
      await refresh();
      setMsg("Extraction complete.");
      notifyToast("success", "Submission extracted.");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runGrading() {
    if (!submissionId) return;
    setGradingBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<any>(`/api/submissions/${submissionId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone,
          strictness,
          useRubricIfAvailable: useRubric,
        }),
      });
      await refresh();
      setMsg(`Grading complete: ${String(res?.assessment?.overallGrade || "done")}`);
      notifyToast("success", "Grading complete.");
    } catch (e: any) {
      const message = e?.message || "Grading failed.";
      setErr(message);
      notifyToast("error", message);
    } finally {
      setGradingBusy(false);
    }
  }

  /* =========================
     Student search
  ========================= */

  useEffect(() => {
    let alive = true;
    const q = studentQuery.trim();
    if (q.length < 2) {
      setStudentResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await jsonFetch<any>(`/api/students?query=${encodeURIComponent(q)}`);
        const list = (Array.isArray(res) ? res : res?.students) as StudentSearchResult[] | undefined;
        if (alive) setStudentResults(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setStudentResults([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [studentQuery]);

  async function linkStudent(studentId: string) {
    if (!studentId) return;
    setStudentBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<{ submission: Submission }>(
        `/api/submissions/${submissionId}/link-student`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId }),
        }
      );
      setSubmission(res.submission);
      await refresh();
      setMsg("Student linked.");
    } catch (e: any) {
      setErr(e?.message || "Link failed");
    } finally {
      setStudentBusy(false);
    }
  }

  async function unlinkStudent() {
    setStudentBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<{ submission: Submission }>(
        `/api/submissions/${submissionId}/unlink-student`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      setSubmission(res.submission);
      await refresh();
      setMsg("Student unlinked.");
    } catch (e: any) {
      setErr(e?.message || "Unlink failed");
    } finally {
      setStudentBusy(false);
    }
  }

  async function createStudentAndLink() {
    const fullName = newStudentName.trim();
    if (!fullName) return;
    setStudentBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<any>(`/api/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email: newStudentEmail.trim() || null }),
      });
      const student = (res?.student ?? res) as StudentSearchResult;
      if (student?.id) await linkStudent(student.id);
      setNewStudentName("");
      setNewStudentEmail("");
    } finally {
      setStudentBusy(false);
    }
  }

  const pdfUrl = submissionId ? `/api/submissions/${submissionId}/file?t=${Date.now()}` : "";
  const markedPdfUrl = submissionId ? `/api/submissions/${submissionId}/marked-file?t=${Date.now()}` : "";
  const canRunGrading =
    !!submission?.student &&
    !!submission?.assignment &&
    (latestRun?.status === "DONE" || latestRun?.status === "NEEDS_OCR") &&
    !gradingBusy;

  return (
    <main className="py-2">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold text-zinc-500">Submissions</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{submission?.filename || "Submission"}</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Goal: produce an audit-safe grade + human feedback + a marked PDF you can upload back to Totara.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/submissions"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
          >
            ← Back
          </Link>
          <button
            type="button"
            onClick={runExtraction}
            disabled={busy || submission?.status === "EXTRACTING"}
            className={cx(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm",
              busy || submission?.status === "EXTRACTING"
                ? "cursor-not-allowed bg-zinc-300 text-zinc-700"
                : "bg-zinc-900 text-white hover:bg-zinc-800"
            )}
          >
            {busy || submission?.status === "EXTRACTING" ? "Processing…" : "Run extraction"}
          </button>
          <button
            type="button"
            onClick={runGrading}
            disabled={!canRunGrading}
            className={cx(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm",
              canRunGrading
                ? "bg-sky-700 text-white hover:bg-sky-800"
                : "cursor-not-allowed bg-zinc-300 text-zinc-700"
            )}
          >
            {gradingBusy ? "Grading…" : "Run grading"}
          </button>
        </div>
      </div>

      {(err || msg) && (
        <div
          className={cx(
            "mb-4 rounded-xl border p-3 text-sm",
            err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {err || msg}
        </div>
      )}

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Student</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">
            {submission?.student?.fullName || "Unlinked"}
          </div>
          <div className="mt-1 text-xs text-zinc-600">{submission?.student?.email || "No email"}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assignment</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">
            {submission?.assignment
              ? `${submission.assignment.unitCode} ${submission.assignment.assignmentRef || ""}`.trim()
              : "Unassigned"}
          </div>
          <div className="mt-1 text-xs text-zinc-600">{submission?.assignment?.title || "No assignment linked"}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Extraction</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{latestRun?.status || "Not started"}</div>
          <div className="mt-1 text-xs text-zinc-600">
            {latestRun ? `Confidence ${Math.round((latestRun.overallConfidence || 0) * 100)}%` : "Run extraction to continue"}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Grade</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{latestAssessment?.overallGrade || "Pending"}</div>
          <div className="mt-1 text-xs text-zinc-600">
            {latestAssessment?.annotatedPdfPath ? "Marked PDF available" : "No marked PDF yet"}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* LEFT: PDF */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
              <div className="flex items-center gap-3">
                <StatusPill>{submission?.status || "—"}</StatusPill>
                <div className="text-sm text-zinc-600">Next action: <span className="font-semibold text-zinc-900">{nextAction(String(submission?.status || ""))}</span></div>
              </div>
              <div className="text-xs text-zinc-500">Uploaded: {safeDate(submission?.uploadedAt)}</div>
            </div>

            <div className="aspect-[4/3] w-full bg-zinc-50">
              {/* PDF render (works for scanned + digital PDFs) */}
              {submissionId ? (
                <iframe
                  title="Submission PDF"
                  src={pdfUrl}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-600">Loading…</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Metadata + extraction */}
        <div className="grid gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-500">Totara upload checklist</div>
                <div className="mt-1 text-sm text-zinc-600">Quick sanity check before you upload results back.</div>
              </div>
              {checklist.readyToUpload ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  ✓ Ready
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  In progress
                </span>
              )}
            </div>

            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-zinc-700">Student linked</span>
                <span className={cx("font-semibold", checklist.studentLinked ? "text-emerald-700" : "text-zinc-400")}>
                  {checklist.studentLinked ? "Yes" : "No"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-zinc-700">Assignment linked</span>
                <span className={cx("font-semibold", checklist.assignmentLinked ? "text-emerald-700" : "text-zinc-400")}>
                  {checklist.assignmentLinked ? "Yes" : "No"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-zinc-700">Extraction complete</span>
                <span className={cx("font-semibold", checklist.extractionComplete ? "text-emerald-700" : "text-zinc-400")}>
                  {checklist.extractionComplete ? "Yes" : "No"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-zinc-700">Grade generated</span>
                <span className={cx("font-semibold", checklist.gradeGenerated ? "text-emerald-700" : "text-zinc-400")}>
                  {checklist.gradeGenerated ? (latestAssessment?.overallGrade || "Yes") : "No"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-zinc-700">Feedback generated</span>
                <span className={cx("font-semibold", checklist.feedbackGenerated ? "text-emerald-700" : "text-zinc-400")}>
                  {checklist.feedbackGenerated ? "Yes" : "No"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-zinc-700">Marked PDF</span>
                <span className={cx("font-semibold", checklist.markedPdfGenerated ? "text-emerald-700" : "text-zinc-400")}>
                  {checklist.markedPdfGenerated ? "Yes" : "No"}
                </span>
              </li>
            </ul>

            {!checklist.readyToUpload ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                Tip: export is enabled only when student/assignment, extraction, grade, feedback, and marked PDF are all present.
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-zinc-500">Student</div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-zinc-900">
                  {submission?.student?.fullName || "Unlinked"}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {[submission?.student?.email, submission?.student?.externalRef].filter(Boolean).join(" · ") || "—"}
                </div>
                {triageInfo?.studentName && !submission?.student?.fullName ? (
                  <div className="mt-2 text-xs text-zinc-500">
                    Detected on cover page: <span className="font-semibold text-zinc-900">{triageInfo.studentName}</span>
                  </div>
                ) : null}
              </div>
              {submission?.student ? (
                <button
                  type="button"
                  onClick={unlinkStudent}
                  disabled={studentBusy}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    studentBusy
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                      : "border-zinc-200 bg-white hover:bg-zinc-50"
                  )}
                >
                  Unlink
                </button>
              ) : null}
            </div>

            {!submission?.student ? (
              <div className="mt-4 grid gap-3">
                <div>
                  <div className="text-sm font-semibold">Find existing student</div>
                  <input
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Search by name, email, AB number…"
                    className="mt-2 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                  />
                  <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-zinc-200">
                    {studentResults.length === 0 ? (
                      <div className="p-3 text-sm text-zinc-600">No results yet.</div>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {studentResults.slice(0, 10).map((st) => (
                          <label key={st.id} className="flex cursor-pointer items-start gap-3 p-3">
                            <input
                              type="radio"
                              name="student"
                              className="mt-1"
                              checked={selectedStudentId === st.id}
                              onChange={() => setSelectedStudentId(st.id)}
                            />
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">{st.fullName}</div>
                              <div className="mt-0.5 text-xs text-zinc-600">{[st.email, st.externalRef].filter(Boolean).join(" · ") || "—"}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => linkStudent(selectedStudentId)}
                    disabled={!selectedStudentId || studentBusy}
                    className={cx(
                      "mt-2 inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold",
                      !selectedStudentId || studentBusy
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                        : "bg-zinc-900 text-white hover:bg-zinc-800"
                    )}
                  >
                    Link selected
                  </button>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-sm font-semibold text-zinc-900">Quick create</div>
                  <div className="mt-2 grid gap-2">
                    <input
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      placeholder="New student full name"
                      className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                    />
                    <input
                      value={newStudentEmail}
                      onChange={(e) => setNewStudentEmail(e.target.value)}
                      placeholder="Email (optional)"
                      className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={createStudentAndLink}
                      disabled={!newStudentName.trim() || studentBusy}
                      className={cx(
                        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold",
                        !newStudentName.trim() || studentBusy
                          ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                          : "bg-white text-zinc-900 hover:bg-zinc-100 border border-zinc-200"
                      )}
                    >
                      Create & link
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {submission?.studentLinkedAt ? (
              <div className="mt-3 text-xs text-zinc-500">
                Linked: {safeDate(submission.studentLinkedAt)}{submission.studentLinkedBy ? ` · by ${submission.studentLinkedBy}` : ""}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-zinc-500">Assignment</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">
              {submission?.assignment ? `${submission.assignment.unitCode} ${submission.assignment.assignmentRef || ""}`.trim() : "Unassigned"}
            </div>
            <div className="mt-1 text-sm text-zinc-600">{submission?.assignment?.title || "—"}</div>

            {triageInfo?.coverage?.missing?.length ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="text-xs font-semibold uppercase tracking-wide">Reference coverage</div>
                <div className="mt-2">Missing: {triageInfo.coverage.missing.join(", ")}</div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-zinc-500">Extraction</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {latestRun ? `Latest run · ${latestRun.engineVersion}` : "Not run yet"}
                  </div>
                </div>
                {latestRun ? (
                  <div className="text-xs text-zinc-500">
                    {latestRun.status} · Confidence {Math.round((latestRun.overallConfidence || 0) * 100)}%
                  </div>
                ) : null}
              </div>
            </div>

            <div className="p-4">
              {!latestRun ? (
                <div className="text-sm text-zinc-600">
                  No extraction yet. Click <span className="font-semibold">Run extraction</span> to generate readable text for grading.
                </div>
              ) : (
                <div className="grid gap-3">
                  {latestRun.error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                      {latestRun.error}
                    </div>
                  ) : null}

                  {!!triageInfo?.warnings?.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="text-xs font-semibold uppercase tracking-wide">Warnings</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {triageInfo.warnings.slice(0, 5).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {coverMeta ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <div className="text-[11px] font-semibold uppercase tracking-wide">Cover Metadata</div>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        <div>
                          <span className="font-semibold">Student:</span>{" "}
                          {String(coverMeta?.studentName?.value || "—")}
                        </div>
                        <div>
                          <span className="font-semibold">Student ID:</span>{" "}
                          {String(coverMeta?.studentId?.value || "—")}
                        </div>
                        <div>
                          <span className="font-semibold">Unit:</span>{" "}
                          {String(coverMeta?.unitCode?.value || "—")}
                        </div>
                        <div>
                          <span className="font-semibold">Assignment:</span>{" "}
                          {String(coverMeta?.assignmentCode?.value || "—")}
                        </div>
                        <div>
                          <span className="font-semibold">Submission Date:</span>{" "}
                          {String(coverMeta?.submissionDate?.value || "—")}
                        </div>
                        <div>
                          <span className="font-semibold">Confidence:</span>{" "}
                          {Number(coverMeta?.confidence || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-semibold text-zinc-500">Page</div>
                    <select
                      value={activePage}
                      onChange={(e) => setActivePage(Number(e.target.value))}
                      className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                    >
                      {pagesSorted.map((p, idx) => (
                        <option key={p.id} value={idx}>
                          {p.pageNumber} (conf {Math.round((p.confidence || 0) * 100)}%)
                        </option>
                      ))}
                    </select>
                    <div className="ml-auto text-xs text-zinc-500">Started: {safeDate(latestRun.startedAt)}</div>
                  </div>

                  <div className="max-h-[42vh] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="whitespace-pre-wrap font-mono text-xs text-zinc-800">
                      {active?.text?.trim() ? active.text : "(No meaningful text on this page yet)"}
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    Tip: scanned/handwritten pages may show low text. Those will become "NEEDS_OCR" later when we add vision.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-zinc-500">Grading config</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-sm text-zinc-700">
                Tone
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                >
                  <option value="supportive">Supportive</option>
                  <option value="professional">Professional</option>
                  <option value="strict">Strict</option>
                </select>
              </label>
              <label className="text-sm text-zinc-700">
                Strictness
                <select
                  value={strictness}
                  onChange={(e) => setStrictness(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                >
                  <option value="lenient">Lenient</option>
                  <option value="balanced">Balanced</option>
                  <option value="strict">Strict</option>
                </select>
              </label>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300"
                checked={useRubric}
                onChange={(e) => setUseRubric(e.target.checked)}
              />
              Use rubric when linked to this brief
            </label>
            <div className="mt-2 text-xs text-zinc-500">Model: {gradingCfg?.model || "default"} · Feedback bullets: {gradingCfg?.maxFeedbackBullets ?? 6}</div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-zinc-500">Audit & outputs</div>
            <div className="mt-2 grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-700">Latest grade</span>
                <span className="font-semibold text-zinc-900">{latestAssessment?.overallGrade || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-700">Graded by</span>
                <span className="font-semibold text-zinc-900">{String(latestAssessment?.resultJson?.gradedBy || "—")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Original PDF
                </a>
                <a
                  href={markedPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cx(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                    latestAssessment?.annotatedPdfPath
                      ? "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                      : "pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-400"
                  )}
                >
                  Marked PDF
                </a>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 whitespace-pre-wrap">
                {latestAssessment?.feedbackText || "No feedback generated yet."}
              </div>
              {modalityCompliance.hasData ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Modality Compliance (Automated)
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
                      Pass {modalityCompliance.passCount}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
                      Review {modalityCompliance.failCount}
                    </span>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-600">
                        <tr>
                          <th className="border border-zinc-200 px-2 py-1.5">Task</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Section</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Required</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Found</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalityCompliance.rows.map((row) => (
                          <tr key={row.id}>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-800">{row.task}</td>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-800">{row.section}</td>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-700">
                              chart: {row.required.chart}; table: {row.required.table}; image: {row.required.image}; equation: {row.required.equation}; %: {row.required.percentage}
                            </td>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-700">
                              chart: {row.found.chart}; table: {row.found.table}; image: {row.found.image}; equation: {row.found.equation}; %: {row.found.percentage}
                            </td>
                            <td className="border border-zinc-200 px-2 py-1.5">
                              <span
                                className={cx(
                                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  row.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                )}
                              >
                                {row.ok ? "Pass" : "Review"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    Signals: table={String(modalityCompliance.foundSignals.table)}; bar={String(modalityCompliance.foundSignals.bar)}; pie={String(modalityCompliance.foundSignals.pie)}; image={String(modalityCompliance.foundSignals.image)}; equation={String(modalityCompliance.foundSignals.equation)}; percentage={String(modalityCompliance.foundSignals.percentage)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
