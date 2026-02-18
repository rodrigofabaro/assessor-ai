export function buildMarkedPdfUrl(submissionId: string, assessmentId?: string | null, stamp?: number) {
  const sid = String(submissionId || "").trim();
  const aid = String(assessmentId || "").trim();
  const t = Number.isFinite(Number(stamp)) ? Number(stamp) : Date.now();
  if (!sid) return "";
  const q = new URLSearchParams();
  if (aid) q.set("assessmentId", aid);
  q.set("t", String(t));
  return `/api/submissions/${encodeURIComponent(sid)}/marked-file?${q.toString()}`;
}
