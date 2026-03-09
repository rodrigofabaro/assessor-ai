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
  requestedUnitCodes?: string[];
};

function cleanMetaValue(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const next = value.trim().slice(0, 120);
  return next || fallback;
}

function isPdfUpload(fileName: string, contentType: string) {
  return String(contentType || "").toLowerCase() === "application/pdf" || String(fileName || "").toLowerCase().endsWith(".pdf");
}

function sanitizeRequestedUnitCodes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const dedup = new Set<string>();
  for (const raw of input) {
    const code = String(raw || "").trim();
    if (/^\d{4}$/.test(code)) dedup.add(code);
  }
  return Array.from(dedup).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function parseRequestedUnitCodes(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    return sanitizeRequestedUnitCodes(JSON.parse(trimmed));
  } catch {
    return [];
  }
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
    const contentType = String(req.headers.get("content-type") || "").toLowerCase();
    const isMultipart = contentType.includes("multipart/form-data");
    let pdfBytes: Buffer;
    let sourceOriginalFilename = "";
    let framework = SPEC_SUITE_DEFAULT_FRAMEWORK;
    let category = SPEC_SUITE_DEFAULT_CATEGORY;
    let requestedUnitCodes: string[] = [];
    let sourceSizeBytes = 0;

    if (isMultipart) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing descriptor PDF file." }, { status: 400 });
      }
      sourceOriginalFilename = String(file.name || "").trim();
      sourceSizeBytes = Number(file.size || 0);
      framework = cleanMetaValue(form.get("framework"), SPEC_SUITE_DEFAULT_FRAMEWORK);
      category = cleanMetaValue(form.get("category"), SPEC_SUITE_DEFAULT_CATEGORY);
      cleanupSourceUpload = false;
      requestedUnitCodes = parseRequestedUnitCodes(form.get("requestedUnitCodes"));

      if (!sourceOriginalFilename) {
        return NextResponse.json({ error: "Missing file name." }, { status: 400 });
      }
      if (!Number.isFinite(sourceSizeBytes) || sourceSizeBytes <= 0) {
        return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
      }
      if (sourceSizeBytes > MAX_SPEC_SUITE_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `File too large (max ${Math.floor(MAX_SPEC_SUITE_UPLOAD_BYTES / (1024 * 1024))}MB).` },
          { status: 413 },
        );
      }
      if (!isPdfUpload(sourceOriginalFilename, String(file.type || ""))) {
        return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
      }

      pdfBytes = Buffer.from(await file.arrayBuffer());
    } else {
      if (backend !== "vercel_blob") {
        return NextResponse.json(
          {
            error: "Spec suite import currently requires direct file upload when STORAGE_BACKEND is local.",
            code: "SPEC_SUITE_DIRECT_UPLOAD_REQUIRED",
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
      sourceOriginalFilename = String(body.sourceOriginalFilename || "").trim();
      framework = cleanMetaValue(body.framework, SPEC_SUITE_DEFAULT_FRAMEWORK);
      category = cleanMetaValue(body.category, SPEC_SUITE_DEFAULT_CATEGORY);
      cleanupSourceUpload = body.cleanupSourceUpload !== false;
      requestedUnitCodes = sanitizeRequestedUnitCodes(body.requestedUnitCodes);

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

      pdfBytes = await downloadBlobBytes(blobMeta.url, token);
      sourceSizeBytes = Number(blobMeta.size || 0);
    }

    const result = await importPearsonSpecSuiteFromPdf({
      pdfBytes,
      sourceOriginalFilename,
      organizationId,
      framework,
      category,
      requestedUnitCodes: requestedUnitCodes.length ? requestedUnitCodes : undefined,
    });

    return NextResponse.json({
      ok: true,
      ...result.summary,
      report: result.report,
      framework,
      category,
      sourceFile: {
        name: sourceOriginalFilename,
        sizeBytes: sourceSizeBytes,
        pathname: sourceBlobPathname || null,
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
