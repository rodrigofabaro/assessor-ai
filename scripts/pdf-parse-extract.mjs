#!/usr/bin/env node
/**
 * Robust PDF text extraction via pdf-parse, designed to run as a standalone Node process.
 *
 * Why this exists:
 * - Next.js (and bundlers) can make pdf-parse/pdf.js imports finicky.
 * - Some pdf-parse packages run a self-test when imported as the main module (module.parent undefined),
 *   which blows up in ESM scripts.
 *
 * This script avoids those traps by:
 * - Using createRequire() so pdf-parse is loaded as a child dependency (module.parent is set).
 * - Requiring the library entry directly: pdf-parse/lib/pdf-parse.js (skips the index.js self-test path).
 *
 * Usage:
 *   node scripts/pdf-parse-extract.mjs "C:\\full\\path\\file.pdf"
 *
 * Output:
 *   JSON to stdout: { ok: true, text: "...", numpages: 11 }
 *   Errors to stderr with exit code 1.
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const inputPath = process.argv[2];

function die(msg, err) {
  const details = err?.stack || err?.message || String(err || "");
  process.stderr.write(`[pdf-parse-extract] ${msg}\n${details}\n`);
  process.exit(1);
}

if (!inputPath) {
  die(
    "Missing PDF path argument.\nExample: node scripts/pdf-parse-extract.mjs \"C:\\path\\file.pdf\""
  );
}

const absPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);

if (!fs.existsSync(absPath)) {
  die(`File not found: ${absPath}`);
}

let pdfParseFn;
try {
  // IMPORTANT: require the library entry directly to avoid index.js "self-test" mode.
  pdfParseFn = require("pdf-parse/lib/pdf-parse.js");
  if (pdfParseFn?.default && typeof pdfParseFn.default === "function") pdfParseFn = pdfParseFn.default;
} catch (e) {
  die("Failed to load pdf-parse/lib/pdf-parse.js", e);
}

if (typeof pdfParseFn !== "function") {
  die(`pdf-parse did not export a function (got: ${typeof pdfParseFn}).`);
}

try {
  const buf = fs.readFileSync(absPath);
  const parsed = await pdfParseFn(buf);

  const text = String(parsed?.text || "");
  const numpages = Number.isFinite(parsed?.numpages) ? parsed.numpages : null;

  process.stdout.write(JSON.stringify({ ok: true, text, numpages }));
} catch (e) {
  die("Extraction failed", e);
}
