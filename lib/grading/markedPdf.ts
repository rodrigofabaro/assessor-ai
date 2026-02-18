import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type MarkedPdfPayload = {
  submissionId: string;
  overallGrade: string;
  feedbackBullets: string[];
  tone: string;
  strictness: string;
  studentName?: string;
  assessorName?: string;
  markedDate?: string;
  overallPlacement?: "first" | "last";
  pageNotes?: Array<{ page: number; lines: string[] }>;
};

export async function createMarkedPdf(inputPdfPath: string, payload: MarkedPdfPayload) {
  const bytes = fs.readFileSync(inputPdfPath);
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const originalPages = pdf.getPages();
  const first = originalPages[0];
  const fallbackPageSize = first ? first.getSize() : { width: 595.28, height: 841.89 };

  // Overall feedback is always rendered on a dedicated page so it never competes
  // with submission text/background.
  const overallPage =
    payload.overallPlacement === "first"
      ? pdf.insertPage(0, [fallbackPageSize.width, fallbackPageSize.height])
      : pdf.addPage([fallbackPageSize.width, fallbackPageSize.height]);
  const { width, height } = overallPage.getSize();

  const margin = 24;
  const boxW = Math.min(380, width - margin * 2);
  const lineH = 14;
  const titleH = 20;
  const metaH = 28;
  const bulletCount = Math.max(1, Math.min(8, payload.feedbackBullets.length || 1));
  const boxH = titleH + metaH + bulletCount * lineH + 18;
  const x = (width - boxW) / 2;
  const y = Math.max(margin, (height - boxH) / 2);

  overallPage.drawRectangle({
    x,
    y,
    width: boxW,
    height: boxH,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1,
    opacity: 0.94,
  });

  overallPage.drawText("Overall feedback", {
    x: x + 10,
    y: y + boxH - 16,
    size: 12,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  overallPage.drawText(`Grade: ${payload.overallGrade.toUpperCase()}  |  Tone: ${payload.tone}  |  Strictness: ${payload.strictness}`, {
    x: x + 10,
    y: y + boxH - 31,
    size: 8.5,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });

  const studentLabel = String(payload.studentName || "Student").trim();
  const assessorLabel = String(payload.assessorName || "Assessor").trim();
  const dateLabel = String(payload.markedDate || new Date().toLocaleDateString("en-GB")).trim();
  overallPage.drawText(`Student: ${studentLabel}  |  Assessor: ${assessorLabel}  |  Date: ${dateLabel}`, {
    x: x + 10,
    y: y + boxH - 42,
    size: 8,
    font,
    color: rgb(0.25, 0.25, 0.25),
    maxWidth: boxW - 20,
    lineHeight: 8.8,
  });

  const bullets = payload.feedbackBullets.slice(0, 8);
  for (let i = 0; i < bullets.length; i += 1) {
    const by = y + boxH - 61 - i * lineH;
    overallPage.drawRectangle({
      x: x + 10,
      y: by - 1,
      width: 8,
      height: 8,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    overallPage.drawText(bullets[i], {
      x: x + 24,
      y: by,
      size: 8.2,
      font,
      color: rgb(0.15, 0.15, 0.15),
      maxWidth: boxW - 34,
      lineHeight: 9,
    });
  }

  const pages = pdf.getPages();
  const summaryPageOffset = payload.overallPlacement === "first" ? 1 : 0;
  const pageNotes = Array.isArray(payload.pageNotes) ? payload.pageNotes : [];
  for (const note of pageNotes) {
    const pageNo = Number(note?.page || 0);
    if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > pages.length) continue;
    const mappedPageIndex = pageNo - 1 + summaryPageOffset;
    if (mappedPageIndex < 0 || mappedPageIndex >= pages.length) continue;
    const page = pages[mappedPageIndex];
    const { width: pw, height: ph } = page.getSize();
    const lines = (Array.isArray(note?.lines) ? note.lines : [])
      .map((l) => String(l || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!lines.length) continue;
    const noteW = Math.min(340, pw - margin * 2);
    const noteH = 18 + lines.length * 12 + 10;
    const nx = pw - noteW - margin;
    const ny = ph - noteH - margin;
    page.drawRectangle({
      x: nx,
      y: ny,
      width: noteW,
      height: noteH,
      color: rgb(1, 0.88, 0.88),
      borderColor: rgb(0.7, 0.15, 0.15),
      borderWidth: 1,
      opacity: 0.72,
    });
    page.drawText("Constructive note", {
      x: nx + 8,
      y: ny + noteH - 13,
      size: 8.5,
      font: bold,
      color: rgb(0.42, 0.06, 0.06),
    });
    for (let i = 0; i < lines.length; i += 1) {
      page.drawText(`- ${lines[i]}`, {
        x: nx + 8,
        y: ny + noteH - 26 - i * 11,
        size: 7.8,
        font,
        color: rgb(0.3, 0.05, 0.05),
        maxWidth: noteW - 14,
        lineHeight: 8.5,
      });
    }
  }

  const outDir = path.join(process.cwd(), "submission_marked");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = `${payload.submissionId}-${Date.now()}.pdf`;
  const outPath = path.join(outDir, outFile);

  const outBytes = await pdf.save();
  fs.writeFileSync(outPath, Buffer.from(outBytes));

  return {
    storagePath: path.join("submission_marked", outFile),
    absolutePath: outPath,
  };
}
