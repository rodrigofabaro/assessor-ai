import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import path from "path";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { toStorageRelativePath, writeStorageFile } from "@/lib/storage/provider";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";
import { sendOpsAlertEmail } from "@/lib/auth/inviteEmail";
import { enqueueSubmissionAutomationJob, triggerSubmissionAutomationRunner } from "@/lib/submissions/automationQueue";

const ALLOWED_EXTS = new Set([".pdf", ".docx"]);
const submissionCreateSelect = {
  id: true,
  filename: true,
  storedFilename: true,
  storagePath: true,
  status: true,
  uploadedAt: true,
  updatedAt: true,
  studentId: true,
  assignmentId: true,
} as const;
type SubmissionRecord = {
  id: string;
  filename: string;
  storedFilename: string;
  storagePath: string;
  status: string;
  uploadedAt: Date;
  updatedAt: Date;
  studentId: string | null;
  assignmentId: string | null;
};

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true; // missing column
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

function isSubmissionSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true; // missing column
  if (code === "P2011") return true; // null constraint
  if (msg.includes("studentlinkedat") || msg.includes("studentlinkedby")) return true;
  if (msg.includes("organizationid")) return true;
  if (msg.includes("violates not-null constraint")) return true;
  if (msg.includes("unknown argument") && msg.includes("studentlinked")) return true;
  if (msg.includes("unknown argument") && msg.includes("organization")) return true;
  if (msg.includes("column") && msg.includes("does not exist")) return true;
  return false;
}

function getErrorDebugInfo(error: unknown) {
  const err = (error || {}) as {
    message?: unknown;
    code?: unknown;
    name?: unknown;
  };
  const message = String(err.message || error || "").trim();
  const code = String(err.code || "").trim();
  const name = String(err.name || "").trim();
  return {
    message,
    code: code || undefined,
    name: name || undefined,
  };
}

function getOptionalId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function isAllowedFile(filename: string): boolean {
  const ext = path.extname(filename || "").toLowerCase();
  return ALLOWED_EXTS.has(ext);
}

export async function POST(req: Request) {
  const requestId = makeRequestId();
  let failStage = "init";
  try {
    failStage = "resolve_org_scope";
    let organizationId: string | null = null;
    try {
      organizationId = await getRequestOrganizationId();
    } catch {}
    failStage = "parse_form";
    const formData = await req.formData();

    const studentId = getOptionalId(formData.get("studentId"));
    const assignmentId = getOptionalId(formData.get("assignmentId"));
    let actor = "system";
    try {
      actor = await getCurrentAuditActor(getOptionalId(formData.get("actor")));
    } catch {}

    const files = formData.getAll("files").filter((x): x is File => x instanceof File);

    if (!files.length) {
      return apiError({
        status: 400,
        code: "UPLOAD_MISSING_FILES",
        userMessage: "No files were provided.",
        route: "/api/submissions/upload",
        requestId,
      });
    }

    const validFiles = files.filter((f) => isAllowedFile(f.name));
    if (!validFiles.length) {
      return apiError({
        status: 400,
        code: "UPLOAD_INVALID_FILE_TYPE",
        userMessage: "Only PDF and DOCX files are supported.",
        route: "/api/submissions/upload",
        requestId,
        details: {
          provided: files.map((f) => f.name),
        },
      });
    }

    const created: SubmissionRecord[] = [];

    // Create submissions sequentially (safe + simple). If you want concurrency later, we can add it.
    for (const file of validFiles) {
      failStage = "read_file_bytes";
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const storedFilename = `${uuid()}-${file.name}`;
      const storagePathRel = toStorageRelativePath("uploads", storedFilename);
      failStage = "persist_file";
      const saved = await writeStorageFile(storagePathRel, buffer);
      const storagePath = saved.storagePath;

      const baseData = {
        filename: file.name,
        storedFilename,
        storagePath,
        status: "UPLOADED" as const,
        studentId,
        assignmentId,
      };

      let submission: SubmissionRecord;
      const orgScopedData = organizationId ? { ...baseData, organizationId } : baseData;
      failStage = "create_submission";
      try {
        submission = await prisma.submission.create({
          data: orgScopedData as any,
          select: submissionCreateSelect,
        });
      } catch (createErr) {
        if (!isOrgScopeCompatError(createErr) && !isSubmissionSchemaCompatError(createErr)) throw createErr;

        // Backward-compatible path while schema rollout is still being migrated.
        try {
          submission = await prisma.submission.create({
            data: baseData as any,
            select: submissionCreateSelect,
          });
        } catch (legacyErr) {
          if (!isSubmissionSchemaCompatError(legacyErr)) throw legacyErr;
          const minimalData = {
            filename: file.name,
            storedFilename,
            storagePath,
            status: "UPLOADED" as const,
          };
          try {
            submission = await prisma.submission.create({
              data: minimalData as any,
              select: submissionCreateSelect,
            });
          } catch (minimalErr) {
            if (!isSubmissionSchemaCompatError(minimalErr)) throw minimalErr;
            throw new Error(
              "UPLOAD_DB_SCHEMA_INCOMPATIBLE: Submission create is incompatible with deployed schema. Run database migrations."
            );
          }
        }
      }

      if (studentId) {
        try {
          failStage = "write_audit_event";
          await prisma.submissionAuditEvent.create({
            data: {
              submissionId: submission.id,
              type: "STUDENT_LINKED",
              actor,
              meta: {
                source: "upload",
                studentId,
              },
            },
          });
        } catch {}
      }

      created.push(submission);
    }

    failStage = "queue_extract";
    await Promise.allSettled(
      created.map((s) =>
        enqueueSubmissionAutomationJob({
          submissionId: s.id,
          type: "EXTRACT",
          createdBy: "upload",
          payload: { source: "upload" },
        })
      )
    );

    failStage = "trigger_extract_runner";
    await triggerSubmissionAutomationRunner(req.url, Math.min(4, Math.max(1, created.length)));

    return NextResponse.json(
      { submissions: created, extraction: { triggered: true, durableQueue: true }, requestId },
      { headers: { "x-request-id": requestId } }
    );
  } catch (err) {
    const debug = getErrorDebugInfo(err);
    if (String(process.env.ALERT_EMAIL_TO || "").trim()) {
      const lines = [
        "Assessor AI alert: submission upload failed",
        "",
        `Route: /api/submissions/upload`,
        `Stage: ${failStage}`,
        `Request ID: ${requestId}`,
        `Error code: ${debug.code || "-"}`,
        `Error name: ${debug.name || "-"}`,
        `Message: ${debug.message || "-"}`,
        `Timestamp (UTC): ${new Date().toISOString()}`,
      ];
      void sendOpsAlertEmail({
        subject: `Assessor AI alert: upload failure at ${failStage}`,
        text: lines.join("\n"),
      }).catch(() => {});
    }
    return apiError({
      status: 500,
      code: "UPLOAD_FAILED",
      userMessage: `Upload failed at ${failStage}. Please try again.`,
      route: "/api/submissions/upload",
      requestId,
      cause: err,
      details:
        debug.message || debug.code || debug.name
          ? {
              stage: failStage,
              message: debug.message || undefined,
              errorCode: debug.code,
              errorName: debug.name,
            }
          : { stage: failStage },
    });
  }
}
