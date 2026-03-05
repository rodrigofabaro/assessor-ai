import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { parseSpec } from "@/lib/extraction/parsers/specParser";
import { addOrganizationReadScope } from "@/lib/auth/requestSession";
import { toStorageRelativePath, writeStorageFile } from "@/lib/storage/provider";
import activeUnitsJson from "@/data/pearson/unit-lists/engineering-active-units-2024.json";
import extraUnitsJson from "@/data/pearson/unit-lists/engineering-extra-4005-4007.json";

export const SPEC_SUITE_IMPORT_SOURCE = "pearson-engineering-suite-2024";
export const SPEC_SUITE_DEFAULT_FRAMEWORK = "Pearson BTEC Higher Nationals Engineering Suite (2024)";
export const SPEC_SUITE_DEFAULT_CATEGORY = "Engineering";

type RequestedUnit = {
  code: string;
  title: string | null;
};

type DetectedUnit = {
  code: string;
  title: string;
  startPage: number;
  endPage: number;
  pageCount: number;
};

type ExistingSpecDoc = {
  id: string;
  sourceMeta: any;
};

export type SpecSuiteImportSummary = {
  created: number;
  updated: number;
  missingRequestedCount: number;
  missingRequestedCodes: string[];
  importedCount: number;
  detectedUnitCount: number;
  sourcePageCount: number;
  requestedUnitCount: number;
  sample: Array<{ unitCode: string; unitTitle: string; action: "created" | "updated" }>;
};

export type SpecSuiteImportReportRow = {
  unitCode: string;
  requestedTitle: string | null;
  detectedTitle: string | null;
  resolvedTitle: string | null;
  action: "created" | "updated" | "missing";
  startPage: number | null;
  endPage: number | null;
  pageCount: number | null;
  criteriaCount: number | null;
  warnings: string[];
};

export type SpecSuiteImportReport = {
  generatedAt: string;
  sourceOriginalFilename: string;
  framework: string;
  category: string;
  requestedUnitCount: number;
  detectedUnitCount: number;
  sourcePageCount: number;
  summary: SpecSuiteImportSummary;
  missingRequestedCodes: string[];
  rows: SpecSuiteImportReportRow[];
};

export type SpecSuiteImportResult = {
  summary: SpecSuiteImportSummary;
  report: SpecSuiteImportReport;
};

type ImportParams = {
  pdfBytes: Buffer;
  sourceOriginalFilename: string;
  organizationId: string | null;
  framework?: string;
  category?: string;
  requestedUnitCodes?: string[];
  onProgress?: (update: { label: string; percent: number }) => void | Promise<void>;
};

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

function normalizeSpace(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function slugify(v: unknown) {
  return normalizeSpace(v)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function versionFromIssueLabel(label: unknown) {
  const s = String(label || "").trim();
  const m = s.match(/\bissue\s+(\d+)\b/i) || s.match(/\b(\d+)\b/);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function pageTextFromTextContent(textContent: any) {
  const rows = new Map<number, Array<{ x: number; str: string }>>();
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
      .trim(),
  );
  return lines.filter(Boolean).join("\n");
}

async function extractPageTexts(pdfBytes: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = (pdfjs as any).getDocument({
    data: new Uint8Array(pdfBytes),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  } as any);
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent({
      disableCombineTextItems: false,
    } as any);
    pages.push(pageTextFromTextContent(textContent));
  }
  return { pageTexts: pages, pageCount: doc.numPages };
}

function parseUnitHeaderFromPageText(pageText: string) {
  const txt = normalizeSpace(pageText);
  if (!txt) return null;
  const hasDescriptorSignals =
    /\bUnit\s+code\b/i.test(txt) &&
    (/\bUnit\s+level\b/i.test(txt) || /\bLevel\s*[:\-]?\s*[45]\b/i.test(txt)) &&
    (/\bCredits?(?:\s+value)?\b/i.test(txt) || /\bLearning outcomes?\b/i.test(txt));
  if (!hasDescriptorSignals) return null;

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

function buildDetectedUnitRanges(pageTexts: string[]) {
  const starts: Array<{ code: string; title: string; startPage: number }> = [];
  for (let i = 0; i < pageTexts.length; i += 1) {
    const parsed = parseUnitHeaderFromPageText(pageTexts[i] || "");
    if (!parsed) continue;
    const prev = starts[starts.length - 1];
    if (prev && prev.code === parsed.code) continue;
    starts.push({ ...parsed, startPage: i + 1 });
  }
  return starts.map((u, idx) => {
    const next = starts[idx + 1];
    const endPage = next ? next.startPage - 1 : pageTexts.length;
    return {
      code: u.code,
      title: u.title,
      startPage: u.startPage,
      endPage,
      pageCount: endPage - u.startPage + 1,
    };
  });
}

function titleTokens(value: unknown) {
  return new Set(
    normalizeSpace(value)
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !["unit", "pearson", "set", "and", "the", "for"].includes(t)),
  );
}

function titleSimilarityScore(a: unknown, b: unknown) {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) {
    if (tb.has(t)) hit += 1;
  }
  const overlap = hit / Math.max(1, Math.min(ta.size, tb.size));
  const aNorm = normalizeSpace(a).toLowerCase();
  const bNorm = normalizeSpace(b).toLowerCase();
  const containsBonus = aNorm && bNorm && (aNorm.includes(bNorm) || bNorm.includes(aNorm)) ? 0.2 : 0;
  return Math.min(1, overlap + containsBonus);
}

