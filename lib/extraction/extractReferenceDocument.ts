import fs from "fs/promises";

import { pdfToText } from "@/lib/extraction/text/pdfToText";
import { parseSpec } from "@/lib/extraction/parsers/specParser";
import { extractBrief } from "@/lib/extractors/brief";
import { cleanupBriefTasksMathWithOpenAi } from "@/lib/openai/briefMathCleanup";

export type ExtractWarning = string;

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
    extractedJson = {
      ...parseSpec(text, args.docTitleFallback),
      pageCount,
      hasFormFeedBreaks,
      extractionWarnings: extractionWarnings.length ? extractionWarnings : undefined,
    };
  } else if (args.type === "BRIEF") {
    const brief = await cleanupBriefTasksMathWithOpenAi(
      extractBrief(text, args.docTitleFallback, { equations }),
      { runCleanup: args.runOpenAiCleanup }
    );
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
