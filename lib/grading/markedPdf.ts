import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type MarkedPdfPayload = {
  submissionId: string;
  overallGrade: string;
  feedbackBullets: string[];
  feedbackText?: string;
  studentSafe?: boolean;
  tone: string;
  strictness: string;
  studentName?: string;
  assessorName?: string;
  markedDate?: string;
  overallPlacement?: "first" | "last";
  pageNotes?: Array<{ page: number; lines: string[]; criterionCode?: string; showCriterionCodeInTitle?: boolean }>;
};

function sanitizeRenderableText(value: unknown) {
  const text = String(value || "")
    .replace(/\btype\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\benter\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\badd\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\binsert\s+text\b/gi, "")
    .replace(/\bclick\s+to\s+add\s+text\b/gi, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/−/g, "-")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/±/g, "+/-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=");
  const symbolMap: Record<string, string> = {
    π: "pi",
    Π: "PI",
    θ: "theta",
    Θ: "Theta",
    φ: "phi",
    Φ: "Phi",
    ω: "omega",
    Ω: "Omega",
    μ: "mu",
    λ: "lambda",
    σ: "sigma",
    Σ: "Sigma",
    Δ: "Delta",
    δ: "delta",
    α: "alpha",
    β: "beta",
    γ: "gamma",
    "°": " deg",
    "≈": " approx ",
    "∠": " angle ",
    "∥": " || ",
    "⊥": " perpendicular ",
    "→": " -> ",
    "←": " <- ",
  };
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, (ch) => symbolMap[ch] || " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function wrapText(text: string, maxWidth: number, font: any, size: number) {
  const source = sanitizeRenderableText(text).replace(/\s+/g, " ").trim();
  if (!source) return [] as string[];
  const words = source.split(" ");
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) out.push(current);
    // Hard split for very long tokens with no spaces.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = "";
      for (const ch of word) {
        const next = `${chunk}${ch}`;
        if (font.widthOfTextAtSize(next, size) > maxWidth) {
          if (chunk) out.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}

function buildFeedbackRenderLines(text: string, maxWidth: number, font: any, size: number) {
  const rawLines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const raw of rawLines) {
    const line = sanitizeRenderableText(raw);
    if (!line) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    const bullet = /^[-*•]\s+/.test(line);
    if (bullet) {
      const body = line.replace(/^[-*•]\s+/, "");
      const rows = wrapText(body, maxWidth - 12, font, size);
      rows.forEach((row, idx) => out.push(`${idx === 0 ? "• " : "  "}${row}`));
      continue;
    }
    const rows = wrapText(line, maxWidth, font, size);
    rows.forEach((row) => out.push(row));
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

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
  const boxW = Math.min(460, width - margin * 2);
  const titleH = 20;
  const metaH = 30;
  const bulletFontSize = 9.6;
  const bulletLineH = 12;
  let feedbackTextLines = buildFeedbackRenderLines(String(payload.feedbackText || ""), boxW - 20, font, bulletFontSize);
  const maxRowsByPage = Math.max(
    6,
    Math.floor((height - margin * 2 - (titleH + metaH + 22)) / bulletLineH)
  );
  if (feedbackTextLines.length > maxRowsByPage) feedbackTextLines = feedbackTextLines.slice(0, maxRowsByPage);
  const bullets = feedbackTextLines.length ? [] : payload.feedbackBullets.slice(0, 8);
  const bulletWrap = bullets.map((b) => wrapText(b, boxW - 34, font, bulletFontSize));
  const bulletRows = feedbackTextLines.length
    ? feedbackTextLines.length
    : bulletWrap.reduce((sum, rows) => sum + Math.max(1, rows.length), 0);
  const boxH = titleH + metaH + 14 + bulletRows * bulletLineH + 18;
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
    size: 13,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const studentSafe = payload.studentSafe !== false;
  overallPage.drawText(
    studentSafe
      ? `Grade: ${payload.overallGrade.toUpperCase()}`
      : `Grade: ${payload.overallGrade.toUpperCase()}  |  Tone: ${payload.tone}  |  Strictness: ${payload.strictness}`,
    {
    x: x + 10,
    y: y + boxH - 31,
    size: 8.5,
    font,
    color: rgb(0.25, 0.25, 0.25),
    }
  );

  const studentLabel = String(payload.studentName || "Student").trim();
  const assessorLabel = String(payload.assessorName || "Assessor").trim();
  const dateLabel = String(payload.markedDate || new Date().toLocaleDateString("en-GB")).trim();
  overallPage.drawText(`Student: ${studentLabel}  |  Assessor: ${assessorLabel}  |  Date: ${dateLabel}`, {
    x: x + 10,
    y: y + boxH - 42,
    size: 8.6,
    font,
    color: rgb(0.25, 0.25, 0.25),
    maxWidth: boxW - 20,
    lineHeight: 8.8,
  });

  let bulletY = y + boxH - 61;
  if (feedbackTextLines.length) {
    for (const line of feedbackTextLines) {
      if (line === "") {
        bulletY -= Math.floor(bulletLineH * 0.6);
        continue;
      }
      overallPage.drawText(line, {
        x: x + 10,
        y: bulletY,
        size: bulletFontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      bulletY -= bulletLineH;
    }
  } else {
    for (let i = 0; i < bulletWrap.length; i += 1) {
      const rows = bulletWrap[i].length ? bulletWrap[i] : [""];
      overallPage.drawRectangle({
        x: x + 10,
        y: bulletY - 1,
        width: 8,
        height: 8,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });
      for (let j = 0; j < rows.length; j += 1) {
        overallPage.drawText(rows[j], {
          x: x + 24,
          y: bulletY - j * bulletLineH,
          size: bulletFontSize,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
      bulletY -= Math.max(1, rows.length) * bulletLineH;
    }
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
    const { width: pw } = page.getSize();
    const lines = (Array.isArray(note?.lines) ? note.lines : [])
      .map((l) => sanitizeRenderableText(l))
      .filter(Boolean)
      .slice(0, 10);
    if (!lines.length) continue;
    const noteW = Math.min(360, pw - margin * 2);
    const noteFontSize = 8.6;
    const noteLineH = 10;
    const wrapped = lines.map((line) => wrapText(line, noteW - 16, font, noteFontSize));
    const wrappedRows = wrapped.reduce((sum, rows) => sum + Math.max(1, rows.length), 0);
    const noteH = 18 + wrappedRows * noteLineH + 10;
    const nx = pw - noteW - margin;
    // Keep page notes consistently in the bottom-right corner.
    const ny = margin;
    page.drawRectangle({
      x: nx,
      y: ny,
      width: noteW,
      height: noteH,
      color: rgb(1, 0.94, 0.9),
      borderColor: rgb(0.7, 0.15, 0.15),
      borderWidth: 1,
      opacity: 1,
    });
    const criterionCode = String((note as any)?.criterionCode || "").trim().toUpperCase();
    const showCriterionCodeInTitle = (note as any)?.showCriterionCodeInTitle !== false;
    const noteTitle =
      showCriterionCodeInTitle && /^[PMD]\d{1,2}$/.test(criterionCode) ? `Note (${criterionCode})` : "Note";
    page.drawText(noteTitle, {
      x: nx + 8,
      y: ny + noteH - 13,
      size: 9.2,
      font: bold,
      color: rgb(0.42, 0.06, 0.06),
    });
    let noteY = ny + noteH - 26;
    for (const rows of wrapped) {
      const safeRows = rows.length ? rows : [""];
      for (let i = 0; i < safeRows.length; i += 1) {
        page.drawText(safeRows[i], {
          x: nx + 8,
          y: noteY - i * noteLineH,
          size: noteFontSize,
          font,
          color: rgb(0.3, 0.05, 0.05),
        });
      }
      noteY -= Math.max(1, safeRows.length) * noteLineH;
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
