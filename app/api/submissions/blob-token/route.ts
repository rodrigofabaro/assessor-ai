import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { toStorageRelativePath } from "@/lib/storage/provider";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";

const MAX_SUBMISSION_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB
const BLOB_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MSWORD_CONTENT_TYPE = "application/msword";
const PDF_CONTENT_TYPE = "application/pdf";
const OCTET_CONTENT_TYPE = "application/octet-stream";

type AllowedType = "pdf" | "docx";

function safeName(name: string) {
  return (name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 120);
}

function pickAllowedType(fileName: string): AllowedType | null {
  const lower = String(fileName || "").trim().toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

function allowedContentTypesFor(type: AllowedType) {
  if (type === "pdf") return [PDF_CONTENT_TYPE];
  return [DOCX_CONTENT_TYPE, MSWORD_CONTENT_TYPE, OCTET_CONTENT_TYPE];
}

type BlobTokenRequest = {
  fileName?: string;
  fileSize?: number;
};

export async function POST(req: Request) {
  try {
    await getRequestOrganizationId();

    const backend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
    if (backend !== "vercel_blob") {
      return NextResponse.json(
        {
          error: "CLIENT_BLOB_UPLOAD_DISABLED",
          message: "Client Blob upload is only available when STORAGE_BACKEND=vercel_blob.",
        },
        { status: 409 },
      );
    }

    const rawToken = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    if (!rawToken) {
      return NextResponse.json(
        {
          error: "BLOB_TOKEN_MISSING",
          message: "Storage is not configured. Set BLOB_READ_WRITE_TOKEN in Vercel and redeploy.",
        },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as BlobTokenRequest;
    const fileName = String(body.fileName || "").trim();
    const fileSize = Number(body.fileSize || 0);

    if (!fileName) {
      return NextResponse.json({ error: "Missing file name." }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (fileSize > MAX_SUBMISSION_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_SUBMISSION_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }

    const allowedType = pickAllowedType(fileName);
    if (!allowedType) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported." }, { status: 400 });
    }

    const storedFilename = `${uuid()}-${safeName(fileName)}`;
    const storagePath = toStorageRelativePath("uploads", storedFilename);
    const validUntil = Date.now() + BLOB_TOKEN_TTL_MS;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: rawToken,
      pathname: storagePath,
      maximumSizeInBytes: MAX_SUBMISSION_UPLOAD_BYTES,
      allowedContentTypes: allowedContentTypesFor(allowedType),
      addRandomSuffix: false,
      validUntil,
    });

    return NextResponse.json({
      clientToken,
      storagePath,
      storedFilename,
      maxBytes: MAX_SUBMISSION_UPLOAD_BYTES,
      validUntil,
      allowedType,
    });
  } catch (error) {
    const raw = String((error as { message?: unknown } | null)?.message || error || "").trim();
    return NextResponse.json(
      {
        error: raw || "Failed to generate upload token.",
        code: "SUBMISSION_BLOB_TOKEN_FAILED",
      },
      { status: 500 },
    );
  }
}

