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
    let text = "";
    for (const item of textContent.items || []) {
      if (lastY === null || lastY === item.transform[5]) {
        text += item.str;
      } else {
        text += `\n${item.str}`;
      }
      lastY = item.transform[5];
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
