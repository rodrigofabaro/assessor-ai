import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";

type ExportFileRecord = {
  name: string;
  relativePath: string;
  bytes: number;
  checksumSha256: string;
  mimeType: string;
};

type BuildCoreInput = {
  submissionId: string;
  assessment: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    overallGrade: string | null;
    feedbackText: string | null;
    annotatedPdfPath: string | null;
    resultJson: unknown;
  };
  submission: {
    id: string;
    filename: string;
    uploadedAt: Date;
    student: {
      id: string;
      fullName: string | null;
      email: string | null;
      externalRef: string | null;
    } | null;
    assignment: {
      id: string;
      unitCode: string;
      assignmentRef: string | null;
      title: string;
    } | null;
  };
};

function sha256(input: Buffer | string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stableJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (node: any): any => {
    if (node === null || typeof node !== "object") return node;
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) return node.map((item) => walk(item));
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node).sort((a, b) => a.localeCompare(b))) {
      out[key] = walk(node[key]);
    }
    return out;
  };
  return JSON.stringify(walk(value), null, 2);
}

function ensureDir(absDir: string) {
  fs.mkdirSync(absDir, { recursive: true });
}

function writeTextFile(absPath: string, text: string) {
  fs.writeFileSync(absPath, text, "utf8");
  const bytes = Buffer.byteLength(text, "utf8");
  return { bytes, checksumSha256: sha256(text) };
}

function buildAssessmentSnapshot(input: BuildCoreInput) {
  const feedbackText = sanitizeStudentFeedbackText(input.assessment.feedbackText || null) || "";
  const summary = String(feedbackText).replace(/\s+/g, " ").trim().slice(0, 500);
  return {
    submission: {
      id: input.submission.id,
      filename: input.submission.filename,
      uploadedAt: input.submission.uploadedAt.toISOString(),
      student: input.submission.student,
      assignment: input.submission.assignment,
    },
    assessment: {
      id: input.assessment.id,
      createdAt: input.assessment.createdAt.toISOString(),
      updatedAt: input.assessment.updatedAt.toISOString(),
      overallGrade: input.assessment.overallGrade,
      feedbackText,
      feedbackSummary: summary,
      annotatedPdfPath: input.assessment.annotatedPdfPath,
      resultJson: input.assessment.resultJson || null,
    },
  };
}

function buildCsv(snapshot: ReturnType<typeof buildAssessmentSnapshot>) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const s = snapshot.submission;
  const a = snapshot.assessment;
  const header = [
    "submission_id",
    "submission_filename",
    "student_name",
    "student_email",
    "assignment_unit_code",
    "assignment_ref",
    "assignment_title",
    "assessment_id",
    "overall_grade",
    "assessment_created_at",
    "marked_pdf_present",
  ].join(",");
  const row = [
    esc(s.id),
    esc(s.filename),
    esc(s.student?.fullName || ""),
    esc(s.student?.email || ""),
    esc(s.assignment?.unitCode || ""),
    esc(s.assignment?.assignmentRef || ""),
    esc(s.assignment?.title || ""),
    esc(a.id),
    esc(a.overallGrade || ""),
    esc(a.createdAt),
    esc(Boolean(a.annotatedPdfPath)),
  ].join(",");
  return `${header}\n${row}\n`;
}

function fileRel(rootRel: string, exportId: string, name: string) {
  return `${rootRel}/${exportId}/${name}`.replace(/\\/g, "/");
}

async function loadSubmissionAndAssessment(submissionId: string, assessmentId?: string | null) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      filename: true,
      uploadedAt: true,
      student: {
        select: {
          id: true,
          fullName: true,
          email: true,
          externalRef: true,
        },
      },
      assignment: {
        select: {
          id: true,
          unitCode: true,
          assignmentRef: true,
          title: true,
        },
      },
    },
  });
  if (!submission) throw new Error("Submission not found.");

  const assessment = assessmentId
    ? await prisma.assessment.findFirst({
        where: { id: assessmentId, submissionId },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          overallGrade: true,
          feedbackText: true,
          annotatedPdfPath: true,
          resultJson: true,
        },
      })
    : await prisma.assessment.findFirst({
        where: { submissionId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          overallGrade: true,
          feedbackText: true,
          annotatedPdfPath: true,
          resultJson: true,
        },
      });
  if (!assessment) throw new Error("No assessment found for this submission.");
  if (!String(assessment.annotatedPdfPath || "").trim()) throw new Error("Marked PDF is missing for this assessment.");
  return { submission, assessment };
}

function appendRunLog(submissionId: string, payload: {
  exportId: string;
  sourceAssessmentId: string;
  sourceAssessmentHash: string;
  actor: string;
  requestedAt: string;
}) {
  const rel = `storage/exports/${submissionId}/export-runs.jsonl`.replace(/\\/g, "/");
  const abs = path.join(process.cwd(), rel);
  ensureDir(path.dirname(abs));
  fs.appendFileSync(abs, `${JSON.stringify(payload)}\n`, "utf8");
  return rel;
}

