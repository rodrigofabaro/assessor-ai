#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const {
    parseResendLifecycleEvent,
    classifyResendLifecycle,
    verifyResendSvixSignature,
  } = loadTsModule("lib/email/resendWebhook.ts");

  const payload = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-03-06T13:30:00.000Z",
    data: {
      email_id: "msg_123",
      to: ["rodrigo@unicourse.org"],
      subject: "Test",
    },
  });
  const parsed = parseResendLifecycleEvent(payload);
  assert(parsed, "expected webhook payload to parse");
  assert(parsed.eventType === "email.delivered", "expected delivered event type");
  assert(parsed.messageId === "msg_123", "expected message id");
  assert(parsed.recipientDomain === "unicourse.org", "expected recipient domain extraction");
  assert(classifyResendLifecycle(parsed.eventType) === "delivered", "expected lifecycle classification delivered");
  assert(classifyResendLifecycle("email.bounced") === "bounced", "expected bounced classification");
  assert(classifyResendLifecycle("email.opened") === "opened", "expected opened classification");
  assert(classifyResendLifecycle("email.clicked") === "clicked", "expected clicked classification");

  const svixId = "msg_webhook_1";
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_abc" } });
  const decodedSecret = "assessor-ai-test-secret";
  const secret = `whsec_${Buffer.from(decodedSecret, "utf8").toString("base64")}`;
  const signedPayload = `${svixId}.${svixTimestamp}.${body}`;
  const signature = crypto.createHmac("sha256", Buffer.from(decodedSecret, "utf8")).update(signedPayload).digest("base64");

  const verified = verifyResendSvixSignature({
    body,
    secret,
    headers: {
      svixId,
      svixTimestamp,
      svixSignature: `v1,${signature}`,
    },
  });
  assert(verified === true, "expected signature verification to pass");

  const bad = verifyResendSvixSignature({
    body,
    secret,
    headers: {
      svixId,
      svixTimestamp,
      svixSignature: "v1,invalid",
    },
  });
  assert(bad === false, "expected signature verification to fail with invalid signature");

  console.log("resend webhook parsing tests passed.");
}

run();

