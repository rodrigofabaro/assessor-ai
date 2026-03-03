#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

function listDirectories(absDir) {
  if (!fs.existsSync(absDir)) return [];
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function validateManifest(absManifestPath) {
  const manifest = readJson(absManifestPath);
  const baseDir = path.dirname(absManifestPath);
  const rel = path.relative(process.cwd(), absManifestPath).replace(/\\/g, "/");
  if (!manifest || typeof manifest !== "object") fail(`Invalid manifest JSON object: ${rel}`);
  if (!String(manifest.exportId || "").trim()) fail(`Missing exportId in ${rel}`);
  if (!String(manifest.submissionId || "").trim()) fail(`Missing submissionId in ${rel}`);
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail(`Missing files[] in ${rel}`);

  const required = ["assessment-snapshot.json", "feedback-summary.txt", "summary.csv", "marked.pdf"];
  const names = new Set(manifest.files.map((f) => String(f?.name || "")));
  for (const req of required) {
    if (!names.has(req)) fail(`Missing required file "${req}" in ${rel}`);
  }
  if (!fs.existsSync(absManifestPath)) fail(`manifest.json missing on disk: ${rel}`);

  for (const file of manifest.files) {
    const name = String(file?.name || "").trim();
    const expectedHash = String(file?.checksumSha256 || "").trim();
    const expectedBytes = Number(file?.bytes || 0);
    if (!name) fail(`Manifest file entry missing name in ${rel}`);
    if (!expectedHash) fail(`Manifest file entry missing checksumSha256 (${name}) in ${rel}`);

    const absFile = path.join(baseDir, name);
    if (!fs.existsSync(absFile)) fail(`Manifest file missing on disk: ${name} (${rel})`);
    const bytes = fs.readFileSync(absFile);
    const actualHash = sha256Bytes(bytes);
    if (actualHash !== expectedHash) {
      fail(`Checksum mismatch for ${name} (${rel}) expected=${expectedHash} actual=${actualHash}`);
    }
    if (expectedBytes > 0 && bytes.byteLength !== expectedBytes) {
      fail(`Byte-size mismatch for ${name} (${rel}) expected=${expectedBytes} actual=${bytes.byteLength}`);
    }
  }
}

function main() {
  const exportsRoot = path.join(process.cwd(), "storage", "exports");
  const submissionDirs = listDirectories(exportsRoot);
  let manifestsChecked = 0;

  for (const submissionId of submissionDirs) {
    const absSubmission = path.join(exportsRoot, submissionId);
    const exportDirs = listDirectories(absSubmission);
    for (const exportId of exportDirs) {
      const absManifest = path.join(absSubmission, exportId, "manifest.json");
      if (!fs.existsSync(absManifest)) continue;
      validateManifest(absManifest);
      manifestsChecked += 1;
    }
  }

  if (manifestsChecked === 0) {
    console.log("export pack validation passed (no manifest files found under storage/exports).");
    return;
  }
  console.log(`export pack validation passed (${manifestsChecked} manifest(s) checked).`);
}

main();
