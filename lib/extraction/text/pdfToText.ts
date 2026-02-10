/**
 * PDF -> text using pdf-parse.
 * Kept in a dedicated module so parser logic can't accidentally change this layer.
 */

function normalizeMatrixPlaceholders(text: string) {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/[┌┐└┘│]/.test(line)) {
      out.push(line);
      continue;
    }

    const matrixRows: string[] = [];
    let j = i;
    while (j < lines.length && /[┌┐└┘│]/.test(lines[j])) {
      const cleaned = lines[j].replace(/[┌┐└┘│]/g, " ").trim();
      if (cleaned) {
        const nums = cleaned.match(/[-+]?\d+(?:\.\d+)?/g);
        matrixRows.push(nums && nums.length ? nums.join("  ") : cleaned.replace(/\s{2,}/g, " "));
      }
      j += 1;
    }

    if (matrixRows.length >= 2) {
      out.push(`[ ${matrixRows.join("; ")} ]`);
      i = j - 1;
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

export function sanitizeExtractedPdfText(raw: string) {
  let text = (raw || "").replace(/\uFFFD/g, "");

  text = text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n");

  text = text.normalize("NFKC");

  text = text
    .replace(/(\d+(?:\.\d+)?)\s*\n\s*o\b/g, "$1°")
    .replace(/\(([A-Za-z])\1\)/g, "($1)");

  text = normalizeMatrixPlaceholders(text)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n");

  return text;
}

export async function pdfToText(
  buf: Buffer
): Promise<{ text: string; pageCount: number }> {
  // IMPORTANT: avoid pdf-parse test harness importing its own test data
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod as any).default ?? (mod as any);

  const pages: string[] = [];
  const pagerender = async (pageData: any) => {
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });

    const yTolerance = 2;
    const lines: string[] = [];
    let currentY: number | null = null;
    let currentLine = "";
    let lastRightX: number | null = null;

    const flushLine = () => {
      lines.push(currentLine);
      currentLine = "";
      lastRightX = null;
    };

    for (const item of textContent.items || []) {
      const str = String(item?.str || "");
      if (!str) continue;
      const x = Number(item?.transform?.[4] || 0);
      const y = Number(item?.transform?.[5] || 0);
      const width = Number(item?.width || 0);
      const avgCharWidth = str.length ? width / str.length : 0;

      const sameLine = currentY !== null && Math.abs(y - currentY) <= yTolerance;
      if (!sameLine) {
        if (currentY !== null) flushLine();
        currentY = y;
      }

      if (currentLine && lastRightX !== null) {
        const gap = x - lastRightX;
        if (gap > 0.75) {
          const charUnit = avgCharWidth > 0 ? avgCharWidth : 3;
          const spaces = Math.max(1, Math.round(gap / charUnit));
          currentLine += " ".repeat(spaces);
        }
      }

      currentLine += str;
      const fallbackWidth = avgCharWidth > 0 ? avgCharWidth * str.length : str.length * 3;
      lastRightX = x + (width > 0 ? width : fallbackWidth);
    }

    if (currentY !== null) flushLine();

    const pageText = lines.join("\n");
    pages.push(pageText);
    return pageText;
  };

  const parsed = await pdfParse(buf, { pagerender });
  const pageCount = Number(parsed?.numpages || 0);
  const rawText = (parsed?.text || "").toString();
  const text = sanitizeExtractedPdfText(pages.length ? pages.join("\f") : rawText).trim();

  return { text, pageCount };
}
