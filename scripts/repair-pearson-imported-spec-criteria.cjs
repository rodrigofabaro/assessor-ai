#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, inlineV] = a.split("=", 2);
    const key = k.replace(/^--/, "");
    if (inlineV !== undefined) out[key] = inlineV;
    else {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    }
  }
  return out;
}

function normalizeSpace(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function cleanCode(v) {
  const m = String(v || "")
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .match(/^([PMD])\s*(\d{1,2})$/);
  return m ? `${m[1]}${m[2]}` : "";
}

function groupRows(items) {
  const rows = [];
  const sorted = (items || [])
    .map((i) => ({
      str: String(i?.str || ""),
      x: Number(i?.transform?.[4] ?? 0),
      y: Number(i?.transform?.[5] ?? 0),
    }))
    .filter((i) => i.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const tol = 1.5;
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last.y - item.y) > tol) {
      rows.push({ y: item.y, items: [item] });
    } else {
      last.items.push(item);
    }
  }
  return rows.map((r) => ({
    y: r.y,
    items: r.items.sort((a, b) => a.x - b.x),
  }));
}

function rowText(items) {
  return normalizeSpace((items || []).map((i) => i.str).join(" "));
}

function getColumnBounds(rows) {
  let passX = 62;
  let meritX = 217;
  let distX = 395;
  for (const row of rows) {
    const txt = rowText(row.items);
    if (!/\bPass\b/i.test(txt) || !/\bMerit\b/i.test(txt) || !/\bDistinction\b/i.test(txt)) continue;
    for (const it of row.items) {
      const s = normalizeSpace(it.str);
      if (/^Pass$/i.test(s)) passX = it.x;
      else if (/^Merit$/i.test(s)) meritX = it.x;
      else if (/^Distinction$/i.test(s)) distX = it.x;
    }
    break;
  }
  const b1 = (passX + meritX) / 2;
  const b2 = (meritX + distX) / 2;
  return {
    pass: { min: -Infinity, max: b1 },
    merit: { min: b1, max: b2 },
    dist: { min: b2, max: Infinity },
  };
}

function splitRowByColumns(row, bounds) {
  const cols = { pass: [], merit: [], dist: [] };
  for (const it of row.items) {
    if (it.x < bounds.pass.max) cols.pass.push(it);
    else if (it.x < bounds.merit.max) cols.merit.push(it);
    else cols.dist.push(it);
  }
  return {
    pass: rowText(cols.pass),
    merit: rowText(cols.merit),
    dist: rowText(cols.dist),
  };
}

function isFooterRow(text) {
  return (
    /^Unit Descriptors for the Pearson BTEC Higher Nationals Engineering Suite/i.test(text) ||
    /^Issue\s+\d+.*Pearson Education Limited/i.test(text) ||
    /^\d{1,4}$/.test(text)
  );
}

function isAssessmentStartRow(text) {
  return /Learning Outcomes and Assessment Criteria/i.test(text) || /\bPass\b.*\bMerit\b.*\bDistinction\b/i.test(text);
}

function isAssessmentEndRow(text) {
  return /^(Recommended Resources|Journals|Links|This unit links to)\b/i.test(String(text || "").trim());
}

function parseLoIds(text) {
  return Array.from(String(text || "").matchAll(/\bLO\s*([1-9]\d?)\b/gi)).map((m) => `LO${m[1]}`);
}

function parseCriterionStart(cellText) {
  const m = String(cellText || "").match(/^\s*([PMD])\s*([0-9IlO]{1,2})\b\s*(.*)$/i);
  if (!m) return null;
  const code = cleanCode(`${m[1]}${m[2]}`);
  if (!code) return null;
  return { code, rest: normalizeSpace(m[3] || "") };
}

function finalizeDescription(parts) {
  return normalizeSpace(parts.join(" "))
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\bPass Merit Distinction\b/gi, "")
    .trim();
}

async function extractCriteriaDescriptionsFromPdf(pdfPath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const buf = await fs.readFile(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false }).promise;

  const descriptions = new Map();
  let inAssessment = false;
  const open = { pass: null, merit: null, dist: null };

  const flushCell = (col) => {
    const curr = open[col];
    if (!curr) return;
    const desc = finalizeDescription(curr.parts);
    if (desc) {
      const prev = descriptions.get(curr.code) || "";
      if (!prev || desc.length > prev.length) descriptions.set(curr.code, desc);
    }
    open[col] = null;
  };
  const flushAll = () => {
    flushCell("pass");
    flushCell("merit");
    flushCell("dist");
  };

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    const rows = groupRows(tc.items || []);
    if (!rows.length) continue;
    const pageJoined = normalizeSpace(rows.map((r) => rowText(r.items)).join(" "));
    const pageHasAssessment = /Learning Outcomes and Assessment Criteria/i.test(pageJoined) || /\bPass\b.*\bMerit\b.*\bDistinction\b/i.test(pageJoined);

    if (!inAssessment && !pageHasAssessment) continue;
    if (pageHasAssessment) inAssessment = true;
    if (!inAssessment) continue;

    const bounds = getColumnBounds(rows);
    for (const row of rows) {
      const full = rowText(row.items);
      if (!full || isFooterRow(full)) continue;
      if (isAssessmentEndRow(full)) {
        flushAll();
        return Object.fromEntries([...descriptions.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })));
      }
      if (isAssessmentStartRow(full)) continue;

      const loIds = parseLoIds(full);
      if (loIds.length) {
        // LO header rows mark transitions; criteria continue only after these.
        flushAll();
      }

      const cells = splitRowByColumns(row, bounds);
      for (const col of ["pass", "merit", "dist"]) {
        const cell = normalizeSpace(cells[col]);
        if (!cell) continue;
        if (/^(Pass|Merit|Distinction)$/i.test(cell)) continue;
        if (/^LO\s*\d+/i.test(cell)) continue;

        const start = parseCriterionStart(cell);
        if (start) {
          flushCell(col);
          open[col] = { code: start.code, parts: start.rest ? [start.rest] : [] };
          continue;
        }

        if (open[col]) {
          open[col].parts.push(cell);
        }
      }
    }
  }

  flushAll();
  return Object.fromEntries([...descriptions.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })));
}

