import { normalizeSymbolArtifacts } from "@/lib/extraction/normalize/symbols";

export function normalizeWhitespace(s: string) {
  return normalizeSymbolArtifacts((s || "").replace(/\r/g, ""), {
    normalizeNewlines: false,
    collapseWhitespace: false,
  })
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ? normalizeWhitespace(m[1]) : null;
}
