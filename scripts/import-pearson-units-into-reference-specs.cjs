#!/usr/bin/env node
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const ts = require("typescript");
const { PrismaClient } = require("@prisma/client");

const cache = new Map();

function resolveTsLike(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function loadTsModule(filePath) {
  const absPath = path.resolve(filePath);
  if (cache.has(absPath)) return cache.get(absPath);
  const source = fs.readFileSync(absPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: absPath,
  }).outputText;
  const mod = { exports: {} };
  const dirname = path.dirname(absPath);
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      const resolved = resolveTsLike(path.resolve(dirname, request));
      if (resolved) return loadTsModule(resolved);
    }
    if (request.startsWith("@/")) {
      const resolved = resolveTsLike(path.resolve(process.cwd(), request.slice(2)));
      if (resolved) return loadTsModule(resolved);
    }
    return require(request);
  };
  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(localRequire, mod, mod.exports);
  cache.set(absPath, mod.exports);
  return mod.exports;
}

function normalizeSpace(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function safeName(name) {
  return String(name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 180);
}

function versionFromIssueLabel(label) {
  const s = String(label || "").trim();
  const m = s.match(/\bissue\s+(\d+)\b/i) || s.match(/\b(\d+)\b/);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : 1;
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
  const manifestPath = path.resolve(
    String(args.manifest || "data/pearson/engineering-suite-2024/manifest.json")
  );
  const dryRun = String(args["dry-run"] || "").toLowerCase() === "true" || args["dry-run"] === true;
  const status = String(args.status || "EXTRACTED").toUpperCase();
  if (!["UPLOADED", "EXTRACTED", "REVIEWED", "LOCKED", "FAILED"].includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const selectedUnits = Array.isArray(manifest?.selectedUnits) ? manifest.selectedUnits : [];
  if (!selectedUnits.length) throw new Error(`No selectedUnits in manifest: ${manifestPath}`);

  const { parseSpec } = loadTsModule("lib/extraction/parsers/specParser/index.ts");
  const prisma = new PrismaClient();

  const importSource = "pearson-engineering-suite-2024";
  const importTag = `pearson-suite-2024-${selectedUnits.length}`;

  try {
    const existingDocs = await prisma.referenceDocument.findMany({
      where: { type: "SPEC" },
      select: {
        id: true,
        title: true,
        originalFilename: true,
        checksumSha256: true,
        sourceMeta: true,
      },
    });
    const existingByKey = new Map();
    for (const doc of existingDocs) {
      const meta = doc.sourceMeta || {};
      const key =
        String(meta.importSource || "") === importSource && String(meta.unitCode || "")
          ? `${String(meta.unitCode)}`
          : "";
      if (key) existingByKey.set(key, doc);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const details = [];

    for (const unit of selectedUnits) {
      const code = String(unit?.code || "").trim();
      if (!code) continue;
      const pdfAbs = path.resolve(process.cwd(), String(unit.pdfPath || ""));
      const textAbs = path.resolve(process.cwd(), String(unit.textPath || ""));
      const pdfBytes = await fsp.readFile(pdfAbs);
      const unitText = await fsp.readFile(textAbs, "utf8");
      const checksumSha256 = crypto.createHash("sha256").update(pdfBytes).digest("hex");

      const parsed = parseSpec(unitText, path.basename(pdfAbs));
      const unitCode = String(parsed?.unit?.unitCode || code).trim() || code;
      const unitTitle = normalizeSpace(parsed?.unit?.unitTitle || unit.title || unit.detectedTitle || `Unit ${unitCode}`);
      const issueLabel = normalizeSpace(parsed?.unit?.specVersionLabel || parsed?.unit?.specIssue || "Issue 6 - October 2025");
      const version = versionFromIssueLabel(issueLabel);

      const sourceMeta = {
        ...(typeof unit === "object" && unit ? { pearsonExtraction: { startPage: unit.startPage, endPage: unit.endPage, pageCount: unit.pageCount } } : {}),
        importSource,
        importTag,
        importedAt: new Date().toISOString(),
        importedFromManifest: path.relative(process.cwd(), manifestPath).replace(/\\/g, "/"),
        unitCode,
        unitTitle,
        specIssue: parsed?.unit?.specIssue || issueLabel || null,
        specVersionLabel: parsed?.unit?.specVersionLabel || issueLabel || null,
      };

      const rowData = {
        type: "SPEC",
        status,
        title: `Unit ${unitCode} - ${unitTitle}`,
        version,
        originalFilename: path.basename(pdfAbs),
        storedFilename: path.basename(pdfAbs),
        storagePath: String(unit.pdfPath || "").replace(/\\/g, "/"),
        checksumSha256,
        extractedJson: parsed,
        extractionWarnings: [],
        sourceMeta,
      };

      const existing = existingByKey.get(unitCode);
      if (dryRun) {
        details.push({ code: unitCode, action: existing ? "update" : "create", title: unitTitle });
        continue;
      }

      if (existing) {
        await prisma.referenceDocument.update({
          where: { id: existing.id },
          data: rowData,
        });
        updated += 1;
        details.push({ code: unitCode, action: "updated", id: existing.id, title: unitTitle });
      } else {
        const createdRow = await prisma.referenceDocument.create({ data: rowData });
        created += 1;
        details.push({ code: unitCode, action: "created", id: createdRow.id, title: unitTitle });
      }
    }

    const out = {
      ok: true,
      dryRun,
      importSource,
      importTag,
      manifestPath: path.relative(process.cwd(), manifestPath).replace(/\\/g, "/"),
      totalRequested: selectedUnits.length,
      created,
      updated,
      skipped,
      sample: details.slice(0, 8),
    };
    process.stdout.write(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`import-pearson-units-into-reference-specs failed: ${String(err?.stack || err)}\n`);
  process.exit(1);
});

