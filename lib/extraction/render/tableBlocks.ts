export type TableRange = { startLine: number; endLine: number };

export type StructuredTableBlock = {
  kind: "TABLE";
  caption?: string;
  headers: [string, string, string];
  rows: string[][];
  range: TableRange;
};

export type UnstructuredTableBlock = {
  kind: "UNSTRUCTURED";
  warning: "TABLE UNSTRUCTURED";
  text: string;
  range: TableRange;
  caption?: string;
};

export type TableBlock = StructuredTableBlock | UnstructuredTableBlock;

function normalizeText(text: string) {
  return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function getTaskText(task: any) {
  if (typeof task === "string") return task;
  return String(task?.text || "");
}

function isTableCaption(line: string) {
  return /^table\s+\d+(?:\.\d+)?\b/i.test((line || "").trim());
}

function isNumericOrCurrencyToken(token: string) {
  const value = (token || "").trim().replace(/,/g, "");
  return /^£$/.test(value) || /^\d+$/.test(value);
}

function parseRow(line: string): [string, string, string] | null {
  const clean = (line || "").trim();
  if (!clean) return null;

  const pipeParts = clean
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (pipeParts.length >= 3) {
    return [pipeParts[0] || "", pipeParts[1] || "", pipeParts[2] || ""];
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    const col2 = tokens[tokens.length - 2];
    const col3 = tokens[tokens.length - 1];
    if (isNumericOrCurrencyToken(col2) && isNumericOrCurrencyToken(col3)) {
      const col1 = tokens.slice(0, -2).join(" ").trim();
      return [col1, col2, col3];
    }
  }

  return [clean, "", ""];
}

function collapseHeaders(headerLines: string[]): [string, string, string] | null {
  const joined = headerLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!joined) return null;

  if (/^month\b/i.test(joined) && /\bbefore\s+qc\b/i.test(joined) && /\bafter\s+qc\b/i.test(joined)) {
    return ["Month", "Before QC", "After QC"];
  }

  if (/output\s+voltage/i.test(joined) && /\bbefore\s+qc\b/i.test(joined) && /\bafter\s+qc\b/i.test(joined)) {
    return ["Output Voltage (V)", "Before QC", "After QC"];
  }

  const beforeMatch = joined.match(/\bbefore\s+qc\b/i);
  const afterMatch = joined.match(/\bafter\s+qc\b/i);
  if (!beforeMatch || !afterMatch || beforeMatch.index! >= afterMatch.index!) return null;

  const col1 = joined.slice(0, beforeMatch.index).trim();
  const col2 = joined.slice(beforeMatch.index, afterMatch.index).trim().replace(/\s+/g, " ");
  const col3 = joined.slice(afterMatch.index).trim().replace(/\s+/g, " ");

  if (!col1 || !col2 || !col3) return null;
  return [col1, col2, col3];
}

function startsCostingTable(lines: string[], i: number) {
  const first = (lines[i] || "").trim();
  if (!/^month\b/i.test(first)) return false;
  const lookahead = lines
    .slice(i, Math.min(lines.length, i + 6))
    .map((line) => line.trim())
    .join(" ")
    .toLowerCase();
  return /before/.test(lookahead) && /after/.test(lookahead) && /qc/.test(lookahead);
}

function startsTable(lines: string[], i: number) {
  const line = (lines[i] || "").trim();
  return isTableCaption(line) || startsCostingTable(lines, i);
}

export function detectTableBlocks(task: any): TableBlock[] {
  const text = normalizeText(getTaskText(task));
  if (!text.trim()) return [];

  const lines = text.split("\n");
  const blocks: TableBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!startsTable(lines, i)) {
      i += 1;
      continue;
    }

    const startLine = i;
    const caption = isTableCaption(lines[i].trim()) ? lines[i].trim() : undefined;
    let cursor = caption ? i + 1 : i;

    const headerLines: string[] = [];
    while (cursor < lines.length) {
      const line = (lines[cursor] || "").trim();
      if (!line) break;
      if (isTableCaption(line)) break;

      const parsed = parseRow(line);
      if (parsed && (parsed[1] || parsed[2])) break;

      const built = headerLines.join(" ").toLowerCase();
      const hasBeforeAfter = /\bbefore\s+qc\b/.test(built) && /\bafter\s+qc\b/.test(built);
      const isHeaderContinuation = /(before|after|qc|month|output|voltage|\(v\))/i.test(line);
      if (hasBeforeAfter && !isHeaderContinuation) break;

      headerLines.push(line);
      cursor += 1;
      if (headerLines.length >= 6) break;
    }

    const headers = collapseHeaders(headerLines);
    if (!headers) {
      blocks.push({
        kind: "UNSTRUCTURED",
        warning: "TABLE UNSTRUCTURED",
        text: [caption, ...headerLines].filter(Boolean).join("\n"),
        caption,
        range: { startLine, endLine: Math.max(startLine + 1, cursor) },
      });
      i = Math.max(i + 1, cursor);
      continue;
    }

    const rows: string[][] = [];
    let end = cursor;
    while (end < lines.length) {
      const line = (lines[end] || "").trim();
      if (!line) {
        end += 1;
        continue;
      }
      if (isTableCaption(line)) break;

      const row = parseRow(line);
      if (!row) break;
      rows.push(row);
      end += 1;
    }

    blocks.push({
      kind: "TABLE",
      caption,
      headers,
      rows,
      range: { startLine, endLine: Math.max(startLine + 1, end) },
    });

    i = Math.max(i + 1, end);
  }

  return blocks;
}