export async function createSubmissionExportPack(input: {
  submissionId: string;
  assessmentId?: string | null;
  actor?: string | null;
}) {
  const { submission, assessment } = await loadSubmissionAndAssessment(input.submissionId, input.assessmentId);
  const core = buildAssessmentSnapshot({
    submissionId: input.submissionId,
    submission,
    assessment,
  });
  const assessmentJsonText = stableJsonStringify(core);
  const feedbackSummaryText = String(core.assessment.feedbackSummary || "");
  const csvText = buildCsv(core);
  const sourceAssessmentHash = sha256(assessmentJsonText);

  const markedRel = String(assessment.annotatedPdfPath || "").trim().replace(/\\/g, "/");
  const markedAbs = path.join(process.cwd(), markedRel);
  if (!fs.existsSync(markedAbs)) throw new Error("Marked PDF file not found on disk.");
  const markedBytes = fs.readFileSync(markedAbs);
  const markedHash = sha256(markedBytes);

  const bundleSeed = stableJsonStringify({
    submissionId: input.submissionId,
    sourceAssessmentId: assessment.id,
    sourceAssessmentHash,
    markedHash,
    csvHash: sha256(csvText),
    feedbackSummaryHash: sha256(feedbackSummaryText),
  });
  const bundleHash = sha256(bundleSeed);
  const exportId = bundleHash.slice(0, 20);

  const baseRel = `storage/exports/${input.submissionId}`.replace(/\\/g, "/");
  const baseAbs = path.join(process.cwd(), baseRel, exportId);
  ensureDir(baseAbs);

  const files: ExportFileRecord[] = [];

  const assessmentName = "assessment-snapshot.json";
  const assessmentAbs = path.join(baseAbs, assessmentName);
  const assessmentWrite = writeTextFile(assessmentAbs, assessmentJsonText);
  files.push({
    name: assessmentName,
    relativePath: fileRel(baseRel, exportId, assessmentName),
    bytes: assessmentWrite.bytes,
    checksumSha256: assessmentWrite.checksumSha256,
    mimeType: "application/json",
  });

  const feedbackName = "feedback-summary.txt";
  const feedbackAbs = path.join(baseAbs, feedbackName);
  const feedbackWrite = writeTextFile(feedbackAbs, `${feedbackSummaryText}\n`);
  files.push({
    name: feedbackName,
    relativePath: fileRel(baseRel, exportId, feedbackName),
    bytes: feedbackWrite.bytes,
    checksumSha256: feedbackWrite.checksumSha256,
    mimeType: "text/plain",
  });

  const csvName = "summary.csv";
  const csvAbs = path.join(baseAbs, csvName);
  const csvWrite = writeTextFile(csvAbs, csvText);
  files.push({
    name: csvName,
    relativePath: fileRel(baseRel, exportId, csvName),
    bytes: csvWrite.bytes,
    checksumSha256: csvWrite.checksumSha256,
    mimeType: "text/csv",
  });

  const markedName = "marked.pdf";
  const markedOutAbs = path.join(baseAbs, markedName);
  fs.writeFileSync(markedOutAbs, markedBytes);
  files.push({
    name: markedName,
    relativePath: fileRel(baseRel, exportId, markedName),
    bytes: markedBytes.byteLength,
    checksumSha256: markedHash,
    mimeType: "application/pdf",
  });

  const manifest = {
    exportId,
    submissionId: input.submissionId,
    sourceAssessmentId: assessment.id,
    sourceAssessmentHash,
    bundleHash,
    files,
  };
  const manifestName = "manifest.json";
  const manifestAbs = path.join(baseAbs, manifestName);
  const manifestWrite = writeTextFile(manifestAbs, `${stableJsonStringify(manifest)}\n`);
  files.push({
    name: manifestName,
    relativePath: fileRel(baseRel, exportId, manifestName),
    bytes: manifestWrite.bytes,
    checksumSha256: manifestWrite.checksumSha256,
    mimeType: "application/json",
  });

  const requestedAt = new Date().toISOString();
  const actor = String(input.actor || "system").trim() || "system";
  const runLogPath = appendRunLog(input.submissionId, {
    exportId,
    sourceAssessmentId: assessment.id,
    sourceAssessmentHash,
    actor,
    requestedAt,
  });

  return {
    exportId,
    submissionId: input.submissionId,
    sourceAssessmentId: assessment.id,
    sourceAssessmentHash,
    bundleHash,
    requestedAt,
    actor,
    runLogPath,
    files,
  };
}

export async function replaySubmissionExportPack(input: {
  submissionId: string;
  exportId: string;
}) {
  const baseRel = `storage/exports/${input.submissionId}/${input.exportId}`.replace(/\\/g, "/");
  const manifestAbs = path.join(process.cwd(), baseRel, "manifest.json");
  if (!fs.existsSync(manifestAbs)) throw new Error("Export manifest not found.");

  const manifest = JSON.parse(fs.readFileSync(manifestAbs, "utf8")) as {
    exportId: string;
    submissionId: string;
    sourceAssessmentId: string;
    sourceAssessmentHash: string;
    bundleHash: string;
    files?: Array<{ name: string; checksumSha256: string }>;
  };
  if (manifest.submissionId !== input.submissionId) throw new Error("Export submission mismatch.");

  const rebuilt = await createSubmissionExportPack({
    submissionId: input.submissionId,
    assessmentId: manifest.sourceAssessmentId,
    actor: "replay-check",
  });
  const hashMatch = rebuilt.bundleHash === manifest.bundleHash;
  const assessmentHashMatch = rebuilt.sourceAssessmentHash === manifest.sourceAssessmentHash;

  const fileDiffs = (manifest.files || []).map((file) => {
    const now = rebuilt.files.find((f) => f.name === file.name);
    return {
      name: file.name,
      expectedChecksumSha256: file.checksumSha256,
      actualChecksumSha256: now?.checksumSha256 || null,
      match: Boolean(now && now.checksumSha256 === file.checksumSha256),
    };
  });

  return {
    submissionId: input.submissionId,
    exportId: manifest.exportId,
    sourceAssessmentId: manifest.sourceAssessmentId,
    expectedBundleHash: manifest.bundleHash,
    actualBundleHash: rebuilt.bundleHash,
    hashMatch,
    expectedSourceAssessmentHash: manifest.sourceAssessmentHash,
    actualSourceAssessmentHash: rebuilt.sourceAssessmentHash,
    assessmentHashMatch,
    fileDiffs,
  };
}

