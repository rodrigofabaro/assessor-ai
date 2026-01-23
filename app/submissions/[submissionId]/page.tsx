"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  student?: { name: string };
  assignment?: { unitCode: string; assignmentRef?: string | null; title: string };
  extractionRuns: ExtractionRun[];
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

export default function SubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = String(params?.submissionId || "");

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  const [viewMode, setViewMode] = useState<"single" | "continuous">("single");
  const [selectedIndex, setSelectedIndex] = useState(0);

  async function refresh() {
    if (!submissionId) return;
    const data = await jsonFetch<{ submission: Submission }>(`/api/submissions/${submissionId}`);
    setSubmission(data.submission);

    // Reset selection safely whenever we refresh
    setSelectedIndex(0);
  }

  useEffect(() => {
    if (!submissionId) return;
    refresh().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  const latestRun = submission?.extractionRuns?.[0] || null;

  const pagesSorted = useMemo(() => {
    const pages = latestRun?.pages ?? [];
    return [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  }, [latestRun]);

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

  function goPrev() {
    setSelectedIndex((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setSelectedIndex((i) => Math.min(pagesSorted.length - 1, i + 1));
  }

  async function runExtraction() {
    if (!submissionId) return;
    setErr("");
    setBusy(true);
    try {
      await jsonFetch(`/api/submissions/${submissionId}/extract`, { method: "POST" });
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1280,
        margin: "0 auto",
      }}
    >
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
          <div style={{ marginTop: 10, color: "#374151", display: "grid", gap: 6 }}>
            <div>
              <b>File:</b> {submission?.filename || "-"}
            </div>
            <div>
              <b>Student:</b> {submission?.student?.name || "-"}
            </div>
            <div>
              <b>Assignment:</b>{" "}
              {submission?.assignment
                ? `${submission.assignment.unitCode} ${submission.assignment.assignmentRef ?? ""} — ${submission.assignment.title}`
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
            {busy ? "Extracting..." : "Run extraction"}
          </button>
        </div>
      </div>

      {!submissionId && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fffbeb", color: "#92400e" }}>
          Missing submissionId in route.
        </div>
      )}

      {err && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fee2e2" }}>{err}</div>}

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

            {/* Main panels */}
            {pagesSorted.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "280px 1fr",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
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
                        onClick={goPrev}
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
                        onClick={goNext}
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
