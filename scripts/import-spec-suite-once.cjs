#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

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

function runNodeScript(scriptRelPath, args) {
  const scriptPath = path.resolve(process.cwd(), scriptRelPath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Failed: node ${scriptRelPath} ${args.join(" ")}`);
  }
}

function asBool(input, fallback) {
  if (input === undefined) return fallback;
  const v = String(input || "").trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = path.resolve(
    process.cwd(),
    String(args.manifest || "data/pearson/engineering-suite-2024/manifest.json")
  );
  const unitList = String(args.list || "data/pearson/unit-lists/engineering-active-units-2024.json");
  const srcDir = String(args.src || "data/pearson/source");
  const outDir = String(args.out || "data/pearson/engineering-suite-2024");
  const pdfName = String(args.pdf || "btec-hncd-unit-descriptor-engineering-suite-2024.pdf");
  const rebuildManifest = asBool(args.rebuildManifest, false);
  const lockAfterImport = asBool(args.lock, true);
  const importStatus = String(args.status || "EXTRACTED").toUpperCase();

  const hasManifest = fs.existsSync(manifest);
  if (!hasManifest || rebuildManifest) {
    runNodeScript("scripts/pearson-unit-descriptor-extract.mjs", [
      "--list",
      unitList,
      "--src",
      srcDir,
      "--out",
      outDir,
      "--pdf",
      pdfName,
    ]);
  }

  runNodeScript("scripts/import-pearson-units-into-reference-specs.cjs", [
    "--manifest",
    manifest,
    "--status",
    importStatus,
  ]);

  if (lockAfterImport) {
    runNodeScript("scripts/lock-imported-pearson-specs.cjs", []);
  }
}

main().catch((err) => {
  process.stderr.write(`import-spec-suite-once failed: ${String(err?.stack || err)}\n`);
  process.exit(1);
});
