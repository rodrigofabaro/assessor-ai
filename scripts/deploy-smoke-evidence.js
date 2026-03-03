#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    baseUrl: (() => {
      const idx = argv.findIndex((a) => a === "--base-url");
      return idx >= 0 ? String(argv[idx + 1] || "").trim() : "";
    })(),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function toStamp(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function fetchJson(url, init) {
  const startedAt = Date.now();
  const res = await fetch(url, init);
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return {
    ok: res.ok,
    status: res.status,
    json,
    ms: Date.now() - startedAt,
  };
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

async function buildSamplePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const text = [
    "Deploy smoke sample submission",
    `Generated: ${nowIso()}`,
    "This file validates upload/extract/grade/export/replay path.",
  ].join("\n");
  page.drawText(text, { x: 48, y: 760, size: 12 });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function pollSubmissionReady(baseUrl, submissionId, timeoutMs = 120000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const getRes = await fetchJson(`${baseUrl}/api/submissions/${submissionId}`, { cache: "no-store" });
    if (!getRes.ok) throw new Error(`Poll submission failed (${getRes.status})`);
    const submission = getRes.json?.submission || {};
    const status = String(submission?.status || "");
    const latestAssessment = Array.isArray(submission?.assessments) ? submission.assessments[0] : null;
    last = {
      status,
      hasExtraction: Array.isArray(submission?.extractionRuns) && submission.extractionRuns.length > 0,
      hasAssessment: Boolean(latestAssessment?.id),
      hasMarkedPdf: Boolean(String(latestAssessment?.annotatedPdfPath || "").trim()),
      latestAssessmentId: latestAssessment?.id || null,
    };
    if (last.hasExtraction) return { ...last, polledMs: Date.now() - started };
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ...(last || {}), polledMs: Date.now() - started, timeout: true };
}

async function ensureStudent(baseUrl) {
  const queryRes = await fetchJson(`${baseUrl}/api/students?query=TS001`, { cache: "no-store" });
  if (!queryRes.ok) throw new Error(`Student query failed (${queryRes.status})`);
  const students = Array.isArray(queryRes.json) ? queryRes.json : [];
  const ts = students.find((s) => String(s?.externalRef || "").toUpperCase() === "TS001");
  if (ts?.id) return { id: ts.id, source: "seeded" };

  const suffix = Date.now();
  const createRes = await fetchJson(`${baseUrl}/api/students`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Deploy Smoke Student",
      externalRef: `SMOKE-${suffix}`,
      email: `deploy-smoke-${suffix}@example.test`,
      courseName: "Smoke Validation",
    }),
  });
  if (!createRes.ok) throw new Error(`Student create failed (${createRes.status})`);
  return { id: createRes.json?.id, source: "created" };
}

