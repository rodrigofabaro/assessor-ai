export function normalizeWhitespace(s: string) {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function firstMatch(text: string, re: RegExp): string | null {
  const m = (text || "").match(re);
  return m?.[1] ? normalizeWhitespace(m[1]) : null;
}

/** Split text into clean-ish lines (pdf-parse table flattening friendly) */
export function toLines(text: string): string[] {
  return (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}
