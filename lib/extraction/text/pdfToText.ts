/**
 * PDF -> text using pdf-parse.
 * Kept in a dedicated module so parser logic can't accidentally change this layer.
 */
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

    let lastY: number | null = null;
    let lastXEnd: number | null = null;
    let text = "";

    for (const item of textContent.items || []) {
      const str = String(item?.str || "");
      const y = Number(item?.transform?.[5] ?? 0);
      const x = Number(item?.transform?.[4] ?? 0);
      const width = Number(item?.width ?? 0);
      const charWidth = str.length > 0 && width > 0 ? width / str.length : 3;

      const sameLine = lastY !== null && Math.abs(lastY - y) < 0.5;
      if (!sameLine) {
        if (text) text += "\n";
        text += str;
      } else {
        const gap = lastXEnd === null ? 0 : x - lastXEnd;
        const spaces = gap > charWidth * 0.8 ? Math.max(1, Math.round(gap / Math.max(charWidth, 2.5))) : 0;
        if (spaces > 0) text += " ".repeat(spaces);
        text += str;
      }

      lastY = y;
      lastXEnd = x + width;
    }

    pages.push(text);
    return text;
  };

  const parsed = await pdfParse(buf, { pagerender });
  const pageCount = Number(parsed?.numpages || 0);
  const rawText = (parsed?.text || "").toString();
  const text = (pages.length ? pages.join("\f") : rawText).trim();

  return { text, pageCount };
}
