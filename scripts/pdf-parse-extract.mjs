#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

// IMPORTANT:
// Use the library entry to avoid pdf-parse's debug side-effect (it tries to read ./test/data/...)
// which breaks in some builds.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

async function renderPageWithDelimiter(pageData) {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });

  let lastY = null;
  let out = "";

  for (const item of textContent.items || []) {
    const str = (item?.str || "").trim();
    if (!str) continue;

    const y = item?.transform?.[5] ?? null;

    // New line when Y changes (roughly a new row)
    if (lastY !== null && y !== null && y !== lastY) out += "\n";

    out += str + " ";
    lastY = y;
  }

  return out.trim() + "\f";
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    process.stderr.write("Usage: node pdf-parse-extract.mjs <path-to-pdf>\n");
    process.exit(2);
  }

  const buf = await fs.readFile(pdfPath);
  const result = await pdfParse(buf, { pagerender: renderPageWithDelimiter });

  process.stdout.write(
    JSON.stringify({
      ok: true,
      numpages: result.numpages,
      text: result.text,
      info: result.info ?? null,
      metadata: result.metadata ?? null,
      version: result.version ?? null,
    })
  );
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  process.exit(1);
});
