const SYSTEM_FEEDBACK_PATTERNS: RegExp[] = [
  /\bautomated review\b/i,
  /\bcover-only extraction mode\b/i,
  /\bextraction mode\b/i,
  /\bschema validation\b/i,
  /\brequired schema\b/i,
  /\bmanual review\b/i,
  /\bfallback\b/i,
  /\bconfidence capped\b/i,
  /\bmodel output\b/i,
];

export function sanitizeStudentFeedbackLine(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\b(automated review|schema validation|manual review|required schema|fallback)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isSystemOrProcessLine(value: string): boolean {
  const line = String(value || "").trim();
  if (!line) return true;
  return SYSTEM_FEEDBACK_PATTERNS.some((re) => re.test(line));
}

export function sanitizeStudentFeedbackBullets(value: unknown, max: number): string[] {
  const raw = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of raw) {
    const line = String(item || "").trim();
    if (!line || isSystemOrProcessLine(line)) continue;
    const cleaned = sanitizeStudentFeedbackLine(line);
    if (!cleaned) continue;
    out.push(cleaned);
    if (out.length >= Math.max(1, max)) break;
  }
  return out;
}

export function sanitizeStudentFeedbackText(value: unknown): string {
  const src = String(value || "");
  if (!src.trim()) return "";
  const lines = src
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !isSystemOrProcessLine(trimmed.replace(/^[-*]\s+/, ""));
    });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

