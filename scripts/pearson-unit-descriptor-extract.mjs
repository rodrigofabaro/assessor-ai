#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PDFDocument } from "pdf-lib";

const DEFAULT_LIST = "data/pearson/unit-lists/engineering-active-units-2024.json";
const DEFAULT_SRC_DIR = "data/pearson/source";
const DEFAULT_OUT_DIR = "data/pearson/engineering-suite-2024";
const DEFAULT_PDF_NAME = "btec-hncd-unit-descriptor-engineering-suite-2024.pdf";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, inlineV] = a.split("=", 2);
    const key = k.replace(/^--/, "");
    if (inlineV !== undefined) {
      out[key] = inlineV;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function normalizeSpace(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function slugify(v) {
  return normalizeSpace(v)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function ensureDir(p) {
  return fs.mkdir(p, { recursive: true });
}

function pageTextFromTextContent(textContent) {
  const rows = new Map();
  for (const item of textContent.items || []) {
    const raw = String(item?.str || "");
    const str = raw.replace(/\s+/g, " ").trim();
    if (!str) continue;
    const yRaw = Number(item?.transform?.[5] ?? 0);
    const yBucket = Math.round(yRaw * 2) / 2;
    const x = Number(item?.transform?.[4] ?? 0);
    const list = rows.get(yBucket) || [];
    list.push({ x, str });
    rows.set(yBucket, list);
  }
  const orderedY = Array.from(rows.keys()).sort((a, b) => b - a);
  const lines = orderedY.map((y) =>
    (rows.get(y) || [])
      .sort((a, b) => a.x - b.x)
      .map((r) => r.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  );
  return lines.filter(Boolean).join("\n");
}

async function extractPageTexts(pdfBytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
    pages.push(pageTextFromTextContent(textContent));
  }
  return { pageTexts: pages, numPages: doc.numPages };
}

function parseUnitHeaderFromPageText(pageText) {
  const txt = normalizeSpace(pageText);
  if (!txt) return null;
  const hasDescriptorSignals =
    /\bUnit\s+code\b/i.test(txt) &&
    (/\bUnit\s+level\b/i.test(txt) || /\bLevel\s*[:\-]?\s*[45]\b/i.test(txt)) &&
    (/\bCredits?(?:\s+value)?\b/i.test(txt) || /\bLearning outcomes?\b/i.test(txt));
  if (!hasDescriptorSignals) return null;

  // Common shapes seen in Pearson descriptors:
  // "Unit 4004: Managing a Professional Engineering Project"
  // "Unit 4004 Managing a Professional Engineering Project"
  // Sometimes line wraps create extra spaces; normalize first.
  const patterns = [
    /\bUnit\s+(\d{4})\s*[:\-–]\s*([A-Z][\s\S]{3,260}?)(?=\s+(?:Unit\s+\d{4}\b|Unit\s+Code\b|Level:|Credits?:|Credit|Learning Outcomes|Learning outcomes|Unit Introduction|Unit descriptor|Introduction)\b|$)/i,
    /\bUnit\s+(\d{4})\s+([A-Z][\s\S]{3,260}?)(?=\s+(?:Unit\s+Code\b|Level:|Credits?:|Credit|Learning Outcomes|Learning outcomes|Unit Introduction|Essential Content|Assessment Criteria|Assessment criteria|Introduction)\b|$)/i,
  ];

  for (const re of patterns) {
    const m = txt.match(re);
    if (!m) continue;
    const code = String(m[1] || "").trim();
    let title = normalizeSpace(m[2] || "");
    title = title
      .replace(/\b(Pearson[- ]set)\b.*$/i, "$1")
      .replace(/\bUnit\s+descriptor\b.*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!/^\d{4}$/.test(code) || title.length < 3) continue;
    return { code, title };
  }

  return null;
}

function buildUnitRanges(pageTexts) {
  const starts = [];
  for (let i = 0; i < pageTexts.length; i += 1) {
    const parsed = parseUnitHeaderFromPageText(pageTexts[i] || "");
    if (!parsed) continue;
    const prev = starts[starts.length - 1];
    if (prev && prev.code === parsed.code) continue; // repeated header page in same unit block
    starts.push({ ...parsed, startPage: i + 1 });
  }

  const units = starts.map((u, idx) => {
    const next = starts[idx + 1];
    return {
      code: u.code,
      title: u.title,
      startPage: u.startPage,
      endPage: next ? next.startPage - 1 : pageTexts.length,
      pageCount: (next ? next.startPage - 1 : pageTexts.length) - u.startPage + 1,
    };
  });

  return units;
}

function titleTokens(value) {
  return new Set(
    normalizeSpace(value)
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !["unit", "pearson", "set", "and", "the", "for"].includes(t))
  );
}

function titleSimilarityScore(a, b) {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  const overlap = hit / Math.max(1, Math.min(ta.size, tb.size));
  const aNorm = normalizeSpace(a).toLowerCase();
  const bNorm = normalizeSpace(b).toLowerCase();
  const containsBonus = aNorm && bNorm && (aNorm.includes(bNorm) || bNorm.includes(aNorm)) ? 0.2 : 0;
  return Math.min(1, overlap + containsBonus);
}

function candidateQualityScore(candidate) {
  let score = 0;
  score += Math.min(15, Number(candidate?.pageCount || 0));
  const title = normalizeSpace(candidate?.title || "").toLowerCase();
  if (!title) score -= 5;
  if (/unit descriptors? for the pearson btec/i.test(title)) score -= 8;
  if (/\bissue\s+\d+\b/i.test(title)) score -= 5;
  if (/\b©\s*pearson\b/i.test(title)) score -= 5;
  return score;
}

function pickBestCandidateForRequest(candidates, requested) {
  const requestedTitle = normalizeSpace(requested?.title || "");
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const ranked = candidates
    .map((c) => {
      const titleScore = requestedTitle ? titleSimilarityScore(requestedTitle, c.title || "") : 0;
      const quality = candidateQualityScore(c);
      return { c, titleScore, quality, total: titleScore * 100 + quality };
    })
    .sort((a, b) => b.total - a.total || b.quality - a.quality || a.c.startPage - b.c.startPage);

  if (!requestedTitle) return ranked[0]?.c || null;
  const best = ranked[0];
  if (!best) return null;
  // Require at least some title evidence to avoid cross-path code collisions.
  if (best.titleScore < 0.35) return null;
  return best.c;
}

function extractUnitMetadata(unitText) {
  const text = String(unitText || "");
  const normalized = normalizeSpace(text);
  const level =
    normalized.match(/\bLevel\s*[:\-]?\s*(4|5)\b/i)?.[1] ||
    normalized.match(/\bRQF\s+Level\s*(4|5)\b/i)?.[1] ||
    null;
  const creditValue =
    normalized.match(/\bCredit(?:\s+value)?\s*[:\-]?\s*(\d{1,3})\b/i)?.[1] ||
    normalized.match(/\bCredits?\s*[:\-]?\s*(\d{1,3})\b/i)?.[1] ||
    null;
  const glh =
    normalized.match(/\bGuided learning hours?\s*[:\-]?\s*(\d{1,4})\b/i)?.[1] ||
    normalized.match(/\bGLH\s*[:\-]?\s*(\d{1,4})\b/i)?.[1] ||
    null;

  const learningOutcomes = extractLearningOutcomes(text);
  const assessmentBlock = extractAssessmentCriteriaBlock(text);
  const criteriaCodesFromBlock = Array.from(
    new Set(Array.from((assessmentBlock || "").matchAll(/\b([PMD]\d{1,2})\b/g)).map((m) => String(m[1] || "").toUpperCase()))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const criteriaCodesFallback = Array.from(new Set(Array.from(text.matchAll(/\b([PMD]\d{1,2})\b/g)).map((m) => m[1].toUpperCase()))).sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true })
  );
  const assessmentCriteriaByLo = extractCriteriaByLoFromAssessmentBlock(assessmentBlock);
  const criteriaCodes = criteriaCodesFromBlock.length ? criteriaCodesFromBlock : criteriaCodesFallback;

  return {
    level: level ? Number(level) : null,
    creditValue: creditValue ? Number(creditValue) : null,
    guidedLearningHours: glh ? Number(glh) : null,
    learningOutcomes,
    assessmentCriteriaByLo,
    criteriaCodes,
  };
}

