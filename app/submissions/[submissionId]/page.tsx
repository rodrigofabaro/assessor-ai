"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type ExtractedPage = {
  id: string;
  pageNumber: number;
  text: string;
  confidence: number;
  width?: number | null;
  height?: number | null;
};

type ExtractionRun = {
  id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "NEEDS_OCR" | "FAILED";
  isScanned: boolean;
  overallConfidence: number | null;
  engineVersion: string;
  startedAt: string;
  finishedAt?: string | null;
  warnings?: any | null;
  error?: string | null;
  pages: ExtractedPage[];
};

type Submission = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  student?: { name: string } | null;
  assignment?: { unitCode: string; assignmentRef?: string | null; title: string } | null;
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


async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

function countWords(s: string) {
  const t = (s || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function sortPages(run: ExtractionRun | null) {
  const pages = run?.pages ?? [];
  return [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
}

export default function SubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = String(params?.submissionId || "");

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  const [triageInfo, setTriageInfo] = useState<TriageInfo | null>(null);

  const [viewMode, setViewMode] = useState<"single" | "continuous">("single");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const refreshSeq = useRef(0);

  // Robust “latest” run selection (don’t trust array order from DB)
  const latestRun = useMemo(() => {
    const runs = submission?.extractionRuns ?? [];
    if (!runs.length) return null;

    return [...runs].sort((a, b) => {
      const aTime = new Date(a.finishedAt ?? a.startedAt).getTime();
      const bTime = new Date(b.finishedAt ?? b.startedAt).getTime();
      return bTime - aTime;
    })[0];
  }, [submission]);

  const pagesSorted = useMemo(() => sortPages(latestRun), [latestRun]);

  const selectedPage = useMemo(() => {
    if (!pagesSorted.length) return null;
    const idx = Math.min(Math.max(selectedIndex, 0), pagesSorted.length - 1);
    return pagesSorted[idx];
  }, [pagesSorted, selectedIndex]);

  const totalWords = useMemo(() => {
    return pagesSorted.reduce((acc, p) => acc + countWords(p.text || ""), 0);
  }, [pagesSorted]);

  const previewText = useMemo(() => {
    if (!pagesSorted.length) return "";
    if (viewMode === "continuous") {
      return pagesSorted
        .map((p) => `\n\n----- Page ${p.pageNumber} -----\n\n${p.text || ""}`.trimEnd())
        .join("\n");
    }
    return selectedPage?.text || "";
  }, [pagesSorted, selectedPage, viewMode]);

  async function refresh() {
    if (!submissionId) return;

    // Preserve selection by pageNumber (not index) across refreshes
    const currentPages = pagesSorted;
    const currentIdx = Math.min(Math.max(selectedIndex, 0), Math.max(0, currentPages.length - 1));
    const currentSelectedPageNumber = currentPages[currentIdx]?.pageNumber ?? null;

    const seq = ++refreshSeq.current;

    // Cache-bust to avoid “sticky” data in dev/prod edge cases
    const data = await jsonFetch<{ submission: Submission }>(`/api/submissions/${submissionId}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (seq !== refreshSeq.current) return; // ignore out-of-order responses
    setSubmission(data.submission);

    // Rebuild pages from the new response
    const newRuns = data.submission?.extractionRuns ?? [];
    const newLatest =
      newRuns.length === 0
        ? null
        : [...newRuns].sort((a, b) => {
            const aTime = new Date(a.finishedAt ?? a.startedAt).getTime();
            const bTime = new Date(b.finishedAt ?? b.startedAt).getTime();
            return bTime - aTime;
          })[0];
    const newPages = sortPages(newLatest);

    if (!newPages.length) {
      setSelectedIndex(0);
      return;
    }

    if (currentSelectedPageNumber != null) {
      const foundIdx = newPages.findIndex((p) => p.pageNumber === currentSelectedPageNumber);
      setSelectedIndex(foundIdx >= 0 ? foundIdx : 0);
    } else {
      setSelectedIndex(0);
    }
  }

  useEffect(() => {
    if (!submissionId) return;
    let alive = true;
    setErr("");
    refresh().catch((e) => alive && setErr(String(e?.message || e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  async function runExtraction() {
    if (!submissionId) return;
    setErr("");
    setTriageInfo(null);
    setBusy(true);

    try {
      // 1) extraction (authoritative)
      await jsonFetch(`/api/submissions/${submissionId}/extract`, { method: "POST" });

      // 2) triage (best-effort; should not block)
      try {
        const triageRes = await jsonFetch<{ submission: Submission; triage?: TriageInfo }>(
          `/api/submissions/${submissionId}/triage`,
          { method: "POST" }
        );

        setTriageInfo(triageRes.triage ?? null);

        // update header immediately from triage response if provided
        if (triageRes.submission) setSubmission(triageRes.submission);
      } catch (e: any) {
        setTriageInfo({
          warnings: [`Triage request failed: ${e?.message || String(e)}`],
        });
      }

      // 3) refresh (pull latest from GET)
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // Helpful derived: show detected unit/assignment even if not linked yet
  const detectedUnit = triageInfo?.unitCode ?? null;
  const detectedAssignment = triageInfo?.assignmentRef ?? null;

  return (
    <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 320 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>Submission</h1>

          {/* Unit and Assignment are separate */}
          <div style={{ marginTop: 10, color: "#374151", display: "grid", gap: 6 }}>
            <div>
              <b>File:</b> {submission?.filename || "-"}
            </div>
            <div>
              <b>Student:</b> {submission?.student?.name || "-"}
            </div>
            <div>
              <b>Unit:</b> {submission?.assignment?.unitCode || "-"}
            </div>
            <div>
              <b>Assignment:</b>{" "}
              {submission?.assignment
                ? `${submission.assignment.assignmentRef ?? "-"} — ${submission.assignment.title}`
                : "-"}
            </div>
            <div>
              <b>Status:</b> {submission?.status || "-"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/submissions" style={{ textDecoration: "underline", color: "#111827" }}>
            Back
          </Link>

          <button
            onClick={runExtraction}
            disabled={busy || !submissionId}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: busy ? "#9ca3af" : "#111827",
              color: "white",
              cursor: busy || !submissionId ? "not-allowed" : "pointer",
              opacity: submissionId ? 1 : 0.6,
              fontWeight: 700,
            }}
          >
            {busy ? "Extracting..." : "Extract"}
          </button>
        </div>
      </div>

      {!submissionId && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fffbeb", color: "#92400e" }}>
          Missing submissionId in route.
        </div>
      )}

      {err && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fee2e2" }}>{err}</div>}

      {triageInfo && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Triage notes (auto-fill)</div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: "#111827", fontSize: 13 }}>
            <div>
              <b>Detected unit:</b> {triageInfo.unitCode ?? "-"}
            </div>
            <div>
              <b>Detected assignment:</b> {triageInfo.assignmentRef ?? "-"}
            </div>
            <div>
              <b>Detected email:</b> {triageInfo.email ?? "-"}
            </div>
            <div>
              <b>Detected name:</b> {triageInfo.studentName ?? "-"}
              {triageInfo.studentDetection && (
  <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
    {triageInfo.studentDetection.linked
      ? "✅ linked"
      : triageInfo.studentDetection.detected
      ? "🟡 detected (not linked)"
      : "❌ not detected"}
  </span>
)}

            </div>
          </div>

          {/* ✅ Reference coverage alarm */}
          {triageInfo.coverage && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#7f1d1d",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Reference coverage (required for grading)</div>

              <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <div>
                  <b>Detected:</b>{" "}
                  {detectedUnit ? `Unit ${detectedUnit}` : "Unit -"}{" "}
                  {detectedAssignment ? ` / ${detectedAssignment}` : ""}
                </div>
                <div>
                  <b>Unit SPEC:</b> {triageInfo.coverage.hasUnitSpec ? "✅ Found (LOCKED)" : "❌ Missing"}
                </div>
                <div>
                  <b>Assignment BRIEF:</b> {triageInfo.coverage.hasAssignmentBrief ? "✅ Found (LOCKED)" : "❌ Missing"}
                </div>

                {Array.isArray(triageInfo.coverage.missing) && triageInfo.coverage.missing.length > 0 && (
                  <ul style={{ margin: "6px 0 0 0", paddingLeft: 18 }}>
                    {triageInfo.coverage.missing.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                )}

                {(!triageInfo.coverage.hasUnitSpec || !triageInfo.coverage.hasAssignmentBrief) && (
                  <div style={{ marginTop: 6 }}>
                    Grading should stay disabled until the missing references are uploaded and <b>LOCKED</b>.
                  </div>
                )}
              </div>
            </div>
          )}

          {Array.isArray(triageInfo.warnings) && triageInfo.warnings.length > 0 && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fff7ed", color: "#9a3412" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Warnings</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {triageInfo.warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(triageInfo.sampleLines) && triageInfo.sampleLines.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "#374151", fontWeight: 700 }}>
                Show sample lines used for detection
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  whiteSpace: "pre-wrap",
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 12,
                  color: "#111827",
                }}
              >
                {triageInfo.sampleLines.join("\n")}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Latest extraction */}
      <section style={{ marginTop: 20, padding: 16, border: "1px solid #e5e7eb", borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Latest extraction</h2>

        {!latestRun && <div style={{ marginTop: 10, color: "#374151" }}>No extraction run yet.</div>}

        {latestRun && (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "#111827" }}>
              <div>
                <b>Status:</b> {latestRun.status}
              </div>
              <div>
                <b>Scanned:</b> {latestRun.isScanned ? "Yes" : "No"}
              </div>
              <div>
                <b>Confidence:</b> {latestRun.overallConfidence?.toFixed(2) ?? "-"}
              </div>
              <div>
                <b>Words:</b> {totalWords.toLocaleString()}
              </div>
              <div>
                <b>Engine:</b> {latestRun.engineVersion}
              </div>
              <div>
                <b>Started:</b> {new Date(latestRun.startedAt).toLocaleString()}
              </div>
            </div>

            {Array.isArray(latestRun.warnings) && latestRun.warnings.length > 0 && (
              <div style={{ padding: 12, borderRadius: 12, background: "#f3f4f6", color: "#111827" }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Extractor notes</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 13 }}>
                  {latestRun.warnings.map((w: any, idx: number) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      {String(w)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pagesSorted.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, alignItems: "stretch" }}>
                {/* Pages list */}
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    height: "min(62vh, 640px)",
                    overflow: "auto",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                    Pages <span style={{ color: "#6b7280", fontWeight: 600 }}>({pagesSorted.length})</span>
                  </div>

                  {pagesSorted.map((p, idx) => {
                    const words = countWords(p.text || "");
                    const selected = idx === Math.min(Math.max(selectedIndex, 0), pagesSorted.length - 1);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedIndex(idx)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 10px",
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: selected ? "#eef2ff" : "white",
                          cursor: "pointer",
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 800 }}>Page {p.pageNumber}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{words.toLocaleString()} words</div>
                        </div>
                        <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                          conf {p.confidence.toFixed(2)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Preview */}
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    height: "min(62vh, 640px)",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>Text preview</div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                        disabled={selectedIndex <= 0 || viewMode === "continuous"}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "white",
                          cursor: selectedIndex <= 0 || viewMode === "continuous" ? "not-allowed" : "pointer",
                          opacity: selectedIndex <= 0 || viewMode === "continuous" ? 0.5 : 1,
                        }}
                      >
                        ◀ Prev
                      </button>

                      <button
                        onClick={() => setSelectedIndex((i) => Math.min(pagesSorted.length - 1, i + 1))}
                        disabled={selectedIndex >= pagesSorted.length - 1 || viewMode === "continuous"}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "white",
                          cursor:
                            selectedIndex >= pagesSorted.length - 1 || viewMode === "continuous"
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            selectedIndex >= pagesSorted.length - 1 || viewMode === "continuous" ? 0.5 : 1,
                        }}
                      >
                        Next ▶
                      </button>

                      <select
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value as any)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "white",
                        }}
                      >
                        <option value="single">Single page</option>
                        <option value="continuous">Continuous</option>
                      </select>

                      <div style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {viewMode === "single" && selectedPage ? `Page ${selectedPage.pageNumber}` : "All pages"}
                      </div>
                    </div>
                  </div>

                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      marginTop: 10,
                      fontSize: 13,
                      lineHeight: 1.5,
                      background: "#f9fafb",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid #e5e7eb",
                      overflow: "auto",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {previewText || "(empty)"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Responsive stacking */}
      <style jsx>{`
        @media (max-width: 980px) {
          section :global(div[style*="grid-template-columns: 280px 1fr"]) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
