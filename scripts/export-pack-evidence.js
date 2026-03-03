#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    submissionId: (() => {
      const idx = argv.findIndex((a) => a === "--submission");
      if (idx < 0) return "";
      return String(argv[idx + 1] || "").trim();
    })(),
  };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${url} failed (${res.status}): ${String(json?.error || "unknown error")}`);
  }
  return json;
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function toTimestamp(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function resolveSubmissionId(prisma, explicitSubmissionId) {
  if (explicitSubmissionId) {
    const row = await prisma.submission.findUnique({
      where: { id: explicitSubmissionId },
      select: { id: true },
    });
    if (!row) throw new Error(`Submission not found: ${explicitSubmissionId}`);
    return row.id;
  }

  const row = await prisma.submission.findFirst({
    where: {
      assessments: {
        some: {
          annotatedPdfPath: {
            not: null,
          },
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, filename: true, uploadedAt: true },
  });
  if (!row) throw new Error("No eligible submission found (requires at least one assessment with marked PDF).");
  return row.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(process.env.EXPORT_PACK_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
  const prisma = new PrismaClient();
  try {
    const submissionId = await resolveSubmissionId(prisma, args.submissionId);
    if (args.dryRun) {
      console.log(`export pack evidence dry-run ok: submissionId=${submissionId}`);
      return;
    }

    const packRes = await postJson(`${baseUrl}/api/submissions/${submissionId}/export`, {});
    const exportId = String(packRes?.pack?.exportId || "").trim();
    if (!exportId) throw new Error("Export API did not return pack.exportId.");

    const replayRes = await postJson(`${baseUrl}/api/submissions/${submissionId}/export/replay`, { exportId });
    const replay = replayRes?.replay || {};
    const hashMatch = Boolean(replay?.hashMatch);
    const assessmentHashMatch = Boolean(replay?.assessmentHashMatch);
    const fileDiffs = Array.isArray(replay?.fileDiffs) ? replay.fileDiffs : [];
    const allFileMatch = fileDiffs.every((d) => Boolean(d?.match));
    if (!hashMatch || !assessmentHashMatch || !allFileMatch) {
      throw new Error(
        `Replay parity failed for submission=${submissionId} export=${exportId} hashMatch=${hashMatch} assessmentHashMatch=${assessmentHashMatch} allFileMatch=${allFileMatch}`
      );
    }

    const now = new Date();
    const evidence = {
      generatedAt: now.toISOString(),
      baseUrl,
      submissionId,
      exportId,
      replay,
    };
    const relDir = path.join("docs", "evidence", "export-pack");
    const absDir = path.join(process.cwd(), relDir);
    ensureDir(absDir);
    const filename = `${toTimestamp(now)}-${submissionId}-${exportId}.json`;
    const absPath = path.join(absDir, filename);
    fs.writeFileSync(absPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
    console.log(`export pack evidence captured: ${relPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`export pack evidence failed: ${String(err?.message || err)}`);
  process.exit(1);
});