function cleanSectionLines(blockText) {
  return String(blockText || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").replace(/\f/g, "").replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (!line) return false;
      if (/^Unit Descriptors for the Pearson BTEC Higher Nationals Engineering Suite/i.test(line)) return false;
      if (/^Issue \d+ .*Pearson Education Limited/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      return true;
    });
}

function extractTextBlock(input, startPatterns, endPatterns) {
  const text = String(input || "");
  let startIdx = -1;
  let startLen = 0;
  for (const re of startPatterns) {
    const m = re.exec(text);
    if (m && (startIdx === -1 || m.index < startIdx)) {
      startIdx = m.index;
      startLen = m[0].length;
    }
  }
  if (startIdx < 0) return "";
  const afterStart = text.slice(startIdx + startLen);
  let endIdx = afterStart.length;
  for (const re of endPatterns) {
    const m = re.exec(afterStart);
    if (m && m.index < endIdx) endIdx = m.index;
  }
  return afterStart.slice(0, endIdx).trim();
}

function extractLearningOutcomesSection(text) {
  return extractTextBlock(
    text,
    [/(?:^|\n)Learning Outcomes\s*(?:\n|$)/im],
    [/(?:^|\n)Essential Content\s*(?:\n|$)/im, /(?:^|\n)Learning Outcomes and Assessment Criteria\s*(?:\n|$)/im]
  );
}

