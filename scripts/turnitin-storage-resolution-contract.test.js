#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

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

function loadTsModule(filePath, mocks = {}) {
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
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    if (request.startsWith(".")) {
      const resolved = resolveTsLike(path.resolve(dirname, request));
      if (resolved) return loadTsModule(resolved, mocks);
    }
    if (request.startsWith("@/")) {
      const resolved = resolveTsLike(path.resolve(process.cwd(), request.slice(2)));
      if (resolved) return loadTsModule(resolved, mocks);
    }
    return require(request);
  };

  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(localRequire, mod, mod.exports);
  cache.set(absPath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  let readPath = "";
  global.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ ok: true }),
  });

  const { uploadTurnitinOriginal } = loadTsModule("lib/turnitin/client.ts", {
    "@/lib/storage/provider": {
      readStorageFile: async (storagePath) => {
        readPath = String(storagePath || "");
        return Buffer.from("pdf-bytes");
      },
    },
  });

  await uploadTurnitinOriginal({
    cfg: {
      apiKey: "tt-key",
      baseUrl: "https://example.turnitin.test",
      integrationName: "assessor-ai",
      integrationVersion: "1.0.0",
      locale: "en-US",
    },
    turnitinSubmissionId: "sub-1",
    storagePath: "uploads/example.pdf",
    filename: "example.pdf",
  });

  assert(readPath === "uploads/example.pdf", "expected turnitin upload to read via storage provider");

  const source = fs.readFileSync(path.join(process.cwd(), "lib/turnitin/client.ts"), "utf8");
  assert(source.includes("readStorageFile(input.storagePath)"), "expected turnitin client to resolve storage through provider");

  console.log("turnitin storage resolution contract tests passed.");
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
