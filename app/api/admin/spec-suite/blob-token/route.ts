import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { toStorageRelativePath } from "@/lib/storage/provider";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

const MAX_SPEC_SUITE_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB
const BLOB_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function safeName(name: string) {
  return (name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 120);
}

function isPdfUpload(fileName: string, contentType: string) {
  return String(contentType || "").toLowerCase() === "application/pdf" || String(fileName || "").toLowerCase().endsWith(".pdf");
}

type BlobTokenRequest = {
  fileName?: string;
  fileSize?: number;
  contentType?: string;
};

export async function POST(req: Request) {
  try {
    await getRequestOrganizationId();
    const allowed = await isAdminMutationAllowed();
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.reason || "Admin mutation is disabled." }, { status: 403 });
    }

    const backend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
    if (backend !== "vercel_blob") {
      return NextResponse.json(
        {
          error: "CLIENT_BLOB_UPLOAD_DISABLED",
          message: "Spec suite upload is only available when STORAGE_BACKEND=vercel_blob.",
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
    const contentType = String(body.contentType || "").trim().toLowerCase();

    if (!fileName) {
      return NextResponse.json({ error: "Missing file name." }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (fileSize > MAX_SPEC_SUITE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_SPEC_SUITE_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }
    if (!isPdfUpload(fileName, contentType)) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const storedFilename = `${uuid()}-${safeName(fileName)}`;
    const storagePath = toStorageRelativePath("spec_suite_uploads", storedFilename);
    const validUntil = Date.now() + BLOB_TOKEN_TTL_MS;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: rawToken,
      pathname: storagePath,
      maximumSizeInBytes: MAX_SPEC_SUITE_UPLOAD_BYTES,
      allowedContentTypes: ["application/pdf"],
      addRandomSuffix: false,
      validUntil,
    });

    return NextResponse.json({
      clientToken,
      storagePath,
      storedFilename,
      maxBytes: MAX_SPEC_SUITE_UPLOAD_BYTES,
      validUntil,
    });
  } catch (error) {
    const raw = String((error as { message?: unknown } | null)?.message || error || "").trim();
    return NextResponse.json(
      {
        error: raw || "Failed to generate upload token.",
        code: "SPEC_SUITE_BLOB_TOKEN_FAILED",
      },
      { status: 500 },
    );
  }
}