function extractAssessmentCriteriaBlock(text) {
  return extractTextBlock(
    text,
    [/(?:^|\n)Learning Outcomes and Assessment Criteria\s*(?:\n|$)/im],
    [/(?:^|\n)Recommended Resources\s*(?:\n|$)/im, /(?:^|\n)Links\s*(?:\n|$)/im, /(?:^|\n)Websites\s*(?:\n|$)/im]
  );
}

function extractLearningOutcomes(text) {
  const block = extractLearningOutcomesSection(text);
  const lines = cleanSectionLines(block);
  const out = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const description = normalizeSpace(current.parts.join(" "));
    if (description) out.push({ id: current.id, description: description.replace(/\s+−\s+/g, " - ") });
    current = null;
  };

  for (const line of lines) {
    if (/^By the end of this unit students will be able to[:]?$/i.test(line)) continue;
    const m = line.match(/^LO\s*([1-9]\d?)\s+(.+)$/i);
    if (m) {
      flush();
      current = { id: `LO${String(m[1])}`, parts: [String(m[2] || "")] };
      continue;
    }
    if (!current) continue;
    if (/^(LO\s*\d+\b|Pass Merit Distinction\b|P\d+\b|M\d+\b|D\d+\b)/i.test(line)) {
      flush();
      continue;
    }
    current.parts.push(line);
  }
  flush();

  // Dedupe by LO id, keeping the longest description.
  const byId = new Map();
  for (const lo of out) {
    const prev = byId.get(lo.id);
    if (!prev || String(lo.description).length > String(prev.description).length) byId.set(lo.id, lo);
  }
  return Array.from(byId.values()).sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
}

