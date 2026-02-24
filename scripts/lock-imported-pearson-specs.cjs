#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

function cleanCode(input) {
  return String(input || "").trim().replace(/\s+/g, "").toUpperCase();
}

function inferBand(acCode) {
  const c = cleanCode(acCode);
  if (c.startsWith("P")) return "PASS";
  if (c.startsWith("M")) return "MERIT";
  return "DISTINCTION";
}

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

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = args["dry-run"] === true || String(args["dry-run"] || "").toLowerCase() === "true";
  const importSource = String(args.source || "pearson-engineering-suite-2024");
  const lockedBy = String(args["locked-by"] || "codex-bulk-import");

  const prisma = new PrismaClient();
  const now = new Date();

  try {
    const docs = await prisma.referenceDocument.findMany({
      where: {
        type: "SPEC",
      },
      orderBy: { uploadedAt: "asc" },
    });

    const imported = docs.filter((d) => String(d?.sourceMeta?.importSource || "") === importSource);
    let processed = 0;
    let docsLocked = 0;
    let unitsTouched = 0;
    let loUpserts = 0;
    let criteriaUpserts = 0;
    let skipped = 0;
    const sample = [];

    for (const doc of imported) {
      const draft = doc.extractedJson;
      if (!draft || draft.kind !== "SPEC") {
        skipped += 1;
        continue;
      }

      const spec = draft;
      const unitCode = String(spec?.unit?.unitCode || doc?.sourceMeta?.unitCode || "").trim();
      const unitTitle = String(spec?.unit?.unitTitle || doc.title || "").trim();
      if (!unitCode || !unitTitle) {
        skipped += 1;
        continue;
      }
      processed += 1;

      if (dryRun) {
        sample.push({ docId: doc.id, unitCode, unitTitle, action: "lock" });
        continue;
      }

      let unit = await prisma.unit.findFirst({
        where: { unitCode },
        orderBy: { createdAt: "desc" },
      });

      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            unitCode,
            unitTitle,
            status: "LOCKED",
            specDocumentId: doc.id,
            specIssue: spec?.unit?.specIssue || doc?.sourceMeta?.specIssue || null,
            specVersionLabel: spec?.unit?.specVersionLabel || doc?.sourceMeta?.specVersionLabel || null,
            lockedAt: now,
            lockedBy,
            sourceMeta: {
              ...(unit?.sourceMeta || {}),
              importedFromReferenceDocumentId: doc.id,
              importSource,
            },
          },
        });
      } else {
        unit = await prisma.unit.update({
          where: { id: unit.id },
          data: {
            unitTitle,
            status: "LOCKED",
            specDocumentId: doc.id,
            specIssue: spec?.unit?.specIssue || doc?.sourceMeta?.specIssue || unit.specIssue || null,
            specVersionLabel: spec?.unit?.specVersionLabel || doc?.sourceMeta?.specVersionLabel || unit.specVersionLabel || null,
            lockedAt: unit.lockedAt || now,
            lockedBy: unit.lockedBy || lockedBy,
            sourceMeta: {
              ...(unit.sourceMeta || {}),
              importedFromReferenceDocumentId: doc.id,
              importSource,
            },
          },
        });
      }
      unitsTouched += 1;

      for (const lo of Array.isArray(spec.learningOutcomes) ? spec.learningOutcomes : []) {
        const loCode = cleanCode(lo.loCode);
        if (!loCode) continue;
        const loRec = await prisma.learningOutcome.upsert({
          where: { unitId_loCode: { unitId: unit.id, loCode } },
          update: {
            description: String(lo.description || ""),
            essentialContent: lo.essentialContent || null,
          },
          create: {
            unitId: unit.id,
            loCode,
            description: String(lo.description || ""),
            essentialContent: lo.essentialContent || null,
          },
        });
        loUpserts += 1;

        for (const c of Array.isArray(lo.criteria) ? lo.criteria : []) {
          const acCode = cleanCode(c.acCode);
          if (!acCode) continue;
          const gradeBand = c.gradeBand || inferBand(acCode);
          await prisma.assessmentCriterion.upsert({
            where: { learningOutcomeId_acCode: { learningOutcomeId: loRec.id, acCode } },
            update: {
              gradeBand,
              description: String(c.description || ""),
            },
            create: {
              learningOutcomeId: loRec.id,
              acCode,
              gradeBand,
              description: String(c.description || ""),
            },
          });
          criteriaUpserts += 1;
        }
      }

      await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: {
          status: "LOCKED",
          lockedAt: doc.lockedAt || now,
          lockedBy: doc.lockedBy || lockedBy,
          extractedJson: draft,
        },
      });
      docsLocked += 1;

      if (sample.length < 8) sample.push({ docId: doc.id, unitCode, unitTitle, action: "locked" });
    }

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          dryRun,
          importSource,
          importedDocs: imported.length,
          processed,
          docsLocked,
          unitsTouched,
          loUpserts,
          criteriaUpserts,
          skipped,
          sample,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`lock-imported-pearson-specs failed: ${String(err?.stack || err)}\n`);
  process.exit(1);
});

