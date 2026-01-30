export function cleanTrailingPageNumber(s: string): string {
  const t = (s || "").trim();

  // remove " ... 48" or "... 127" at the very end
  const stripped = t.replace(/\s+(\d{1,3})\s*$/g, "");

  // only apply if we actually removed something and the remaining text is non-trivial
  return stripped.length >= 20 ? stripped : t;
}
