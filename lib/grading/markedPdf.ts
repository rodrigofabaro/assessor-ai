import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type MarkedPdfPayload = {
  submissionId: string;
  overallGrade: string;
  feedbackBullets: string[];
  tone: string;
  strictness: string;
};

export async function createMarkedPdf(inputPdfPath: string, payload: MarkedPdfPayload) {
  const bytes = fs.readFileSync(inputPdfPath);
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const first = pdf.getPages()[0];
  const { width } = first.getSize();

  const margin = 24;
  const boxW = Math.min(380, width - margin * 2);
  const lineH = 14;
  const titleH = 20;
  const metaH = 16;
  const bulletCount = Math.max(1, Math.min(8, payload.feedbackBullets.length || 1));
  const boxH = titleH + metaH + bulletCount * lineH + 18;
  const x = width - boxW - margin;
  const y = margin;

  first.drawRectangle({
    x,
    y,
    width: boxW,
    height: boxH,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1,
    opacity: 0.94,
  });

  first.drawText("Assessor AI - Marking Summary", {
    x: x + 10,
    y: y + boxH - 16,
    size: 10,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  first.drawText(`Grade: ${payload.overallGrade.toUpperCase()}  |  Tone: ${payload.tone}  |  Strictness: ${payload.strictness}`, {
    x: x + 10,
    y: y + boxH - 31,
    size: 8.5,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });

  const bullets = payload.feedbackBullets.slice(0, 8);
  for (let i = 0; i < bullets.length; i += 1) {
    const by = y + boxH - 49 - i * lineH;
    first.drawRectangle({
      x: x + 10,
      y: by - 1,
      width: 8,
      height: 8,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    first.drawText(bullets[i], {
      x: x + 24,
      y: by,
      size: 8.2,
      font,
      color: rgb(0.15, 0.15, 0.15),
      maxWidth: boxW - 34,
      lineHeight: 9,
    });
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
