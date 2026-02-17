import fs from "fs/promises";

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

export async function extractReferenceDocument(args: {
  type: string;
  filePath: string;
  docTitleFallback: string;
  runOpenAiCleanup?: boolean;
}) {
  const buf = await fs.readFile(args.filePath);

  let text = "";
  let pageCount = 0;
  let equations: any[] = [];
  if (args.type === "SPEC") {
    // Today we only need PDFs for specs; DOCX spec support can be added as a separate extractor.
    const parsed = await pdfToText(buf);
    text = stripEquationPlaceholders(parsed.text);
    pageCount = parsed.pageCount;
  } else {
    // For non-spec docs, just return preview-compatible extraction for now.
    const parsed = await pdfToText(buf);
    text = parsed.text;
    pageCount = parsed.pageCount;
    equations = parsed.equations || [];
  }

  const hasFormFeedBreaks = /\f|\u000c/.test(text);
  const warnings: string[] = [];
  const extractionWarnings: string[] = [];
  if (!text || text.length < 50) {
    const warning =
      "Extraction produced empty/short text. This may be a scanned PDF. Vision OCR is not enabled yet."
    warnings.push(warning);
    extractionWarnings.push(warning);
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
    // Briefs need structured header fields for binding and lock.
    // Keep this path isolated so SPEC extraction remains untouched.
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
