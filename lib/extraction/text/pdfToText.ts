/**
 * PDF -> text using pdf-parse.
 * Kept in a dedicated module so parser logic can't accidentally change this layer.
 */
export async function pdfToText(buf: Buffer): Promise<string> {
  // IMPORTANT: avoid pdf-parse test harness importing its own test data
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod as any).default ?? (mod as any);

  const parsed = await pdfParse(buf);
  const text = (parsed?.text || "").toString();
  return text.trim();
}
