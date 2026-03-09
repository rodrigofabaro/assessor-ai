#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

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
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadTsModule(filePath, mocks = {}) {
  const absPath = path.resolve(filePath);
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
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nextServerMock() {
  return {
    NextResponse: {
      json(body, init = {}) {
        return { status: Number(init.status || 200), body };
      },
    },
  };
}

async function testFilesystemModeAcceptsDirectDescriptorUpload() {
  const previousBackend = process.env.STORAGE_BACKEND;
  process.env.STORAGE_BACKEND = "filesystem";
  let importArgs = null;

  try {
    const { POST } = loadTsModule("app/api/admin/spec-suite/import/route.ts", {
      "next/server": nextServerMock(),
      "@vercel/blob": {
        head: async () => {
          throw new Error("blob head should not run for multipart filesystem import");
        },
        del: async () => {
          throw new Error("blob delete should not run for multipart filesystem import");
        },
      },
      "@/lib/auth/requestSession": {
        getRequestOrganizationId: async () => "org_1",
      },
      "@/lib/admin/permissions": {
        isAdminMutationAllowed: async () => ({ ok: true }),
      },
      "@/lib/specSuite/importFromDescriptor": {
        SPEC_SUITE_DEFAULT_CATEGORY: "Engineering",
        SPEC_SUITE_DEFAULT_FRAMEWORK: "Framework",
        importPearsonSpecSuiteFromPdf: async (args) => {
          importArgs = args;
          return {
            summary: {
              created: 1,
              updated: 0,
              missingRequestedCount: 0,
              missingRequestedCodes: [],
              importedCount: 1,
              detectedUnitCount: 1,
              sourcePageCount: 4,
              requestedUnitCount: 1,
              sample: [{ unitCode: "2017", unitTitle: "Testing", action: "created" }],
            },
            report: { rows: [] },
          };
        },
      },
    });

    const form = new FormData();
    form.set("file", new File([Buffer.from("%PDF-test")], "2017-full-descriptor.pdf", { type: "application/pdf" }));
    form.set("framework", "Pearson 2017");
    form.set("category", "Engineering");
    form.set("requestedUnitCodes", JSON.stringify(["2017"]));

    const res = await POST(new Request("http://localhost", { method: "POST", body: form }));
    assert(res.status === 200, "expected direct multipart import success in filesystem mode");
    assert(importArgs, "expected importer to be invoked");
    assert(importArgs.organizationId === "org_1", "expected active organization id");
    assert(importArgs.sourceOriginalFilename === "2017-full-descriptor.pdf", "expected source filename to flow through");
    assert(Array.isArray(importArgs.requestedUnitCodes), "expected requested unit codes array");
    assert(importArgs.requestedUnitCodes.length === 1 && importArgs.requestedUnitCodes[0] === "2017", "expected requested unit code");
    assert(Buffer.isBuffer(importArgs.pdfBytes), "expected importer to receive PDF bytes");
    assert(res.body.ok === true, "expected success payload");
    assert(res.body.sourceFile.pathname === null, "expected no blob pathname in direct-upload response");
  } finally {
    if (previousBackend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = previousBackend;
  }
}

async function testFilesystemModeRejectsJsonBlobMetadataImport() {
  const previousBackend = process.env.STORAGE_BACKEND;
  process.env.STORAGE_BACKEND = "filesystem";

  try {
    const { POST } = loadTsModule("app/api/admin/spec-suite/import/route.ts", {
      "next/server": nextServerMock(),
      "@vercel/blob": {
        head: async () => {
          throw new Error("blob head should not run in filesystem rejection test");
        },
        del: async () => null,
      },
      "@/lib/auth/requestSession": {
        getRequestOrganizationId: async () => "org_1",
      },
      "@/lib/admin/permissions": {
        isAdminMutationAllowed: async () => ({ ok: true }),
      },
      "@/lib/specSuite/importFromDescriptor": {
        SPEC_SUITE_DEFAULT_CATEGORY: "Engineering",
        SPEC_SUITE_DEFAULT_FRAMEWORK: "Framework",
        importPearsonSpecSuiteFromPdf: async () => {
          throw new Error("importer should not run for invalid json transport");
        },
      },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceBlobUrl: "https://example.com/test.pdf", sourceOriginalFilename: "test.pdf" }),
      }),
    );
    assert(res.status === 409, "expected filesystem mode json import to be rejected");
    assert(res.body.code === "SPEC_SUITE_DIRECT_UPLOAD_REQUIRED", "expected explicit direct upload requirement");
  } finally {
    if (previousBackend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = previousBackend;
  }
}

async function main() {
  await testFilesystemModeAcceptsDirectDescriptorUpload();
  await testFilesystemModeRejectsJsonBlobMetadataImport();
  console.log("spec suite import transport contract tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
