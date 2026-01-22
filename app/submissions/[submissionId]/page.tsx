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
  extractedText?: string | null;
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

export default function SubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = String(params?.submissionId || "");

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  const [selectedPage, setSelectedPage] = useState<number>(1);

  async function refresh() {
    if (!submissionId) return;
    const data = await jsonFetch<{ submission: Submission }>(`/api/submissions/${submissionId}`);
    setSubmission(data.submission);
    const firstPage = data.submission?.extractionRuns?.[0]?.pages?.[0]?.pageNumber;
    if (firstPage) setSelectedPage(firstPage);
  }

  useEffect(() => {
    if (!submissionId) return;
    refresh().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  const latestRun = submission?.extractionRuns?.[0] || null;

  const selectedPageObj = useMemo(() => {
    if (!latestRun) return null;
    return latestRun.pages.find((p) => p.pageNumber === selectedPage) || latestRun.pages[0] || null;
  }, [latestRun, selectedPage]);

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
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Submission</h1>
          <div style={{ marginTop: 6, color: "#374151" }}>
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

      {err && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fee2e2" }}>{err}</div>
      )}

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Latest extraction</h2>

        {!latestRun && <div style={{ marginTop: 10, color: "#374151" }}>No extraction run yet.</div>}

        {latestRun && (
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
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
                <b>Engine:</b> {latestRun.engineVersion}
              </div>
              <div>
                <b>Started:</b> {new Date(latestRun.startedAt).toLocaleString()}
              </div>
            </div>

            {latestRun.status === "FAILED" && latestRun.error && (
              <div style={{ padding: 12, borderRadius: 10, background: "#fff7ed", color: "#9a3412" }}>
                <b>Error:</b> {latestRun.error}
              </div>
            )}

            {latestRun.status === "NEEDS_OCR" && (
              <div style={{ padding: 12, borderRadius: 10, background: "#fffbeb", color: "#92400e" }}>
                This looks like a scanned PDF. OCR/vision extraction is the next upgrade step.
              </div>
            )}

            {latestRun.pages?.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12 }}>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    maxHeight: 500,
                    overflow: "auto",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Pages</div>
                  {latestRun.pages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPage(p.pageNumber)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: p.pageNumber === (selectedPageObj?.pageNumber ?? -1) ? "#eef2ff" : "white",
                        cursor: "pointer",
                        marginBottom: 8,
                      }}
                    >
                      Page {p.pageNumber} · conf {p.confidence.toFixed(2)}
                    </button>
                  ))}
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 700 }}>Text preview</div>
                    {selectedPageObj && (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Page {selectedPageObj.pageNumber}
                      </div>
                    )}
                  </div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      marginTop: 10,
                      fontSize: 13,
                      lineHeight: 1.5,
                      background: "#f9fafb",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      maxHeight: 500,
                      overflow: "auto",
                    }}
                  >
                    {selectedPageObj?.text || "(empty)"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