async function main() {
  const args = parseArgs(process.argv);
  const importSource = String(args.source || "pearson-engineering-suite-2024");
  const dryRun = args["dry-run"] === true || String(args["dry-run"] || "").toLowerCase() === "true";
  const prisma = new PrismaClient();
  try {
    const docs = await prisma.referenceDocument.findMany({
      where: { type: "SPEC" },
      orderBy: { uploadedAt: "asc" },
    });
    const imported = docs.filter((d) => String(d?.sourceMeta?.importSource || "") === importSource);

    let patchedDocs = 0;
    let patchedCriteria = 0;
    let skipped = 0;
    const sample = [];

    for (const doc of imported) {
      const storagePath = String(doc.storagePath || "").replace(/\//g, path.sep);
      const pdfPathAbs = path.resolve(process.cwd(), storagePath);
      let acDescriptions;
      try {
        acDescriptions = await extractCriteriaDescriptionsFromPdf(pdfPathAbs);
      } catch (err) {
        skipped += 1;
        if (sample.length < 6) sample.push({ docId: doc.id, unitCode: doc.sourceMeta?.unitCode, error: String(err.message || err) });
        continue;
      }

      const extracted = doc.extractedJson && typeof doc.extractedJson === "object" ? JSON.parse(JSON.stringify(doc.extractedJson)) : null;
      if (!extracted || extracted.kind !== "SPEC" || !Array.isArray(extracted.learningOutcomes)) {
        skipped += 1;
        continue;
      }

      let docCriteriaChanges = 0;
      for (const lo of extracted.learningOutcomes) {
        const list = Array.isArray(lo.criteria) ? lo.criteria : [];
        for (const c of list) {
          const code = cleanCode(c.acCode);
          const desc = acDescriptions[code];
          if (!code || !desc) continue;
          if (normalizeSpace(c.description) !== normalizeSpace(desc)) {
            c.description = desc;
            docCriteriaChanges += 1;
          }
        }
      }

      if (!dryRun && docCriteriaChanges > 0) {
        const nextSourceMeta = {
          ...(doc.sourceMeta || {}),
          criteriaDescriptionsVerified: true,
          criteriaDescriptionsVerifiedAt: new Date().toISOString(),
          criteriaDescriptionsVerifiedBy: "pearson-column-repair",
        };
        await prisma.referenceDocument.update({
          where: { id: doc.id },
          data: {
            extractedJson: extracted,
            sourceMeta: nextSourceMeta,
            status: doc.status === "FAILED" ? "EXTRACTED" : doc.status,
          },
        });

        const unit = await prisma.unit.findFirst({
          where: { specDocumentId: doc.id },
          select: { id: true, learningOutcomes: { select: { id: true, loCode: true } } },
        });
        if (unit) {
          const loByCode = new Map((unit.learningOutcomes || []).map((lo) => [String(lo.loCode || "").toUpperCase(), lo.id]));
          for (const lo of extracted.learningOutcomes) {
            const loId = loByCode.get(String(lo.loCode || "").toUpperCase());
            if (!loId) continue;
            for (const c of Array.isArray(lo.criteria) ? lo.criteria : []) {
              const code = cleanCode(c.acCode);
              const desc = normalizeSpace(c.description);
              if (!code || !desc) continue;
              await prisma.assessmentCriterion.updateMany({
                where: { learningOutcomeId: loId, acCode: code },
                data: { description: desc },
              });
              patchedCriteria += 1;
            }
          }
        }
      } else if (!dryRun && docCriteriaChanges === 0) {
        const nextSourceMeta = {
          ...(doc.sourceMeta || {}),
          criteriaDescriptionsVerified: true,
          criteriaDescriptionsVerifiedAt: new Date().toISOString(),
          criteriaDescriptionsVerifiedBy: "pearson-column-repair",
        };
        await prisma.referenceDocument.update({
          where: { id: doc.id },
          data: { sourceMeta: nextSourceMeta },
        });
      }

      if (docCriteriaChanges > 0) patchedDocs += 1;
      if (sample.length < 10) {
        sample.push({
          docId: doc.id,
          unitCode: doc.sourceMeta?.unitCode || extracted?.unit?.unitCode || null,
          criteriaDetected: Object.keys(acDescriptions).length,
          criteriaPatched: docCriteriaChanges,
          p1: acDescriptions.P1 || null,
        });
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          dryRun,
          importSource,
          importedDocs: imported.length,
          patchedDocs,
          patchedCriteriaUpdates: patchedCriteria,
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
  process.stderr.write(`repair-pearson-imported-spec-criteria failed: ${String(err?.stack || err)}\n`);
  process.exit(1);
});

