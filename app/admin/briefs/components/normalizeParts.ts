export type PartLike = {
  key: string;
  text: string;
  children?: PartLike[];
};

const ROMAN_SEGMENT = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
const LETTER_SEGMENT = /^[a-z]$/i;

function normalizeKey(rawKey: string) {
  return String(rawKey || "").trim().toLowerCase();
}

function extractRomanSegment(key: string) {
  const normalized = normalizeKey(key);
  if (!normalized) return "";
  const segments = normalized.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return "";
  const last = segments[segments.length - 1];
  return ROMAN_SEGMENT.test(last) ? last : "";
}

function dedupeChildren(children: PartLike[]) {
  const seen = new Set<string>();
  return children.filter((child) => {
    const textKey = child.text.trim().toLowerCase();
    if (!textKey) return true;
    if (seen.has(textKey)) return false;
    seen.add(textKey);
    return true;
  });
}

export function normalizeParts(parts: Array<{ key?: string; text?: string; children?: Array<{ key?: string; text?: string }> }> = []): PartLike[] {
  if (!Array.isArray(parts) || !parts.length) return [];

  const normalizedRoots: PartLike[] = [];
  let currentParent: PartLike | null = null;

  const pushChild = (parent: PartLike, child: PartLike) => {
    if (!parent.children) parent.children = [];
    parent.children.push(child);
    parent.children = dedupeChildren(parent.children);
  };

  for (const part of parts) {
    const key = normalizeKey(String(part?.key || ""));
    const text = String(part?.text || "").trim();
    if (!key || !text) continue;

    const childCandidates = Array.isArray(part.children)
      ? part.children
          .map((child) => ({
            key: normalizeKey(String(child?.key || "")),
            text: String(child?.text || "").trim(),
          }))
          .filter((child) => child.key && child.text)
          .map((child) => ({ key: child.key, text: child.text }))
      : [];

    if (LETTER_SEGMENT.test(key)) {
      const parent: PartLike = {
        key,
        text,
        children: dedupeChildren(childCandidates),
      };
      normalizedRoots.push(parent);
      currentParent = parent;
      continue;
    }

    const roman = extractRomanSegment(key);
    if (roman && currentParent) {
      pushChild(currentParent, { key: roman, text });
      continue;
    }

    const fallback: PartLike = {
      key,
      text,
      children: dedupeChildren(childCandidates),
    };
    normalizedRoots.push(fallback);
    currentParent = LETTER_SEGMENT.test(fallback.key) ? fallback : currentParent;
  }

  return normalizedRoots.map((part) => ({
    ...part,
    children: part.children?.length ? dedupeChildren(part.children) : undefined,
  }));
}
