import fs from "fs/promises";

import { pdfToText } from "@/lib/extraction/text/pdfToText";
import { parseSpec } from "@/lib/extraction/parsers/specParser";
import { extractBrief } from "@/lib/extractors/brief";

export type ExtractWarning = string;

export async function extractReferenceDocument(args: {
  type: string;
  filePath: string;
  docTitleFallback: string;
}) {
  const buf = await fs.readFile(args.filePath);

  let text = "";
  if (args.type === "SPEC") {
    // Today we only need PDFs for specs; DOCX spec support can be added as a separate extractor.
    text = await pdfToText(buf);
  } else {
    // For non-spec docs, just return preview-compatible extraction for now.
    text = await pdfToText(buf);
  }

  const warnings: string[] = [];
  if (!text || text.length < 50) {
    warnings.push(
      "Extraction produced empty/short text. This may be a scanned PDF. Vision OCR is not enabled yet."
    );
  }

  let extractedJson: any = null;
  if (args.type === "SPEC") {
    extractedJson = parseSpec(text, args.docTitleFallback);
  } else if (args.type === "BRIEF") {
    // Briefs need structured header fields for binding and lock.
    // Keep this path isolated so SPEC extraction remains untouched.
    const brief = extractBrief(text, args.docTitleFallback);
    extractedJson = {
      ...brief,
      preview: text.slice(0, 4000),
      charCount: text.length,
    };
  } else {
    extractedJson = {
      kind: args.type,
      preview: text.slice(0, 4000),
      charCount: text.length,
    };
  }

  return { text, warnings, extractedJson };
}
