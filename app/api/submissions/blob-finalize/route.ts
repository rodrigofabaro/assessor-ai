import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { head } from "@vercel/blob";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { toStorageRelativePath } from "@/lib/storage/provider";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";

const MAX_SUBMISSION_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_CONTENT_TYPE = "application/pdf";

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

function isSubmissionSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("studentlinkedat") || msg.includes("studentlinkedby")) return true;
  if (msg.includes("organizationid")) return true;
  if (msg.includes("unknown argument") && msg.includes("studentlinked")) return true;
  if (msg.includes("unknown argument") && msg.includes("organization")) return true;
  if (msg.includes("column") && msg.includes("does not exist")) return true;
  return false;
}

function safeName(name: string) {
  return (name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 120);
}

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function pickSubmissionType(fileName: string): "pdf" | "docx" | null {
  const lower = String(fileName || "").trim().toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

function isValidMimeForType(type: "pdf" | "docx", mime: string) {
  const normalized = String(mime || "").trim().toLowerCase();
  if (!normalized) return true;
  if (type === "pdf") return normalized === PDF_CONTENT_TYPE;
  if (normalized === DOCX_CONTENT_TYPE) return true;
  if (normalized === "application/msword") return true;
  if (normalized === "application/octet-stream") return true;
  return false;
}

type FinalizeRequest = {
  originalFilename?: string;
  storedFilename?: string;
  storagePath?: string;
  blobUrl?: string;
  blobPathname?: string;
  contentType?: string;
  sizeBytes?: number;
  studentId?: string | null;
  assignmentId?: string | null;
  actor?: string | null;
  sourceLastModifiedAt?: string | null;
};

export async function POST(req: Request) {
  let failStage = "init";
  try {
    failStage = "resolve_org_scope";
    const organizationId = await getRequestOrganizationId();

    const backend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
    if (backend !== "vercel_blob") {
      return NextResponse.json(
        {
          error: "CLIENT_BLOB_UPLOAD_DISABLED",
          message: "Blob finalize is only available when STORAGE_BACKEND=vercel_blob.",
        },
        { status: 409 },
      );
    }

    const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    if (!token) {
      return NextResponse.json(
        {
          error: "Storage is not configured. Set BLOB_READ_WRITE_TOKEN in Vercel and redeploy.",
          code: "BLOB_TOKEN_MISSING",
        },
        { status: 500 },
      );
    }

    failStage = "parse_body";
    const body = (await req.json().catch(() => ({}))) as FinalizeRequest;
    const originalFilename = String(body.originalFilename || "").trim();
    const suppliedStoredFilename = String(body.storedFilename || "").trim();
    const storagePath = String(body.storagePath || "").trim();
    const blobUrl = String(body.blobUrl || "").trim();
    const blobPathname = String(body.blobPathname || "").trim().replace(/^\/+/, "");
    const contentType = String(body.contentType || "").trim().toLowerCase();
    const sizeBytes = Number(body.sizeBytes || 0);
    const studentId = normalizeOptionalId(body.studentId);
    const assignmentId = normalizeOptionalId(body.assignmentId);
    const sourceLastModifiedAt = toOptionalDate(body.sourceLastModifiedAt);

    const submissionType = pickSubmissionType(originalFilename);
    if (!originalFilename || !suppliedStoredFilename || !storagePath || !blobUrl) {
      return NextResponse.json({ error: "Missing upload metadata." }, { status: 400 });
    }
    if (!submissionType) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported." }, { status: 400 });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (sizeBytes > MAX_SUBMISSION_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_SUBMISSION_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }
    if (!isValidMimeForType(submissionType, contentType)) {
      return NextResponse.json({ error: "Unsupported content type." }, { status: 400 });
    }

    const storedFilename = safeName(suppliedStoredFilename);
    const expectedPath = toStorageRelativePath("uploads", storedFilename);
    if (storagePath !== expectedPath) {
      return NextResponse.json({ error: "Storage path mismatch." }, { status: 400 });
    }
    if (blobPathname && blobPathname !== expectedPath) {
      return NextResponse.json({ error: "Blob pathname mismatch." }, { status: 400 });
    }

    failStage = "head_blob";
    const blobMeta = await head(blobUrl, { token });
    if (blobMeta.pathname !== expectedPath) {
      return NextResponse.json({ error: "Blob path mismatch." }, { status: 400 });
    }
    if (blobMeta.size > MAX_SUBMISSION_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_SUBMISSION_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }
    if (!isValidMimeForType(submissionType, blobMeta.contentType || contentType)) {
      return NextResponse.json({ error: "Unsupported blob content type." }, { status: 400 });
    }

    let actor = "system";
    try {
      actor = await getCurrentAuditActor(normalizeOptionalId(body.actor));
    } catch {}

    const baseData = {
      filename: originalFilename,
      storedFilename,
      storagePath: blobMeta.url || blobUrl,
      status: "UPLOADED" as const,
      studentId,
      assignmentId,
      mimeType: blobMeta.contentType || contentType || undefined,
      sizeBytes: Number.isFinite(blobMeta.size) ? Math.floor(blobMeta.size) : Math.floor(sizeBytes),
      sourceLastModifiedAt: sourceLastModifiedAt || undefined,
    };

    failStage = "create_submission";
    let submission: Awaited<ReturnType<typeof prisma.submission.create>>;
    const orgScopedData = organizationId ? { ...baseData, organizationId } : baseData;
    try {
      submission = await prisma.submission.create({ data: orgScopedData });
    } catch (createErr) {
      if (!isOrgScopeCompatError(createErr) && !isSubmissionSchemaCompatError(createErr)) throw createErr;

      try {
        submission = await prisma.submission.create({ data: baseData });
      } catch (legacyErr) {
        if (!isSubmissionSchemaCompatError(legacyErr)) throw legacyErr;
        const minimalData = {
          filename: originalFilename,
          storedFilename,
          storagePath: blobMeta.url || blobUrl,
          status: "UPLOADED" as const,
          studentId,
          assignmentId,
        };
        submission = await prisma.submission.create({ data: minimalData });
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
              source: "blob_client_upload",
              studentId,
            },
          },
        });
      } catch {}
    }

    failStage = "trigger_extract";
    const baseUrl = new URL(req.url);
    const origin = `${baseUrl.protocol}//${baseUrl.host}`;
    await fetch(`${origin}/api/submissions/${submission.id}/extract`, { method: "POST", cache: "no-store" }).catch(() => null);

    return NextResponse.json({
      submission,
      extraction: { triggered: true },
    });
  } catch (error) {
    const raw = String((error as { message?: unknown } | null)?.message || error || "").trim();
    return NextResponse.json(
      {
        error: raw || `Finalize failed at ${failStage}.`,
        code: "SUBMISSION_BLOB_FINALIZE_FAILED",
        details: { stage: failStage },
      },
      { status: 500 },
    );
  }
}