function candidateQualityScore(candidate: DetectedUnit) {
  let score = 0;
  score += Math.min(15, Number(candidate?.pageCount || 0));
  const title = normalizeSpace(candidate?.title || "").toLowerCase();
  if (!title) score -= 5;
  if (/unit descriptors? for the pearson btec/i.test(title)) score -= 8;
  if (/\bissue\s+\d+\b/i.test(title)) score -= 5;
  if (/\b©\s*pearson\b/i.test(title)) score -= 5;
  return score;
}

function pickBestCandidateForRequest(candidates: DetectedUnit[], requested: RequestedUnit) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const requestedTitle = normalizeSpace(requested?.title || "");
  const ranked = candidates
    .map((c) => {
      const titleScore = requestedTitle ? titleSimilarityScore(requestedTitle, c.title || "") : 0;
      const quality = candidateQualityScore(c);
      return { c, titleScore, quality, total: titleScore * 100 + quality };
    })
    .sort((a, b) => b.total - a.total || b.quality - a.quality || a.c.startPage - b.c.startPage);

  if (!requestedTitle) return ranked[0]?.c || null;
  const best = ranked[0];
  if (!best || best.titleScore < 0.35) return null;
  return best.c;
}

function normalizeRequestedUnitCodes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const dedup = new Set<string>();
  for (const raw of input) {
    const code = String(raw || "").trim();
    if (/^\d{4}$/.test(code)) dedup.add(code);
  }
  return Array.from(dedup).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function buildRequestedUnits(requestedUnitCodes?: string[]): RequestedUnit[] {
  const rows = [
    ...(((activeUnitsJson as any)?.units || []) as any[]),
    ...(((extraUnitsJson as any)?.units || []) as any[]),
  ];
  const dedup = new Map<string, RequestedUnit>();
  for (const row of rows) {
    const code = String(row?.code || "").trim();
    if (!/^\d{4}$/.test(code)) continue;
    if (!dedup.has(code)) {
      dedup.set(code, {
        code,
        title: row?.title ? normalizeSpace(row.title) : null,
      });
    }
  }
  const all = Array.from(dedup.values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const normalizedCodes = normalizeRequestedUnitCodes(requestedUnitCodes);
  if (!normalizedCodes.length) return all;
  const selected = new Set(normalizedCodes);
  return all.filter((row) => selected.has(row.code));
}

async function getExistingImportedDocs(organizationId: string | null) {
  const baseWhere: any = { type: "SPEC" };
  const scopedWhere = addOrganizationReadScope(baseWhere, organizationId);
  const select = { id: true, sourceMeta: true };
  let docs: ExistingSpecDoc[] = [];
  try {
    docs = (await prisma.referenceDocument.findMany({
      where: scopedWhere as any,
      select,
    })) as ExistingSpecDoc[];
  } catch (error) {
    if (!organizationId || !isOrgScopeCompatError(error)) throw error;
    docs = (await prisma.referenceDocument.findMany({
      where: baseWhere as any,
      select,
    })) as ExistingSpecDoc[];
  }
  const byUnitCode = new Map<string, ExistingSpecDoc>();
  for (const doc of docs) {
    const meta = doc?.sourceMeta || {};
    if (String(meta?.importSource || "") !== SPEC_SUITE_IMPORT_SOURCE) continue;
    const unitCode = String(meta?.unitCode || "").trim();
    if (!/^\d{4}$/.test(unitCode)) continue;
    byUnitCode.set(unitCode, doc);
  }
  return byUnitCode;
}

async function emitProgress(
  cb: ImportParams["onProgress"],
  label: string,
  percent: number,
) {
  if (!cb) return;
  await cb({ label, percent: Math.max(0, Math.min(100, Math.round(percent))) });
}

export async function importPearsonSpecSuiteFromPdf(params: ImportParams): Promise<SpecSuiteImportResult> {
  const {
    pdfBytes,
    sourceOriginalFilename,
    organizationId,
    framework = SPEC_SUITE_DEFAULT_FRAMEWORK,
    category = SPEC_SUITE_DEFAULT_CATEGORY,
  } = params;

  await emitProgress(params.onProgress, "Preparing requested unit list...", 5);
  const requestedUnits = buildRequestedUnits(params.requestedUnitCodes);
  if (!requestedUnits.length) {
    throw new Error("No unit codes selected for suite import.");
  }
  await emitProgress(params.onProgress, "Reading descriptor pages...", 12);
  const { pageTexts, pageCount } = await extractPageTexts(pdfBytes);
  await emitProgress(params.onProgress, "Detecting unit page ranges...", 22);
  const detectedUnits = buildDetectedUnitRanges(pageTexts);
  const detectedByCode = new Map<string, DetectedUnit[]>();
  for (const unit of detectedUnits) {
    const list = detectedByCode.get(unit.code) || [];
    list.push(unit);
    detectedByCode.set(unit.code, list);
  }

  await emitProgress(params.onProgress, "Loading PDF and existing suite records...", 28);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const existingByUnitCode = await getExistingImportedDocs(organizationId);
  const importTag = `suite-upload-${Date.now()}`;
  let created = 0;
  let updated = 0;
  const missingRequestedCodes: string[] = [];
  const sample: Array<{ unitCode: string; unitTitle: string; action: "created" | "updated" }> = [];
  const reportRows: SpecSuiteImportReportRow[] = [];

  for (let i = 0; i < requestedUnits.length; i += 1) {
    const requested = requestedUnits[i];
    const loopPercent = 32 + (i / Math.max(1, requestedUnits.length)) * 62;
    await emitProgress(
      params.onProgress,
      `Importing unit ${i + 1}/${requestedUnits.length}: ${requested.code}`,
      loopPercent,
    );
    const candidates = detectedByCode.get(requested.code) || [];
    const found = pickBestCandidateForRequest(candidates, requested);
    if (!found) {
      missingRequestedCodes.push(requested.code);
      reportRows.push({
        unitCode: requested.code,
        requestedTitle: requested.title,
        detectedTitle: null,
        resolvedTitle: null,
        action: "missing",
        startPage: null,
        endPage: null,
        pageCount: null,
        criteriaCount: null,
        warnings: ["Requested unit code was not detected in uploaded descriptor PDF."],
      });
      continue;
    }

    const startIdx = found.startPage - 1;
    const endIdx = found.endPage - 1;
    const indices: number[] = [];
    for (let i = startIdx; i <= endIdx; i += 1) indices.push(i);

    const unitPdf = await PDFDocument.create();
    const copiedPages = await unitPdf.copyPages(pdfDoc, indices);
    copiedPages.forEach((p) => unitPdf.addPage(p));
    const unitPdfBytes = Buffer.from(await unitPdf.save());
    const unitText = pageTexts.slice(startIdx, endIdx + 1).join("\n\n\f\n\n");

    const parsed = parseSpec(unitText, sourceOriginalFilename);
    const unitCode = normalizeSpace(parsed?.unit?.unitCode || requested.code || found.code);
    const unitTitle = normalizeSpace(parsed?.unit?.unitTitle || requested.title || found.title || `Unit ${unitCode}`);
    const issueLabel = normalizeSpace(parsed?.unit?.specVersionLabel || parsed?.unit?.specIssue || "Issue 6");
    const version = versionFromIssueLabel(issueLabel);
    const criteriaCount = (Array.isArray(parsed?.learningOutcomes) ? parsed.learningOutcomes : []).reduce((sum, lo) => {
      return sum + (Array.isArray((lo as any)?.criteria) ? (lo as any).criteria.length : 0);
    }, 0);
    const warnings: string[] = [];
    if (!Array.isArray(parsed?.learningOutcomes) || parsed.learningOutcomes.length === 0) {
      warnings.push("No learning outcomes detected from suite split import.");
    }
    if (criteriaCount === 0) {
      warnings.push("No criteria detected from suite split import.");
    }

    const safeSlug = slugify(unitTitle || `unit-${unitCode}`) || `unit-${unitCode}`;
    const originalFilename = `${unitCode}-${safeSlug}.pdf`;
    const storedFilename = `${Date.now()}-${unitCode}-${safeSlug}.pdf`;
    const storagePath = toStorageRelativePath("reference_uploads", "suite", storedFilename);
    const saved = await writeStorageFile(storagePath, unitPdfBytes);
    const checksumSha256 = crypto.createHash("sha256").update(unitPdfBytes).digest("hex");

    const extractedJson = {
      ...parsed,
      unit: {
        ...parsed.unit,
        unitCode,
        unitTitle,
        specIssue: issueLabel || parsed?.unit?.specIssue || null,
        specVersionLabel: issueLabel || parsed?.unit?.specVersionLabel || null,
      },
    };

    const sourceMeta = {
      importSource: SPEC_SUITE_IMPORT_SOURCE,
      importTag,
      importedAt: new Date().toISOString(),
      framework,
      category,
      unitCode,
      unitTitle,
      specIssue: issueLabel || null,
      specVersionLabel: issueLabel || null,
      criteriaDescriptionsVerified: false,
      suiteSourceFilename: sourceOriginalFilename,
      suitePageRange: {
        startPage: found.startPage,
        endPage: found.endPage,
        pageCount: found.pageCount,
      },
    };

    const baseData = {
      type: "SPEC" as const,
      status: "EXTRACTED" as const,
      title: `Unit ${unitCode} - ${unitTitle}`,
      version,
      originalFilename,
      storedFilename,
      storagePath: saved.storagePath,
      checksumSha256,
      extractedJson: extractedJson as any,
      extractionWarnings: warnings as any,
      sourceMeta: sourceMeta as any,
      lockedAt: null,
      lockedBy: null,
    };
    const scopedData = organizationId
      ? {
          ...baseData,
          organizationId,
        }
      : baseData;

    const existing = existingByUnitCode.get(unitCode);
    if (existing) {
      await prisma.referenceDocument.update({
        where: { id: existing.id },
        data: baseData as any,
      });
      updated += 1;
      if (sample.length < 8) sample.push({ unitCode, unitTitle, action: "updated" });
      reportRows.push({
        unitCode,
        requestedTitle: requested.title,
        detectedTitle: found.title,
        resolvedTitle: unitTitle,
        action: "updated",
        startPage: found.startPage,
        endPage: found.endPage,
        pageCount: found.pageCount,
        criteriaCount,
        warnings,
      });
      continue;
    }

    try {
      await prisma.referenceDocument.create({
        data: scopedData as any,
      });
    } catch (error) {
      if (!isOrgScopeCompatError(error)) throw error;
      await prisma.referenceDocument.create({
        data: baseData as any,
      });
    }
    created += 1;
    if (sample.length < 8) sample.push({ unitCode, unitTitle, action: "created" });
    reportRows.push({
      unitCode,
      requestedTitle: requested.title,
      detectedTitle: found.title,
      resolvedTitle: unitTitle,
      action: "created",
      startPage: found.startPage,
      endPage: found.endPage,
      pageCount: found.pageCount,
      criteriaCount,
      warnings,
    });
  }

  const summary: SpecSuiteImportSummary = {
    created,
    updated,
    missingRequestedCount: missingRequestedCodes.length,
    missingRequestedCodes,
    importedCount: created + updated,
    detectedUnitCount: detectedUnits.length,
    sourcePageCount: pageCount,
    requestedUnitCount: requestedUnits.length,
    sample,
  };

  const report: SpecSuiteImportReport = {
    generatedAt: new Date().toISOString(),
    sourceOriginalFilename,
    framework,
    category,
    requestedUnitCount: requestedUnits.length,
    detectedUnitCount: detectedUnits.length,
    sourcePageCount: pageCount,
    summary,
    missingRequestedCodes,
    rows: reportRows,
  };

  await emitProgress(params.onProgress, "Import finished.", 100);
  return { summary, report };
}
