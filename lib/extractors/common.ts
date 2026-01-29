export function normalizeWhitespace(s: string) {
  return (s || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

export function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ? normalizeWhitespace(m[1]) : null;
}
