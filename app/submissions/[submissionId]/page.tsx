"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { jsonFetch } from "@/lib/http";
import { notifyToast } from "@/lib/ui/toast";
import { summarizeFeedbackText } from "@/lib/grading/feedbackDocument";

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
    source: "text" | "cover" | "filename" | "email" | null;
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
  feedbackTemplate?: string;
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
  const studentSearchInputRef = useRef<HTMLInputElement | null>(null);
  const studentPanelRef = useRef<HTMLDetailsElement | null>(null);
  const workflowPanelRef = useRef<HTMLDivElement | null>(null);
  const assignmentPanelRef = useRef<HTMLDetailsElement | null>(null);
  const extractionPanelRef = useRef<HTMLDetailsElement | null>(null);
  const gradingPanelRef = useRef<HTMLDivElement | null>(null);
  const outputsPanelRef = useRef<HTMLDetailsElement | null>(null);
  const coverEditorRef = useRef<HTMLDetailsElement | null>(null);
  const coverStudentNameRef = useRef<HTMLInputElement | null>(null);
  const coverStudentIdRef = useRef<HTMLInputElement | null>(null);
  const coverUnitCodeRef = useRef<HTMLInputElement | null>(null);
  const coverAssignmentCodeRef = useRef<HTMLInputElement | null>(null);
  const coverSubmissionDateRef = useRef<HTMLInputElement | null>(null);

  /* ---------- Student linking state ---------- */
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [coverEditBusy, setCoverEditBusy] = useState(false);
  const [coverSaveState, setCoverSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [pdfView, setPdfView] = useState<"original" | "marked">("original");
  const [gradingConfigOpen, setGradingConfigOpen] = useState(false);
  const [runGradeWhenReady, setRunGradeWhenReady] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pdfViewport, setPdfViewport] = useState<"compact" | "comfort" | "full">("comfort");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [feedbackEditorBusy, setFeedbackEditorBusy] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackStudentName, setFeedbackStudentName] = useState("");
  const [feedbackAssessorName, setFeedbackAssessorName] = useState("");
  const [feedbackMarkedDate, setFeedbackMarkedDate] = useState("");
  const [coverStudentName, setCoverStudentName] = useState("");
  const [coverStudentId, setCoverStudentId] = useState("");
  const [coverUnitCode, setCoverUnitCode] = useState("");
  const [coverAssignmentCode, setCoverAssignmentCode] = useState("");
  const [coverSubmissionDate, setCoverSubmissionDate] = useState("");

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
  const extractionMode = useMemo(() => {
    const m = String(latestRun?.sourceMeta?.extractionMode || "").toUpperCase();
    return m === "COVER_ONLY" ? "COVER_ONLY" : m === "FULL" ? "FULL" : "";
  }, [latestRun]);
  const coverReady = useMemo(() => Boolean(latestRun?.sourceMeta?.coverReady), [latestRun]);

  useEffect(() => {
    setCoverStudentName(String(coverMeta?.studentName?.value || ""));
    setCoverStudentId(String(coverMeta?.studentId?.value || ""));
    setCoverUnitCode(String(coverMeta?.unitCode?.value || ""));
    setCoverAssignmentCode(String(coverMeta?.assignmentCode?.value || ""));
    setCoverSubmissionDate(String(coverMeta?.submissionDate?.value || ""));
  }, [coverMeta]);

  const latestAssessment = useMemo(() => {
    const a = submission?.assessments ?? [];
    if (!a.length) return null;
    return a[0];
  }, [submission]);
  const previousAssessment = useMemo(() => {
    const a = submission?.assessments ?? [];
    return a.length > 1 ? a[1] : null;
  }, [submission]);
  const gradingHistory = useMemo(() => submission?.assessments ?? [], [submission]);
  const selectedAssessment = useMemo(() => {
    if (!selectedAssessmentId) return latestAssessment;
    return gradingHistory.find((a) => a.id === selectedAssessmentId) || latestAssessment;
  }, [selectedAssessmentId, gradingHistory, latestAssessment]);
  const feedbackHistory = useMemo(
    () =>
      gradingHistory.map((a, idx) => ({
        id: a.id,
        index: idx,
        grade: a.overallGrade || "—",
        when: safeDate(a.createdAt),
        summary: summarizeFeedbackText(String(a.feedbackText || ""), 150) || "No feedback text.",
      })),
    [gradingHistory]
  );
  const changeChips = useMemo(() => {
    const out: string[] = [];
    if ((submission?.assessments?.length || 0) > 1) out.push(`Regraded ${Math.max(0, (submission?.assessments?.length || 1) - 1)}x`);
    const coverUpdatedAfterGrade =
      !!latestAssessment?.createdAt &&
      !!submission?.studentLinkedAt &&
      new Date(submission.studentLinkedAt).getTime() > new Date(latestAssessment.createdAt).getTime();
    if (coverUpdatedAfterGrade) out.push("Student link changed after last grade");
    if (extractionMode === "COVER_ONLY") out.push("Cover-only mode");
    if (coverSaveState === "saved") out.push("Cover metadata saved");
    return out;
  }, [submission, latestAssessment, extractionMode, coverSaveState]);

  const structuredGrading = useMemo(() => {
    const rj: any = selectedAssessment?.resultJson || {};
    const v2 = rj?.structuredGradingV2;
    if (v2 && typeof v2 === "object") return v2;
    const fallback = rj?.response;
    if (fallback && typeof fallback === "object") return fallback;
    return null;
  }, [selectedAssessment]);

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

    const items = [
      { key: "student", label: "Student linked", ok: studentLinked, hint: "Link or create student profile." },
      { key: "assignment", label: "Assignment linked", ok: assignmentLinked, hint: "Confirm brief/spec binding." },
      { key: "extraction", label: "Extraction complete", ok: extractionComplete, hint: "Run extraction and review warnings." },
      { key: "grade", label: "Grade generated", ok: gradeGenerated, hint: "Run grading." },
      { key: "feedback", label: "Feedback generated", ok: feedbackGenerated, hint: "Ensure feedback text is present." },
      { key: "marked", label: "Marked PDF", ok: markedPdfGenerated, hint: "Generate marked PDF from grading run." },
    ];
    const firstPending = items.find((i) => !i.ok);

    return {
      studentLinked,
      assignmentLinked,
      extractionComplete,
      gradeGenerated,
      feedbackGenerated,
      markedPdfGenerated,
      readyToUpload,
      items,
      pendingCount: items.filter((i) => !i.ok).length,
      nextBlockingAction: firstPending ? `${firstPending.label}: ${firstPending.hint}` : "Ready to upload to Totara.",
    };
  }, [submission, latestRun, latestAssessment]);

  const modalityCompliance = useMemo(() => {
    const reqsRaw = Array.isArray(selectedAssessment?.resultJson?.assessmentRequirements)
      ? (selectedAssessment?.resultJson?.assessmentRequirements as AssessmentRequirement[])
      : [];
    const evidence = (selectedAssessment?.resultJson?.submissionAssessmentEvidence || {}) as Record<string, any>;

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
  }, [selectedAssessment]);

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

  async function saveCoverMetadata(options?: { silent?: boolean }) {
    if (!submissionId || !latestRun) return;
    setCoverEditBusy(true);
    setCoverSaveState("saving");
    if (!options?.silent) {
      setErr("");
      setMsg("");
    }
    try {
      const mkField = (value: string) => {
        const v = String(value || "").trim();
        if (!v) return undefined;
        return { value: v, confidence: 1, page: 1, snippet: "manual override" };
      };
      const nextCover = {
        ...(coverMeta && typeof coverMeta === "object" ? coverMeta : {}),
        studentName: mkField(coverStudentName),
        studentId: mkField(coverStudentId),
        unitCode: mkField(coverUnitCode),
        assignmentCode: mkField(coverAssignmentCode),
        submissionDate: mkField(coverSubmissionDate),
      };
      await jsonFetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverMetadata: nextCover }),
      });
      await jsonFetch(`/api/submissions/${submissionId}/triage`, { method: "POST" }).catch(() => null);
      await refresh();
      setCoverSaveState("saved");
      window.setTimeout(() => setCoverSaveState("idle"), 1200);
      if (!options?.silent) {
        setMsg("Cover metadata updated.");
        notifyToast("success", "Cover metadata saved.");
      }
    } catch (e: any) {
      const message = e?.message || "Failed to save cover metadata.";
      setCoverSaveState("idle");
      if (!options?.silent) {
        setErr(message);
        notifyToast("error", message);
      }
    } finally {
      setCoverEditBusy(false);
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
  const markedPdfUrl = submissionId
    ? `/api/submissions/${submissionId}/marked-file?assessmentId=${encodeURIComponent(selectedAssessmentId || "")}&t=${Date.now()}`
    : "";
  const hasMarkedPdf = !!selectedAssessment?.annotatedPdfPath;
  const activePdfUrl = pdfView === "marked" && hasMarkedPdf ? markedPdfUrl : pdfUrl;
  const toggleStudentPanel = () => {
    const panel = studentPanelRef.current;
    if (!panel) return;
    const nextOpen = !panel.open;
    panel.open = nextOpen;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    if (nextOpen) {
      window.setTimeout(() => studentSearchInputRef.current?.focus(), 180);
    }
  };
  const scrollToPanel = (panel: HTMLElement | null) => {
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openCoverEditorAndFocus = (
    field: "studentName" | "studentId" | "unitCode" | "assignmentCode" | "submissionDate"
  ) => {
    const panel = coverEditorRef.current;
    if (panel) {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const focusMap = {
      studentName: coverStudentNameRef,
      studentId: coverStudentIdRef,
      unitCode: coverUnitCodeRef,
      assignmentCode: coverAssignmentCodeRef,
      submissionDate: coverSubmissionDateRef,
    } as const;
    window.setTimeout(() => focusMap[field].current?.focus(), 180);
  };
  const canRunGrading =
    !!submission?.student &&
    !!submission?.assignment &&
    (latestRun?.status === "DONE" || latestRun?.status === "NEEDS_OCR") &&
    !gradingBusy;
  const gradingDisabledReason = gradingBusy
    ? "Grading is already running."
    : !submission?.student
      ? "Link a student first."
      : !submission?.assignment
        ? "Link assignment/brief first."
        : !(latestRun?.status === "DONE" || latestRun?.status === "NEEDS_OCR")
          ? "Run extraction before grading."
          : "";
  const pdfViewportClass =
    pdfViewport === "compact"
      ? "h-[52vh] min-h-[420px] md:h-[62vh] xl:h-[68vh]"
      : pdfViewport === "full"
        ? "h-[72vh] min-h-[620px] md:h-[82vh] xl:h-[90vh]"
        : "h-[62vh] min-h-[540px] md:h-[72vh] xl:h-[82vh]";

  useEffect(() => {
    if (pdfView === "marked" && !hasMarkedPdf) {
      setPdfView("original");
    }
  }, [pdfView, hasMarkedPdf]);

  useEffect(() => {
    if (!gradingHistory.length) {
      if (selectedAssessmentId) setSelectedAssessmentId("");
      return;
    }
    if (!selectedAssessmentId || !gradingHistory.some((a) => a.id === selectedAssessmentId)) {
      setSelectedAssessmentId(gradingHistory[0].id);
    }
  }, [gradingHistory, selectedAssessmentId]);

  useEffect(() => {
    const a = selectedAssessment;
    if (!a) {
      setFeedbackDraft("");
      setFeedbackStudentName("");
      setFeedbackAssessorName("");
      setFeedbackMarkedDate("");
      return;
    }
    const rj: any = a.resultJson || {};
    const override = rj?.feedbackOverride || {};
    const studentName = String(override?.studentName || rj?.studentFirstNameUsed || submission?.student?.fullName || coverStudentName || "").trim();
    const assessorName = String(override?.assessorName || rj?.gradedBy || "").trim();
    const dateCandidate = String(override?.markedDate || "").trim();
    const iso = dateCandidate || String(a.createdAt || "");
    const d = new Date(iso);
    const dateInput = Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    setFeedbackDraft(String(a.feedbackText || ""));
    setFeedbackStudentName(studentName);
    setFeedbackAssessorName(assessorName);
    setFeedbackMarkedDate(dateInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssessment?.id]);

  async function saveAssessmentFeedback() {
    if (!submissionId || !selectedAssessment?.id) return;
    if (!feedbackDraft.trim()) {
      setErr("Feedback text cannot be empty.");
      return;
    }
    setFeedbackEditorBusy(true);
    setErr("");
    setMsg("");
    try {
      await jsonFetch(`/api/submissions/${submissionId}/assessments/${selectedAssessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackText: feedbackDraft,
          studentName: feedbackStudentName,
          assessorName: feedbackAssessorName,
          markedDate: feedbackMarkedDate || null,
        }),
      });
      await refresh();
      setMsg("Audit feedback updated and marked PDF regenerated.");
      notifyToast("success", "Feedback applied to marked PDF.");
    } catch (e: any) {
      const message = e?.message || "Failed to update feedback.";
      setErr(message);
      notifyToast("error", message);
    } finally {
      setFeedbackEditorBusy(false);
    }
  }

  useEffect(() => {
    if (!latestRun) return;
    if (!coverEditorRef.current?.open) return;
    const t = setTimeout(() => {
      void saveCoverMetadata({ silent: true });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverStudentName, coverStudentId, coverUnitCode, coverAssignmentCode, coverSubmissionDate, latestRun?.id]);

  useEffect(() => {
    if (!runGradeWhenReady) return;
    if (!canRunGrading) return;
    void runGrading();
    setRunGradeWhenReady(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runGradeWhenReady, canRunGrading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = String(target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const k = e.key.toLowerCase();
      if (k === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (k === "e") {
        e.preventDefault();
        void runExtraction();
      } else if (k === "g") {
        e.preventDefault();
        if (canRunGrading) void runGrading();
      } else if (k === "s") {
        e.preventDefault();
        toggleStudentPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRunGrading]);

  return (
    <main className="py-2">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold text-zinc-500">Submission Review Workspace</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {submission?.student?.fullName || triageInfo?.studentName || "Unlinked student"} · {submission?.filename || "Submission"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Unit {submission?.assignment?.unitCode || triageInfo?.unitCode || "—"} · Assignment {submission?.assignment?.assignmentRef || triageInfo?.assignmentRef || "—"} · Status {submission?.status || "—"}.
            Review evidence, complete metadata, and finalize grade-ready outputs.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col items-start">
            <Link
              href="/submissions"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
            >
              ← Back
            </Link>
            <span className="mt-1 text-xs opacity-0">placeholder</span>
          </div>
          <div className="flex flex-col items-start">
            <button
              type="button"
              onClick={runExtraction}
              disabled={busy || submission?.status === "EXTRACTING"}
              className={cx(
                "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm",
                busy || submission?.status === "EXTRACTING"
                  ? "cursor-not-allowed bg-zinc-300 text-zinc-700"
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              {busy || submission?.status === "EXTRACTING" ? "Processing…" : "Run extraction"}
            </button>
            <span className="mt-1 text-xs opacity-0">placeholder</span>
          </div>
          <div ref={gradingPanelRef} className="flex flex-col items-center">
            <button
              type="button"
              onClick={runGrading}
              disabled={!canRunGrading}
              className={cx(
                "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm",
                canRunGrading
                  ? "bg-sky-700 text-white hover:bg-sky-800"
                  : "cursor-not-allowed bg-zinc-300 text-zinc-700"
              )}
            >
              {gradingBusy ? "Grading…" : "Run grading"}
            </button>
            <button
              type="button"
              onClick={() => setGradingConfigOpen(true)}
              className="mt-1 text-xs font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-800"
            >
              Grading config
            </button>
          </div>
        </div>
      </div>

      {!canRunGrading && gradingDisabledReason ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Grading blocked: {gradingDisabledReason}
        </div>
      ) : null}

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
      {gradingConfigOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Grading config</div>
                <div className="mt-1 text-sm text-zinc-700">Configure settings used when you run grading.</div>
              </div>
              <button
                type="button"
                onClick={() => setGradingConfigOpen(false)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300"
                checked={useRubric}
                onChange={(e) => setUseRubric(e.target.checked)}
              />
              Use rubric when linked to this brief
            </label>
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
              Model: {gradingCfg?.model || "default"} · Feedback bullets: {gradingCfg?.maxFeedbackBullets ?? 6}
            </div>
          </div>
        </div>
      ) : null}
      {shortcutsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Keyboard shortcuts</div>
                <div className="mt-1 text-sm text-zinc-700">Quick actions for this submission page.</div>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
              <div><span className="font-semibold text-zinc-900">?</span> Toggle this shortcuts panel</div>
              <div><span className="font-semibold text-zinc-900">E</span> Run extraction</div>
              <div><span className="font-semibold text-zinc-900">G</span> Run grading (when ready)</div>
              <div><span className="font-semibold text-zinc-900">S</span> Toggle student panel</div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-3 flex flex-wrap items-center gap-2">
        {[
          { key: "checklist", label: "Checklist", ok: checklist.readyToUpload, onClick: () => scrollToPanel(workflowPanelRef.current) },
          { key: "student", label: "Student", ok: checklist.studentLinked, onClick: () => scrollToPanel(studentPanelRef.current) },
          { key: "assignment", label: "Assignment", ok: checklist.assignmentLinked, onClick: () => scrollToPanel(assignmentPanelRef.current) },
          { key: "extraction", label: "Extraction", ok: checklist.extractionComplete, onClick: () => scrollToPanel(extractionPanelRef.current) },
          { key: "grading", label: "Grading", ok: checklist.gradeGenerated, onClick: () => scrollToPanel(gradingPanelRef.current) },
          { key: "outputs", label: "Outputs", ok: checklist.feedbackGenerated && checklist.markedPdfGenerated, onClick: () => scrollToPanel(outputsPanelRef.current) },
        ].map((nav) => (
          <button key={nav.key} type="button" onClick={nav.onClick} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <span className={cx("h-1.5 w-1.5 rounded-full", nav.ok ? "bg-emerald-500" : "bg-amber-500")} />
            {nav.label}
          </button>
        ))}
        <button type="button" onClick={() => setShortcutsOpen(true)} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          Shortcuts (?)
        </button>
      </section>

      <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            {
              key: "student",
              label: "Student",
              value: submission?.student?.fullName || triageInfo?.studentName || "Unlinked",
              actionable: true,
              actionLabel: !String(coverMeta?.studentName?.value || "").trim() ? "Add cover name" : "Toggle student panel",
              onAction: !String(coverMeta?.studentName?.value || "").trim()
                ? () => openCoverEditorAndFocus("studentName")
                : toggleStudentPanel,
            },
            {
              key: "studentId",
              label: "Student ID",
              value: String(coverMeta?.studentId?.value || "Missing"),
              actionable: !String(coverMeta?.studentId?.value || "").trim(),
              actionLabel: "Add",
              onAction: () => openCoverEditorAndFocus("studentId"),
            },
            {
              key: "unit",
              label: "Unit",
              value:
                submission?.assignment?.unitCode ||
                triageInfo?.unitCode ||
                String(coverMeta?.unitCode?.value || "—"),
              actionable: !String(coverMeta?.unitCode?.value || "").trim(),
              actionLabel: "Add",
              onAction: () => openCoverEditorAndFocus("unitCode"),
            },
            {
              key: "assignment",
              label: "Assignment",
              value:
                submission?.assignment?.assignmentRef ||
                triageInfo?.assignmentRef ||
                String(coverMeta?.assignmentCode?.value || "—"),
              actionable: true,
              actionLabel: submission?.assignment ? "Open assignment panel" : "Add",
              onAction: submission?.assignment
                ? () => scrollToPanel(assignmentPanelRef.current)
                : () => openCoverEditorAndFocus("assignmentCode"),
            },
            {
              key: "submissionDate",
              label: "Submission Date",
              value: String(coverMeta?.submissionDate?.value || "Missing"),
              actionable: !String(coverMeta?.submissionDate?.value || "").trim(),
              actionLabel: "Add",
              onAction: () => openCoverEditorAndFocus("submissionDate"),
            },
            {
              key: "grade",
              label: "Grade",
              value: latestAssessment?.overallGrade || "Pending",
              actionable: true,
              actionLabel: canRunGrading ? "Run grading" : "Open checklist",
              onAction: canRunGrading ? () => void runGrading() : () => scrollToPanel(workflowPanelRef.current),
            },
            { key: "gradedBy", label: "Graded by", value: String(latestAssessment?.resultJson?.gradedBy || "—"), actionable: false },
            { key: "uploaded", label: "Uploaded", value: safeDate(submission?.uploadedAt), actionable: false },
            { key: "gradedWhen", label: "Graded when", value: safeDate(latestAssessment?.createdAt), actionable: false },
            {
              key: "status",
              label: "Status",
              value: submission?.status || "—",
              actionable: true,
              actionLabel: "Open checklist",
              onAction: () => scrollToPanel(workflowPanelRef.current),
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.actionable ? item.onAction : undefined}
              className={cx(
                "flex h-16 min-w-[150px] flex-col justify-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left",
                item.actionable ? "cursor-pointer hover:border-sky-300 hover:bg-sky-50" : "cursor-default"
              )}
              title={item.actionable ? item.actionLabel : undefined}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{item.label}</div>
              <div className="max-w-[170px] truncate text-[12px] font-semibold text-zinc-900">{item.value}</div>
              {item.actionable ? (
                <div className="text-[10px] font-semibold text-sky-700">Click to {item.actionLabel?.toLowerCase() || "update"}</div>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      {changeChips.length ? (
        <section className="mb-3 flex flex-wrap items-center gap-1.5">
          {changeChips.map((chip) => (
            <span key={chip} className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
              {chip}
            </span>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        {/* RIGHT: PDF */}
        <div className="order-2 lg:order-2 lg:col-span-2">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
              <div className="flex items-center gap-3">
                <StatusPill>{submission?.status || "—"}</StatusPill>
                <div className="text-sm text-zinc-600">Submission document preview</div>
                <div className="ml-2 inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPdfView("original")}
                    className={cx(
                      "rounded-md px-2 py-1 text-xs font-semibold",
                      pdfView === "original" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-white"
                    )}
                  >
                    Student submission
                  </button>
                  <button
                    type="button"
                    onClick={() => hasMarkedPdf && setPdfView("marked")}
                    disabled={!hasMarkedPdf}
                    className={cx(
                      "rounded-md px-2 py-1 text-xs font-semibold",
                      !hasMarkedPdf
                        ? "cursor-not-allowed text-zinc-400"
                        : pdfView === "marked"
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-700 hover:bg-white"
                    )}
                    title={!hasMarkedPdf ? "Run grading to generate a marked PDF." : "View graded PDF with feedback overlays."}
                  >
                    Marked version
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">
                  Viewport
                  <select
                    value={pdfViewport}
                    onChange={(e) => setPdfViewport(e.target.value as any)}
                    className="ml-1 rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs"
                  >
                    <option value="compact">Compact</option>
                    <option value="comfort">Comfort</option>
                    <option value="full">Full</option>
                  </select>
                </label>
                <div className="text-xs text-zinc-500">
                  {pdfView === "marked" && hasMarkedPdf ? "Marked PDF" : "Source PDF"}
                </div>
              </div>
            </div>

            <div className={`${pdfViewportClass} w-full bg-zinc-50`}>
              {/* PDF render (works for scanned + digital PDFs) */}
              {submissionId ? (
                <iframe
                  title="Submission PDF"
                  src={activePdfUrl}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-600">Loading…</div>
              )}
            </div>
          </div>
        </div>

        {/* LEFT: Metadata + extraction */}
        <div className="order-1 grid gap-4 lg:order-1 lg:sticky lg:top-3 lg:max-h-[86vh] lg:overflow-y-auto">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Quick actions</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runExtraction}
                disabled={busy}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  busy ? "cursor-not-allowed bg-zinc-200 text-zinc-500" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
              >
                Run extraction
              </button>
              <button
                type="button"
                onClick={runGrading}
                disabled={!canRunGrading}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  canRunGrading ? "bg-sky-700 text-white hover:bg-sky-800" : "cursor-not-allowed bg-zinc-200 text-zinc-500"
                )}
              >
                Run grading
              </button>
              <button
                type="button"
                onClick={() => void saveCoverMetadata()}
                disabled={coverEditBusy || !latestRun}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  coverEditBusy || !latestRun ? "cursor-not-allowed bg-zinc-200 text-zinc-500" : "bg-emerald-700 text-white hover:bg-emerald-800"
                )}
              >
                Save cover
              </button>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-zinc-300"
                checked={runGradeWhenReady}
                onChange={(e) => setRunGradeWhenReady(e.target.checked)}
              />
              Run grading when ready
            </label>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div ref={workflowPanelRef} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-500">Totara upload checklist</div>
                <div className="mt-1 text-sm text-zinc-600">Smart readiness check with next blocking action.</div>
              </div>
              {checklist.readyToUpload ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  ✓ Ready
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  {checklist.pendingCount} pending
                </span>
              )}
            </div>

            <ul className="mt-3 space-y-2 text-sm">
              {checklist.items.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-zinc-700">{item.label}</span>
                    {!item.ok ? <div className="text-[11px] text-zinc-500">{item.hint}</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cx("font-semibold", item.ok ? "text-emerald-700" : "text-amber-700")}>
                      {item.ok ? "OK" : "Pending"}
                    </span>
                    {!item.ok ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (item.key === "student") return toggleStudentPanel();
                          if (item.key === "assignment") return scrollToPanel(assignmentPanelRef.current);
                          if (item.key === "extraction") return void runExtraction();
                          if (item.key === "grade") {
                            if (canRunGrading) return void runGrading();
                            return scrollToPanel(gradingPanelRef.current);
                          }
                          if (item.key === "feedback" || item.key === "marked") {
                            if (canRunGrading) return void runGrading();
                            return scrollToPanel(outputsPanelRef.current);
                          }
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Fix now
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <div
              className={cx(
                "mt-3 rounded-xl border p-3 text-xs",
                checklist.readyToUpload
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              )}
            >
              {checklist.nextBlockingAction}
            </div>
          </div>

          <details ref={studentPanelRef} id="student-link-panel" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">Student</summary>
            <div className="mt-3 flex items-start justify-between gap-3">
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
                    ref={studentSearchInputRef}
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
          </details>

          <details ref={assignmentPanelRef} open className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">Assignment</summary>
            <div className="mt-3 text-lg font-semibold text-zinc-900">
              {submission?.assignment ? `${submission.assignment.unitCode} ${submission.assignment.assignmentRef || ""}`.trim() : "Unassigned"}
            </div>
            <div className="mt-1 text-sm text-zinc-600">{submission?.assignment?.title || "—"}</div>

            {triageInfo?.coverage?.missing?.length ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="text-xs font-semibold uppercase tracking-wide">Reference coverage</div>
                <div className="mt-2">Missing: {triageInfo.coverage.missing.join(", ")}</div>
              </div>
            ) : null}
          </details>

          <details ref={extractionPanelRef} open className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <summary className="cursor-pointer border-b border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Extraction</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {latestRun ? `Latest run · ${latestRun.engineVersion}` : "Not run yet"}
                  </div>
                </div>
                {latestRun ? (
                  <div className="text-xs text-zinc-500">
                    {latestRun.status} · Confidence {Math.round((latestRun.overallConfidence || 0) * 100)}%
                    {extractionMode ? ` · Mode ${extractionMode}` : ""}
                  </div>
                ) : null}
              </div>
            </summary>

            <div className="p-4">
              {!latestRun ? (
                <div className="text-sm text-zinc-600">
                  No extraction yet. Click <span className="font-semibold">Run extraction</span> to collect cover metadata and page samples for grading.
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

                  {extractionMode === "COVER_ONLY" && !coverReady ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="text-xs font-semibold uppercase tracking-wide">Cover metadata incomplete</div>
                      <div className="mt-1">
                        Grading can continue. Add or correct cover details in this page if needed for record quality.
                      </div>
                    </div>
                  ) : null}

                  {latestRun ? (
                    <details ref={coverEditorRef} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide">Cover Metadata Editor</summary>
                      <div className="mt-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide">Cover Metadata</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="text-xs">
                          <span className="font-semibold">Student</span>
                          <input
                            ref={coverStudentNameRef}
                            value={coverStudentName}
                            onChange={(e) => setCoverStudentName(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Student ID</span>
                          <input
                            ref={coverStudentIdRef}
                            value={coverStudentId}
                            onChange={(e) => setCoverStudentId(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Unit</span>
                          <input
                            ref={coverUnitCodeRef}
                            value={coverUnitCode}
                            onChange={(e) => setCoverUnitCode(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Assignment</span>
                          <input
                            ref={coverAssignmentCodeRef}
                            value={coverAssignmentCode}
                            onChange={(e) => setCoverAssignmentCode(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Submission Date</span>
                          <input
                            ref={coverSubmissionDateRef}
                            value={coverSubmissionDate}
                            onChange={(e) => setCoverSubmissionDate(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <div className="text-xs">
                          <span className="font-semibold">Extracted confidence:</span>{" "}
                          {Number(coverMeta?.confidence || 0).toFixed(2)}
                        </div>
                      </div>
                  <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => void saveCoverMetadata()}
                          disabled={coverEditBusy}
                          className={cx(
                            "inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold",
                            coverEditBusy
                              ? "cursor-not-allowed bg-emerald-200 text-emerald-800"
                              : "bg-emerald-700 text-white hover:bg-emerald-800"
                          )}
                        >
                          {coverEditBusy ? "Saving..." : "Save cover metadata"}
                        </button>
                        <span className="ml-2 text-[11px] text-emerald-900/80">
                          {coverSaveState === "saving"
                            ? "Autosaving…"
                            : coverSaveState === "saved"
                              ? "Saved"
                              : "Autosave idle"}
                        </span>
                      </div>
                      </div>
                    </details>
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

                  {pagesSorted.length ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {pagesSorted.map((p, idx) => (
                        <button
                          key={`thumb-${p.id}`}
                          type="button"
                          onClick={() => setActivePage(idx)}
                          className={cx(
                            "min-w-[120px] rounded-lg border px-2 py-1.5 text-left",
                            idx === activePage ? "border-sky-300 bg-sky-50" : "border-zinc-200 bg-white hover:bg-zinc-50"
                          )}
                        >
                          <div className="text-[11px] font-semibold text-zinc-800">Page {p.pageNumber}</div>
                          <div className="text-[10px] text-zinc-500">Conf {Math.round((p.confidence || 0) * 100)}%</div>
                          <div className="mt-1 line-clamp-2 text-[10px] text-zinc-600">
                            {String(p.text || "").trim() || "(No text preview)"}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="max-h-[42vh] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="whitespace-pre-wrap font-mono text-xs text-zinc-800">
                      {active?.text?.trim() ? active.text : "(No meaningful text on this page yet)"}
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    Tip: scanned/low-text pages can still proceed in cover-ready mode when identity metadata is extracted.
                  </div>
                </div>
              )}
            </div>
          </details>

          <details ref={outputsPanelRef} open className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">Audit & outputs</summary>
            <div className="mt-3 grid gap-2 text-sm">
              {gradingHistory.length ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  <span className="text-xs font-semibold text-zinc-700">Assessment run</span>
                  <select
                    value={selectedAssessmentId}
                    onChange={(e) => setSelectedAssessmentId(e.target.value)}
                    className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs"
                  >
                    {gradingHistory.map((g, idx) => (
                      <option key={g.id} value={g.id}>
                        {idx === 0 ? "Latest" : `Run ${gradingHistory.length - idx}`} · {safeDate(g.createdAt)} · {g.overallGrade || "—"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {previousAssessment && selectedAssessment?.id === latestAssessment?.id ? (
                <div className="text-[11px] text-zinc-500">
                  Previous run: {previousAssessment.overallGrade || "—"} at {safeDate(previousAssessment.createdAt)}
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-zinc-700">Selected grade</span>
                <span className="font-semibold text-zinc-900">{selectedAssessment?.overallGrade || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-700">Graded by</span>
                <span className="font-semibold text-zinc-900">{String(selectedAssessment?.resultJson?.gradedBy || "—")}</span>
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
                    selectedAssessment?.annotatedPdfPath
                      ? "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                      : "pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-400"
                  )}
                >
                  Marked PDF
                </a>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Feedback editor</div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="text-xs text-zinc-700">
                    Student name
                    <input
                      value={feedbackStudentName}
                      onChange={(e) => setFeedbackStudentName(e.target.value)}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900"
                    />
                  </label>
                  <label className="text-xs text-zinc-700">
                    Assessor
                    <input
                      value={feedbackAssessorName}
                      onChange={(e) => setFeedbackAssessorName(e.target.value)}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900"
                    />
                  </label>
                  <label className="text-xs text-zinc-700">
                    Date
                    <input
                      type="date"
                      value={feedbackMarkedDate}
                      onChange={(e) => setFeedbackMarkedDate(e.target.value)}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900"
                    />
                  </label>
                </div>
                <textarea
                  value={feedbackDraft}
                  onChange={(e) => setFeedbackDraft(e.target.value)}
                  rows={10}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900"
                  placeholder="Edit the feedback text shown in audit and marked PDF."
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={saveAssessmentFeedback}
                    disabled={!selectedAssessment?.id || feedbackEditorBusy}
                    className={cx(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold",
                      !selectedAssessment?.id || feedbackEditorBusy
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-500"
                        : "bg-zinc-900 text-white hover:bg-zinc-800"
                    )}
                  >
                    {feedbackEditorBusy ? "Applying…" : "Apply to marked version"}
                  </button>
                  <span className="text-[11px] text-zinc-500">
                    Saves audit output and regenerates marked PDF for this run.
                  </span>
                </div>
              </div>

              {feedbackHistory.length ? (
                <details className="rounded-xl border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Feedback Summary History ({feedbackHistory.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {feedbackHistory.map((row) => (
                      <div key={`fb-${row.id}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                        <div className="text-[11px] font-semibold text-zinc-800">
                          {row.index === 0 ? "Latest" : `Run ${feedbackHistory.length - row.index}`} · {row.grade} · {row.when}
                        </div>
                        <div className="mt-1 text-xs text-zinc-700">{row.summary}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {structuredGrading ? (
                <details className="rounded-xl border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Criterion Decisions · {String(structuredGrading?.overallGradeWord || structuredGrading?.overallGrade || "—")} · Resubmission: {Boolean(structuredGrading?.resubmissionRequired) ? "Yes" : "No"}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {(Array.isArray(structuredGrading?.criterionChecks) ? structuredGrading.criterionChecks : []).slice(0, 24).map((row: any, idx: number) => {
                      const decision = String(row?.decision || (row?.met === true ? "ACHIEVED" : row?.met === false ? "NOT_ACHIEVED" : "UNCLEAR")).toUpperCase();
                      const tone =
                        decision === "ACHIEVED"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : decision === "NOT_ACHIEVED"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-zinc-200 bg-zinc-50 text-zinc-800";
                      const rationale = String(row?.rationale || row?.comment || "").trim();
                      const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
                      const pages = Array.from(
                        new Set(
                          evidence
                            .map((ev: any) => Number(ev?.page))
                            .filter((n: number) => Number.isInteger(n) && n > 0)
                        )
                      ).slice(0, 8);
                      return (
                        <div key={`crit-${idx}`} className="rounded-lg border border-zinc-200 p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-900">
                              {String(row?.code || "—")}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{decision}</span>
                            {pages.length ? (
                              <span className="text-[11px] text-zinc-600">Pages: {pages.join(", ")}</span>
                            ) : null}
                          </div>
                          {rationale ? <div className="mt-1 text-xs text-zinc-700">{rationale}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}

              {modalityCompliance.hasData ? (
                <details className="rounded-xl border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Modality Compliance · Pass {modalityCompliance.passCount} · Review {modalityCompliance.failCount}
                  </summary>
                  <div className="mt-3 overflow-x-auto">
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
                </details>
              ) : null}
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
