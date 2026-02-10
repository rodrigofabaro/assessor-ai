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
    return clean
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return clean
    .split(/\s{2,}|\t+/)
    .map((part) => part.trim())
    .filter(Boolean);
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

function consistentColumnCounts(matrix: string[][]) {
  const counts = matrix.map((row) => row.length).filter((count) => count >= 2);
  if (counts.length < 2) return false;
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  return maxCount - minCount <= 1;
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

    if (candidateLines.length >= 2) {
      const matrix = candidateLines.map(splitColumns);
      const columnCount = Math.max(...matrix.map((row) => row.length));
      const enoughColsEachLine = matrix.every((row) => row.length >= 2);
      const consistentRows = consistentColumnCounts(matrix);
      const likelyTable = enoughColsEachLine && consistentRows && columnCount >= 2;

      if (likelyTable) {
        let headers = matrix[0];
        const rows = matrix.slice(1);
        const headerLooksNumeric = hasMostlyNumericCells(headers);
        const dataNumeric = rows.some((row) => hasMostlyNumericCells(row));

        if (headerLooksNumeric && dataNumeric) {
          headers = Array.from({ length: columnCount }, (_, idx) => `c${idx + 1}`);
        }

        const normalizedRows = rows.map((row) => {
          if (row.length >= columnCount) return row;
          return row.concat(Array.from({ length: columnCount - row.length }, () => ""));
        });

        if (headers.length < columnCount) {
          headers = headers.concat(Array.from({ length: columnCount - headers.length }, (_, idx) => `c${headers.length + idx + 1}`));
        }

        blocks.push({ type: "table", headers, rows: normalizedRows });
      } else {
        blocks.push({
          type: "unstructured",
          text: candidateLines.join("\n"),
          warning: "TABLE UNSTRUCTURED",
        });
      }
      i = j;
      continue;
    }

    i += 1;
  }

  return blocks;
}
