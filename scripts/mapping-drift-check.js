#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function normalizeCodes(input) {
  const arr = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(
      arr
        .map((v) => String(v || "").trim().toUpperCase())
        .filter((v) => /^[PMD]\d{1,2}$/.test(v))
    )
  ).sort();
}

function pickExtracted(extractedJson) {
  const ex = extractedJson || {};
  const options = [ex.criteriaCodes, ex.criteriaRefs, ex.detectedCriterionCodes];
  for (const option of options) {
    const n = normalizeCodes(option);
    if (n.length) return n;
  }
  return [];
}

async function run() {
  const briefs = await prisma.assignmentBrief.findMany({
    include: {
      unit: { select: { unitCode: true } },
      briefDocument: { select: { extractedJson: true, originalFilename: true } },
      criteriaMaps: { include: { assessmentCriterion: true } },
    },
  });

  const drifts = [];
  for (const b of briefs) {
    const mapped = normalizeCodes(b.criteriaMaps.map((m) => m.assessmentCriterion.acCode));
    const extracted = pickExtracted(b.briefDocument?.extractedJson);
    const mappedSet = new Set(mapped);
    const extractedSet = new Set(extracted);
    const missing = extracted.filter((c) => !mappedSet.has(c));
    const extra = mapped.filter((c) => !extractedSet.has(c));
    if (missing.length || extra.length) {
      drifts.push({
        unitCode: b.unit?.unitCode || "?",
        assignmentCode: b.assignmentCode,
        filename: b.briefDocument?.originalFilename || "(none)",
        missingInMap: missing,
        extraInMap: extra,
      });
    }
  }

  if (!drifts.length) {
    console.log("mapping drift check passed: no mismatches.");
    return;
  }
  console.error(`mapping drift detected in ${drifts.length} brief(s):`);
  for (const d of drifts) {
    console.error(
      `- ${d.unitCode} ${d.assignmentCode} (${d.filename}) missing:[${d.missingInMap.join(",")}] extra:[${d.extraInMap.join(",")}]`
    );
  }
  process.exitCode = 1;
}

run()
  .catch((e) => {
    console.error("mapping drift check failed:", e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null);
  });

