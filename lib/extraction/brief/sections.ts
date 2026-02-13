export type LineWithPage = {
  line: string;
  page: number;
};

export type LineRange = {
  start: number;
  end: number;
};

export function buildRangesFromStarts(starts: number[], totalLength: number): LineRange[] {
  if (!Array.isArray(starts) || starts.length === 0 || totalLength <= 0) return [];
  const sorted = Array.from(new Set(starts.filter((n) => Number.isInteger(n) && n >= 0 && n < totalLength))).sort(
    (a, b) => a - b
  );
  const ranges: LineRange[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i];
    const end = i + 1 < sorted.length ? sorted[i + 1] : totalLength;
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

export function nextIndexAfter(sortedIndices: number[], index: number): number {
  for (const candidate of sortedIndices) {
    if (candidate > index) return candidate;
  }
  return -1;
}

export function uniquePagesForRange(lines: LineWithPage[], start: number, end: number): number[] {
  if (!Array.isArray(lines) || start >= end) return [];
  const out = new Set<number>();
  for (let i = Math.max(0, start); i < Math.min(lines.length, end); i += 1) {
    const page = Number(lines[i]?.page || 0);
    if (page > 0) out.add(page);
  }
  return Array.from(out);
}

