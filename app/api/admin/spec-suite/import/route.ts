import { NextResponse } from "next/server";
import { head, del } from "@vercel/blob";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import {
  importPearsonSpecSuiteFromPdf,
  SPEC_SUITE_DEFAULT_CATEGORY,
  SPEC_SUITE_DEFAULT_FRAMEWORK,
} from "@/lib/specSuite/importFromDescriptor";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_SPEC_SUITE_UPLOAD_BYTES = 250 * 1024 * 1024;

type ImportRequest = {
  sourceBlobUrl?: string;
  sourceBlobPathname?: string;
  sourceOriginalFilename?: string;
  framework?: string;
  category?: string;
  cleanupSourceUpload?: boolean;
};

function cleanMetaValue(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const next = value.trim().slice(0, 120);
  return next || fallback;
}

function isPdfUpload(fileName: string, contentType: string) {
  return String(contentType || "").toLowerCase() === "application/pdf" || String(fileName || "").toLowerCase().endsWith(".pdf");
}

async function downloadBlobBytes(url: string, token: string) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Blob fetch failed (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(req: Request) {
  let sourceBlobUrl = "";
  let sourceBlobPathname = "";
  let cleanupSourceUpload = true;
  let token = "";

  try {
    const organizationId = await getRequestOrganizationId();
    const allowed = await isAdminMutationAllowed();
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.reason || "Admin mutation is disabled." }, { status: 403 });
    }

    const backend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
    if (backend !== "vercel_blob") {
      return NextResponse.json(
        {
          error: "Spec suite import currently requires STORAGE_BACKEND=vercel_blob.",
        },
        { status: 409 },
      );
    }

    token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    if (!token) {
      return NextResponse.json(
        {
          error: "Storage is not configured. Set BLOB_READ_WRITE_TOKEN in Vercel and redeploy.",
          code: "BLOB_TOKEN_MISSING",
        },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as ImportRequest;
    sourceBlobUrl = String(body.sourceBlobUrl || "").trim();
    sourceBlobPathname = String(body.sourceBlobPathname || "").trim().replace(/^\/+/, "");
    const sourceOriginalFilename = String(body.sourceOriginalFilename || "").trim();
    const framework = cleanMetaValue(body.framework, SPEC_SUITE_DEFAULT_FRAMEWORK);
    const category = cleanMetaValue(body.category, SPEC_SUITE_DEFAULT_CATEGORY);
    cleanupSourceUpload = body.cleanupSourceUpload !== false;

    if (!sourceBlobUrl || !sourceOriginalFilename) {
      return NextResponse.json({ error: "Missing suite upload metadata." }, { status: 400 });
    }

    const blobMeta = await head(sourceBlobUrl, { token });
    if (!blobMeta?.url) {
      return NextResponse.json({ error: "Blob metadata is missing." }, { status: 400 });
    }
    if (sourceBlobPathname && sourceBlobPathname !== blobMeta.pathname) {
      return NextResponse.json({ error: "Blob pathname mismatch." }, { status: 400 });
    }
    if (blobMeta.size > MAX_SPEC_SUITE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_SPEC_SUITE_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }
    if (!isPdfUpload(sourceOriginalFilename, String(blobMeta.contentType || ""))) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const pdfBytes = await downloadBlobBytes(blobMeta.url, token);
    const result = await importPearsonSpecSuiteFromPdf({
      pdfBytes,
      sourceOriginalFilename,
      organizationId,
      framework,
      category,
    });

    return NextResponse.json({
      ok: true,
      ...result.summary,
      report: result.report,
      framework,
      category,
      sourceFile: {
        name: sourceOriginalFilename,
        sizeBytes: blobMeta.size,
        pathname: blobMeta.pathname,
      },
    });
  } catch (error) {
    const raw = String((error as { message?: unknown } | null)?.message || error || "").trim();
    return NextResponse.json(
      {
        error: raw || "Spec suite import failed.",
        code: "SPEC_SUITE_IMPORT_FAILED",
      },
      { status: 500 },
    );
  } finally {
    if (cleanupSourceUpload && sourceBlobUrl && token) {
      try {
        await del(sourceBlobUrl, { token });
      } catch {
        // non-blocking cleanup
      }
    }
  }
}
