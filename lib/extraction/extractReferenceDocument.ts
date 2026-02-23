import fs from "fs/promises";
import pdfParse from "pdf-parse";

import { pdfToText } from "@/lib/extraction/text/pdfToText";
import { parseSpec } from "@/lib/extraction/parsers/specParser";
import { extractBrief } from "@/lib/extractors/brief";
import { cleanupBriefTasksMathWithOpenAi } from "@/lib/openai/briefMathCleanup";
import { recoverBriefStructureWithAi } from "@/lib/openai/briefStructureRecovery";

export type ExtractWarning = string;

function stripEquationPlaceholders(text: string) {
  return String(text || "")
    .replace(/\[\[EQ:[^\]]+\]\]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+\n/g, "\n\n");
}

function scoreSpecParse(parsed: any) {
  const los = Array.isArray(parsed?.learningOutcomes) ? parsed.learningOutcomes : [];
  let totalCriteria = 0;
  let loWithCriteria = 0;
  let pass = 0;
  let merit = 0;
  let dist = 0;
  let descChars = 0;
  let shortDescs = 0;
  const codes = new Set<string>();
  for (const lo of los) {
    const criteria = Array.isArray(lo?.criteria) ? lo.criteria : [];
    if (criteria.length) loWithCriteria += 1;
    totalCriteria += criteria.length;
    for (const c of criteria) {
      const code = String(c?.acCode || "").trim().toUpperCase();
      const desc = String(c?.description || "").trim();
      if (code) {
        codes.add(code);
        if (code.startsWith("P")) pass += 1;
        else if (code.startsWith("M")) merit += 1;
        else if (code.startsWith("D")) dist += 1;
      }
      descChars += desc.length;
      if (desc && desc.length < 20) shortDescs += 1;
    }
  }
  const unitCode = String(parsed?.unit?.unitCode || "").trim();
  const unitTitle = String(parsed?.unit?.unitTitle || "").trim();
  const score =
    totalCriteria * 100 +
    loWithCriteria * 250 +
    codes.size * 20 +
    Math.min(descChars, 12000) * 0.2 +
    (unitCode ? 40 : 0) +
    (unitTitle ? 40 : 0) -
    shortDescs * 35 -
    (pass === 0 ? 200 : 0) -
    (merit === 0 ? 120 : 0) -
    (dist === 0 ? 120 : 0);
  return { score, totalCriteria, loCount: los.length, loWithCriteria, pass, merit, dist, shortDescs, descChars };
}

export async function extractReferenceDocument(args: {
  type: string;
  filePath: string;
  docTitleFallback: string;
  runOpenAiCleanup?: boolean;
}) {
  const buf = await fs.readFile(args.filePath);

  // Today: always PDF->text.
  const parsed = await pdfToText(buf);
  const text = parsed.text;
  const pageCount = parsed.pageCount;
  const equations = parsed.equations || [];
  const hasFormFeedBreaks = /\f|\u000c/.test(text);

  const warnings: string[] = [];
  const extractionWarnings: string[] = [];
  if (!text || text.length < 50) {
    const warning =
      "Extraction produced empty/short text. This may be a scanned PDF. Vision OCR is not enabled yet."
    extractionWarnings.push(warning);
    warnings.push(warning);
  }
  if (!pageCount || pageCount <= 1) {
    extractionWarnings.push("pageCount: missing or too low; page boundaries may be unreliable.");
  }
  if (!hasFormFeedBreaks) {
    extractionWarnings.push("page breaks missing; page numbers may be unreliable.");
  }

  let extractedJson: any = null;

  if (args.type === "SPEC") {
    let parsedSpec = parseSpec(stripEquationPlaceholders(text), args.docTitleFallback);
    try {
      const fallback = await pdfParse(Buffer.from(buf));
      const fallbackText = stripEquationPlaceholders(String(fallback?.text || ""));
      if (fallbackText && fallbackText.length > 50) {
        const fallbackParsedSpec = parseSpec(fallbackText, args.docTitleFallback);
        const primaryScore = scoreSpecParse(parsedSpec);
        const altScore = scoreSpecParse(fallbackParsedSpec);
        if (altScore.score > primaryScore.score + 120) {
          parsedSpec = fallbackParsedSpec;
          warnings.push(
            `SPEC parser fallback selected (pdf-parse) because criteria extraction quality was higher: ${altScore.totalCriteria} vs ${primaryScore.totalCriteria}.`
          );
        }
      }
    } catch {
      // Ignore fallback parse failures.
    }
    extractedJson = {
      ...parsedSpec,
      pageCount,
      hasFormFeedBreaks,
      extractionWarnings: extractionWarnings.length ? extractionWarnings : undefined,
    };
  } else if (args.type === "BRIEF") {
    const briefCleaned = await cleanupBriefTasksMathWithOpenAi(
      extractBrief(text, args.docTitleFallback, { equations }),
      { runCleanup: args.runOpenAiCleanup }
    );
    const recovered = await recoverBriefStructureWithAi(briefCleaned, text);
    const brief = recovered.brief;
    extractedJson = {
      ...brief,
      pageCount,
      hasFormFeedBreaks,
      extractionWarnings: extractionWarnings.length ? extractionWarnings : undefined,
      warnings: [
        ...(brief.warnings || []),
        ...warnings,
      ],
      preview: text.slice(0, 4000),
      charCount: text.length,
    };
  } else {
    extractedJson = {
      kind: args.type,
      preview: text.slice(0, 4000),
      charCount: text.length,
      pageCount,
      hasFormFeedBreaks,
      extractionWarnings: extractionWarnings.length ? extractionWarnings : undefined,
    };
  }

  return { text, warnings, extractedJson };
}
