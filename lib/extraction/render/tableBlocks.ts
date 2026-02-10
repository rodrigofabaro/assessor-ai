export type StructuredTableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

export type UnstructuredTableBlock = {
  type: "unstructured";
  text: string;
  warning: "TABLE UNSTRUCTURED";
};

export type TableBlock = StructuredTableBlock | UnstructuredTableBlock;

function normalizeText(text: string) {
  return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitColumns(line: string): string[] {
  const clean = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (clean.includes("|")) {
    return clean.split("|").map((part) => part.trim()).filter(Boolean);
  }
  return clean.split(/\s{2,}|\t+/).map((part) => part.trim()).filter(Boolean);
}

function hasMostlyNumericCells(cells: string[]) {
  if (!cells.length) return false;
  const numeric = cells.filter((cell) => /^[-+]?\d+(\.\d+)?(%|[a-z]+)?$/i.test(cell.replace(/,/g, ""))).length;
  return numeric >= Math.ceil(cells.length / 2);
}

function fromStructured(task: any): TableBlock[] {
  if (!Array.isArray(task?.tables)) return [];
  return task.tables
    .map((t: any) => {
      const headers = Array.isArray(t?.headers) ? t.headers.map((v: unknown) => String(v).trim()).filter(Boolean) : [];
      const rows = Array.isArray(t?.rows)
        ? t.rows.map((row: unknown) => (Array.isArray(row) ? row.map((v) => String(v ?? "").trim()) : [])).filter((row) => row.length)
        : [];
      if (!headers.length || !rows.length) return null;
      return { type: "table", headers, rows } as StructuredTableBlock;
    })
    .filter(Boolean) as TableBlock[];
}

export function detectTableBlocks(task: any): TableBlock[] {
  const structured = fromStructured(task);
  if (structured.length) return structured;

  const text = normalizeText(String(task?.text || ""));
  if (!text.trim()) return [];

  const lines = text.split("\n");
  const blocks: TableBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const cols = splitColumns(line);
    if (cols.length < 2) {
      i += 1;
      continue;
    }

    const candidateLines: string[] = [line];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j].trim();
      if (!next) break;
      const nextCols = splitColumns(next);
      if (nextCols.length < 2) break;
      candidateLines.push(next);
      j += 1;
    }

    if (candidateLines.length >= 3) {
      const matrix = candidateLines.map(splitColumns);
      const columnCount = Math.max(...matrix.map((row) => row.length));
      const consistentRows = matrix.filter((row) => row.length >= Math.max(2, columnCount - 1));
      const likelyTable = consistentRows.length >= 3;
      if (likelyTable) {
        const headers = matrix[0];
        const rows = matrix.slice(1);
        const shouldFallback = headers.length < 2 || !rows.some((row) => hasMostlyNumericCells(row));
        if (shouldFallback) {
          blocks.push({
            type: "unstructured",
            text: candidateLines.join("\n"),
            warning: "TABLE UNSTRUCTURED",
          });
        } else {
          blocks.push({ type: "table", headers, rows });
        }
      }
      i = j;
      continue;
    }

    i += 1;
  }

  return blocks;
}
