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

  // Today: always PDF->text.
  const text = await pdfToText(buf);

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