async function resolveAssignment(baseUrl) {
  const listRes = await fetchJson(`${baseUrl}/api/assignments`, { cache: "no-store" });
  if (!listRes.ok) throw new Error(`Assignment list failed (${listRes.status})`);
  const assignments = Array.isArray(listRes.json) ? listRes.json : [];
  const preferred = assignments.find((a) => String(a?.unitCode || "") === "4017" && String(a?.assignmentRef || "").toUpperCase() === "A1");
  const chosen = preferred || assignments[0];
  if (!chosen?.id) throw new Error("No assignments available.");
  return {
    id: chosen.id,
    unitCode: chosen.unitCode || null,
    assignmentRef: chosen.assignmentRef || null,
    title: chosen.title || null,
    source: preferred ? "preferred" : "fallback-first",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl || process.env.DEPLOY_SMOKE_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

  if (args.dryRun) {
    console.log(`deploy smoke dry-run ok: baseUrl=${baseUrl}`);
    return;
  }

  const evidence = {
    generatedAt: nowIso(),
    baseUrl,
    steps: {},
    result: { ok: false, message: "" },
  };

  try {
    const pdf = await buildSamplePdfBuffer();
    const filename = `deploy-smoke-${Date.now()}.pdf`;

    const uploadForm = new FormData();
    uploadForm.append("files", new Blob([pdf], { type: "application/pdf" }), filename);
    const upload = await fetchJson(`${baseUrl}/api/submissions/upload`, { method: "POST", body: uploadForm });
    evidence.steps.upload = {
      status: upload.status,
      ms: upload.ms,
      error: upload.ok ? null : upload.json?.error || upload.json?.userMessage || null,
      code: upload.ok ? null : upload.json?.code || null,
    };
    if (!upload.ok) throw new Error(`Upload failed (${upload.status})`);

    const submissionId = upload.json?.submissions?.[0]?.id;
    if (!submissionId) throw new Error("Upload response missing submission id.");
    evidence.submissionId = submissionId;

    const extract = await fetchJson(`${baseUrl}/api/submissions/${submissionId}/extract?force=1`, { method: "POST" });
    evidence.steps.extract = {
      status: extract.status,
      ms: extract.ms,
      ok: extract.ok,
      error: extract.ok ? null : extract.json?.error || extract.json?.userMessage || null,
      code: extract.ok ? null : extract.json?.code || null,
    };
    if (!extract.ok) throw new Error(`Extract failed (${extract.status})`);

    const student = await ensureStudent(baseUrl);
    evidence.steps.student = student;

    const linkStudent = await fetchJson(`${baseUrl}/api/submissions/${submissionId}/link-student`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId: student.id }),
    });
    evidence.steps.linkStudent = { status: linkStudent.status, ms: linkStudent.ms };
    if (!linkStudent.ok) throw new Error(`Link student failed (${linkStudent.status})`);

    const assignment = await resolveAssignment(baseUrl);
    evidence.steps.assignment = assignment;

    const linkAssignment = await fetchJson(`${baseUrl}/api/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignmentId: assignment.id }),
    });
    evidence.steps.linkAssignment = { status: linkAssignment.status, ms: linkAssignment.ms };
    if (!linkAssignment.ok) throw new Error(`Link assignment failed (${linkAssignment.status})`);

    const grade = await fetchJson(`${baseUrl}/api/submissions/${submissionId}/grade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    evidence.steps.grade = {
      status: grade.status,
      ms: grade.ms,
      overallGrade: grade.json?.assessment?.overallGrade || null,
      assessmentId: grade.json?.assessment?.id || null,
      error: grade.ok ? null : grade.json?.error || grade.json?.userMessage || null,
      code: grade.ok ? null : grade.json?.code || null,
    };
    if (!grade.ok) throw new Error(`Grade failed (${grade.status})`);

    const ready = await pollSubmissionReady(baseUrl, submissionId, 120000);
    evidence.steps.poll = ready;

    const markedStarted = Date.now();
    const markedRes = await fetch(`${baseUrl}/api/submissions/${submissionId}/marked-file`, { cache: "no-store" });
    const markedBytes = Buffer.from(await markedRes.arrayBuffer());
    evidence.steps.markedPdf = { status: markedRes.status, ms: Date.now() - markedStarted, bytes: markedBytes.byteLength };
    if (!markedRes.ok || markedBytes.byteLength < 100) throw new Error(`Marked PDF fetch failed (${markedRes.status})`);

    const pack = await fetchJson(`${baseUrl}/api/submissions/${submissionId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const exportId = String(pack.json?.pack?.exportId || "").trim();
    evidence.steps.exportPack = { status: pack.status, ms: pack.ms, exportId };
    if (!pack.ok || !exportId) throw new Error(`Export pack failed (${pack.status})`);

    const replay = await fetchJson(`${baseUrl}/api/submissions/${submissionId}/export/replay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exportId }),
    });
    evidence.steps.replay = {
      status: replay.status,
      ms: replay.ms,
      hashMatch: Boolean(replay.json?.replay?.hashMatch),
      assessmentHashMatch: Boolean(replay.json?.replay?.assessmentHashMatch),
      fileDiffCount: Array.isArray(replay.json?.replay?.fileDiffs) ? replay.json.replay.fileDiffs.length : 0,
      error: replay.ok ? null : replay.json?.error || replay.json?.userMessage || null,
      code: replay.ok ? null : replay.json?.code || null,
    };
    if (!replay.ok) throw new Error(`Replay failed (${replay.status})`);
    if (!evidence.steps.replay.hashMatch || !evidence.steps.replay.assessmentHashMatch) {
      throw new Error("Replay parity mismatch.");
    }

    evidence.result = { ok: true, message: "deploy smoke passed" };
  } catch (err) {
    evidence.result = { ok: false, message: String(err?.message || err) };
  }

  const stamp = toStamp(new Date());
  const relDir = path.join("docs", "evidence", "deploy-smoke");
  const absDir = path.join(process.cwd(), relDir);
  ensureDir(absDir);
  const relPath = path.join(relDir, `${stamp}.json`).replace(/\\/g, "/");
  fs.writeFileSync(path.join(process.cwd(), relPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (!evidence.result.ok) {
    console.error(`deploy smoke failed: ${evidence.result.message}`);
    console.error(`evidence: ${relPath}`);
    process.exit(1);
  }
  console.log(`deploy smoke passed: ${relPath}`);
}

main().catch((err) => {
  console.error(`deploy smoke crashed: ${String(err?.message || err)}`);
  process.exit(1);
});