function extractCriteriaByLoFromAssessmentBlock(blockText) {
  const lines = cleanSectionLines(blockText);
  if (!lines.length) return null;
  const byLo = new Map();
  let currentLos = [];

  const ensureLo = (loId) => {
    if (!byLo.has(loId)) byLo.set(loId, []);
    return byLo.get(loId);
  };

  for (const line of lines) {
    if (/^Pass Merit Distinction$/i.test(line)) continue;
    const loHeader = line.match(/^LO\s*([1-9]\d?)([\s\S]*)$/i);
    if (loHeader) {
      const loIds = Array.from(line.matchAll(/\bLO\s*([1-9]\d?)\b/gi)).map((m) => `LO${String(m[1])}`);
      currentLos = Array.from(new Set(loIds));
      for (const lo of currentLos) ensureLo(lo);
      continue;
    }

    const codes = Array.from(line.matchAll(/\b([PMD]\d{1,2})\b/g)).map((m) => String(m[1] || "").toUpperCase());
    if (!codes.length || !currentLos.length) continue;
    for (const lo of currentLos) {
      const list = ensureLo(lo);
      for (const code of codes) {
        if (!list.includes(code)) list.push(code);
      }
    }
  }

  if (!byLo.size) return null;
  const obj = {};
  for (const [lo, codes] of Array.from(byLo.entries()).sort((a, b) => Number(a[0].slice(2)) - Number(b[0].slice(2)))) {
    obj[lo] = [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  return obj;
}

async function splitUnits(input) {
  const {
    pdfBytes,
    pageTexts,
    allUnits,
    selectedUnitsByCode,
    outDir,
    sourcePdfPath,
    listPath,
  } = input;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const unitsDir = path.join(outDir, "unit-pdfs");
  const textsDir = path.join(outDir, "unit-text");
  const jsonDir = path.join(outDir, "unit-json");
  await Promise.all([ensureDir(outDir), ensureDir(unitsDir), ensureDir(textsDir), ensureDir(jsonDir)]);

  const allByCode = new Map();
  for (const u of allUnits) {
    const list = allByCode.get(u.code) || [];
    list.push(u);
    allByCode.set(u.code, list);
  }
  const selectedOutputs = [];
  const missing = [];

  for (const requested of selectedUnitsByCode) {
    const candidates = allByCode.get(requested.code) || [];
    const found = pickBestCandidateForRequest(candidates, requested);
    if (!found) {
      missing.push(requested);
      continue;
    }
    const startIdx = found.startPage - 1;
    const endIdx = found.endPage - 1;
    const indices = [];
    for (let i = startIdx; i <= endIdx; i += 1) indices.push(i);
    const unitPdf = await PDFDocument.create();
    const copied = await unitPdf.copyPages(pdfDoc, indices);
    copied.forEach((p) => unitPdf.addPage(p));
    const pdfOut = await unitPdf.save();

    const chosenTitle = normalizeSpace(requested.title || found.title || `Unit ${found.code}`);
    const fileBase = `${found.code}-${slugify(chosenTitle || found.title || `unit-${found.code}`) || `unit-${found.code}`}`;
    const pdfOutPath = path.join(unitsDir, `${fileBase}.pdf`);
    const textPages = pageTexts.slice(startIdx, endIdx + 1);
    const unitText = textPages.join("\n\n\f\n\n");
    const textOutPath = path.join(textsDir, `${fileBase}.txt`);
    const meta = extractUnitMetadata(unitText);
    const jsonOutPath = path.join(jsonDir, `${fileBase}.json`);

    await fs.writeFile(pdfOutPath, Buffer.from(pdfOut));
    await fs.writeFile(textOutPath, unitText, "utf8");
    await fs.writeFile(
      jsonOutPath,
      JSON.stringify(
        {
          code: found.code,
          title: chosenTitle || found.title,
          detectedTitle: found.title,
          startPage: found.startPage,
          endPage: found.endPage,
          pageCount: found.pageCount,
          ...meta,
        },
        null,
        2
      ),
      "utf8"
    );

    selectedOutputs.push({
      code: found.code,
      requestedTitle: requested.title || null,
      detectedTitle: found.title || null,
      title: chosenTitle || found.title || null,
      startPage: found.startPage,
      endPage: found.endPage,
      pageCount: found.pageCount,
      pdfPath: path.relative(process.cwd(), pdfOutPath).replace(/\\/g, "/"),
      textPath: path.relative(process.cwd(), textOutPath).replace(/\\/g, "/"),
      jsonPath: path.relative(process.cwd(), jsonOutPath).replace(/\\/g, "/"),
      duplicateCandidatesForCode: candidates.length,
      ...meta,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourcePdfPath: path.relative(process.cwd(), sourcePdfPath).replace(/\\/g, "/"),
    sourceListPath: path.relative(process.cwd(), listPath).replace(/\\/g, "/"),
    sourcePdfPageCount: pageTexts.length,
    detectedUnitCount: allUnits.length,
    selectedRequestedCount: selectedUnitsByCode.length,
    selectedExtractedCount: selectedOutputs.length,
    missingRequestedUnits: missing,
    selectedUnits: selectedOutputs,
    allDetectedUnits: allUnits,
  };

  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv);
  const listPath = path.resolve(String(args.list || DEFAULT_LIST));
  const srcDir = path.resolve(String(args.srcDir || DEFAULT_SRC_DIR));
  const outDir = path.resolve(String(args.outDir || DEFAULT_OUT_DIR));
  const pdfPath = path.resolve(String(args.pdf || path.join(srcDir, DEFAULT_PDF_NAME)));

  const listRaw = JSON.parse(await fs.readFile(listPath, "utf8"));
  const requestedUnits = Array.isArray(listRaw?.units) ? listRaw.units : [];
  if (!requestedUnits.length) {
    throw new Error(`No units found in list: ${listPath}`);
  }

  const pdfBytes = await fs.readFile(pdfPath);
  const { pageTexts, numPages } = await extractPageTexts(pdfBytes);
  const allUnits = buildUnitRanges(pageTexts);
  const dedupRequested = [];
  const seen = new Set();
  for (const u of requestedUnits) {
    const code = String(u?.code || "").trim();
    if (!/^\d{4}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    dedupRequested.push({ code, title: u?.title ?? null, note: u?.note ?? null });
  }

  const manifest = await splitUnits({
    pdfBytes,
    pageTexts,
    allUnits,
    selectedUnitsByCode: dedupRequested,
    outDir,
    sourcePdfPath: pdfPath,
    listPath,
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        pdfPath: path.relative(process.cwd(), pdfPath).replace(/\\/g, "/"),
        numPages,
        detectedUnitCount: allUnits.length,
        selectedRequestedCount: dedupRequested.length,
        selectedExtractedCount: manifest.selectedExtractedCount,
        missingRequestedUnits: manifest.missingRequestedUnits.map((u) => u.code),
        manifestPath: path.relative(process.cwd(), path.join(outDir, "manifest.json")).replace(/\\/g, "/"),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  process.stderr.write(`pearson-unit-descriptor-extract failed: ${String(err?.stack || err)}\n`);
  process.exit(1);
});
