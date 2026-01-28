"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

/* =========================
   Types
========================= */

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
  pages: ExtractedPage[];
};

type Submission = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  student?: { fullName: string } | null;
  assignment?: {
    unitCode: string;
    assignmentRef?: string | null;
    title: string;
  } | null;
  studentLinkedAt?: string | null;
  studentLinkedBy?: string | null;
  extractionRuns: ExtractionRun[];
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

type StudentSearchResult = {
  id: string;
  fullName: string;
  email?: string | null;
  externalRef?: string | null;
};

/* =========================
   Helpers
========================= */

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

function countWords(s: string) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

/* =========================
   Page
========================= */

export default function SubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = String(params?.submissionId || "");

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [triageInfo, setTriageInfo] = useState<TriageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Auto-run extraction when a submission is fresh (upload → magic begins).
  const autoStartedRef = useRef(false);

  /* ---------- Student linking state ---------- */
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentMsg, setStudentMsg] = useState("");

  /* ---------- Extraction helpers ---------- */
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

  const totalWords = useMemo(
    () => pagesSorted.reduce((acc, p) => acc + countWords(p.text), 0),
    [pagesSorted]
  );

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
    refresh().catch((e) => setErr(e.message));
  }, [submissionId]);

  // Auto-start extraction once for freshly uploaded submissions.
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
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
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
        const res = await jsonFetch<{ students: StudentSearchResult[] }>(
          `/api/students?query=${encodeURIComponent(q)}`
        );
        if (alive) setStudentResults(res.students || []);
      } catch {
        if (alive) setStudentResults([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [studentQuery]);

  /* =========================
     Student actions
  ========================= */

  async function linkStudent(studentId: string) {
    if (!studentId) return;
    setStudentBusy(true);
    setStudentMsg("");
    try {
      const res = await jsonFetch<{ submission: Submission }>(
        `/api/submissions/${submissionId}/link-student`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, actor: "Rodrigo" }),
        }
      );
      setSubmission(res.submission);
      setStudentMsg("Student linked.");
      await refresh();
    } catch (e: any) {
      setStudentMsg(e.message || "Link failed");
    } finally {
      setStudentBusy(false);
    }
  }

  async function unlinkStudent() {
    setStudentBusy(true);
    setStudentMsg("");
    try {
      const res = await jsonFetch<{ submission: Submission }>(
        `/api/submissions/${submissionId}/unlink-student`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor: "Rodrigo" }),
        }
      );
      setSubmission(res.submission);
      setStudentMsg("Student unlinked.");
      await refresh();
    } catch (e: any) {
      setStudentMsg(e.message || "Unlink failed");
    } finally {
      setStudentBusy(false);
    }
  }

  async function createStudentAndLink() {
    const fullName = newStudentName.trim();
    if (!fullName) return;
    setStudentBusy(true);
    try {
      const res = await jsonFetch<{ student: StudentSearchResult }>(`/api/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email: newStudentEmail || null }),
      });
      await linkStudent(res.student.id);
      setNewStudentName("");
      setNewStudentEmail("");
    } finally {
      setStudentBusy(false);
    }
  }

  /* =========================
     Render
  ========================= */

  return (
    <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <h1 style={{ fontSize: 30, fontWeight: 800 }}>Submission</h1>

      <div style={{ marginTop: 10 }}>
        <div><b>File:</b> {submission?.filename}</div>
        <div>
          <b>Student:</b> {submission?.student?.fullName ?? "Unlinked"}
          {!submission?.student?.fullName && triageInfo?.studentName && (
            <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 13 }}>
              (detected: {triageInfo.studentName})
            </span>
          )}
        </div>
        <div><b>Unit:</b> {submission?.assignment?.unitCode ?? "-"}</div>
        <div><b>Assignment:</b> {submission?.assignment?.assignmentRef ?? "-"}</div>
        <div><b>Status:</b> {submission?.status}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={runExtraction}
          disabled={busy || submission?.status === "EXTRACTING"}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: busy || submission?.status === "EXTRACTING" ? "#9ca3af" : "#111827",
            color: "white",
            cursor: busy || submission?.status === "EXTRACTING" ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {busy || submission?.status === "EXTRACTING"
            ? "Processing…"
            : submission?.extractionRuns?.length
            ? "Re-run extraction"
            : "Start processing"}
        </button>{" "}
        <Link href="/submissions">Back</Link>
      </div>

      {/* =========================
          STUDENT LINKING PANEL
      ========================= */}
      <details style={{ marginTop: 20, border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <summary style={{ cursor: "pointer", padding: 14, fontWeight: 800 }}>
          Student linking
          <span style={{ marginLeft: 10, fontWeight: 600, color: "#6b7280" }}>
            {submission?.student?.fullName ? "✅ Linked" : "— Unlinked"}
          </span>
        </summary>

        <div style={{ padding: 14, paddingTop: 8 }}>

        <div>
          <b>Linked:</b> {submission?.student?.fullName ?? "—"}
          {submission?.student && (
            <>
              {" "}
              <button onClick={unlinkStudent} disabled={studentBusy}>Unlink</button>
            </>
          )}
        </div>

        {studentMsg && <div style={{ marginTop: 6 }}>{studentMsg}</div>}

        {!submission?.student && (
          <>
            <div style={{ marginTop: 12 }}>
              <input
                placeholder="Search student…"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
              />
            </div>

            {studentResults.map((s) => (
              <div key={s.id}>
                <label>
                  <input
                    type="radio"
                    name="student"
                    value={s.id}
                    checked={selectedStudentId === s.id}
                    onChange={() => setSelectedStudentId(s.id)}
                  />{" "}
                  {s.fullName} {s.email ? `(${s.email})` : ""}
                </label>
              </div>
            ))}

            <button
              onClick={() => linkStudent(selectedStudentId)}
              disabled={!selectedStudentId || studentBusy}
            >
              Link selected
            </button>

            <hr />

            <div>
              <input
                placeholder="New student name"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
              />
              <input
                placeholder="Email (optional)"
                value={newStudentEmail}
                onChange={(e) => setNewStudentEmail(e.target.value)}
              />
              <button onClick={createStudentAndLink} disabled={!newStudentName}>
                Create & link
              </button>
            </div>
          </>
        )}
        </div>
      </details>

      {/* =========================
          EXTRACTION INFO
      ========================= */}
      {latestRun && (
        <section style={{ marginTop: 20 }}>
          <h3>Latest extraction</h3>
          <div>Words: {totalWords.toLocaleString()}</div>
          <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
            {pagesSorted.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join("\n\n")}
          </pre>
        </section>
      )}

      {err && <div style={{ marginTop: 20, color: "red" }}>{err}</div>}
    </main>
  );
}
