import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { head } from "@vercel/blob";
import { toStorageRelativePath } from "@/lib/storage/provider";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";

const MAX_REFERENCE_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

function safeName(name: string) {
  return (name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 120);
}

function cleanMetaValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}

function parseVersion(raw: unknown): { version: number; versionLabel?: string } {
  if (typeof raw !== "string" && typeof raw !== "number") return { version: 1 };

  const label = String(raw || "").trim();
  if (!label) return { version: 1 };

  if (/^\d+$/.test(label)) {
    const v = Math.max(1, parseInt(label, 10));
    return { version: v, versionLabel: label };
  }

  const m = label.match(/(\d+)/);
  if (m) {
    const v = Math.max(1, parseInt(m[1], 10));
    return { version: v, versionLabel: label };
  }

  return { version: 1, versionLabel: label };
}

function isPdfUpload(fileName: string, contentType: string) {
  return String(contentType || "").toLowerCase() === "application/pdf" || String(fileName || "").toLowerCase().endsWith(".pdf");
}

async function checksumSha256FromPrivateUrl(url: string, token: string) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Blob fetch failed (${response.status}).`);
  }

  const hash = crypto.createHash("sha256");
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) hash.update(value);
  }
  return hash.digest("hex");
}

type FinalizeRequest = {
  type?: string;
  title?: string;
  version?: string | number;
  framework?: string;
  category?: string;
  originalFilename?: string;
  storedFilename?: string;
  storagePath?: string;
  blobUrl?: string;
  blobPathname?: string;
  contentType?: string;
  sizeBytes?: number;
};

export async function POST(req: Request) {
  try {
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

    const body = (await req.json().catch(() => ({}))) as FinalizeRequest;
    const type = String(body.type || "").trim().toUpperCase();
    const title = String(body.title || "").trim();
    const originalFilename = String(body.originalFilename || "").trim();
    const suppliedStoredFilename = String(body.storedFilename || "").trim();
    const storagePath = String(body.storagePath || "").trim();
    const blobUrl = String(body.blobUrl || "").trim();
    const blobPathname = String(body.blobPathname || "").trim().replace(/^\/+/, "");
    const contentType = String(body.contentType || "").trim().toLowerCase();
    const sizeBytes = Number(body.sizeBytes || 0);
    const framework = cleanMetaValue(body.framework);
    const category = cleanMetaValue(body.category);
    const { version, versionLabel } = parseVersion(body.version);

    if (type !== "SPEC" && type !== "BRIEF" && type !== "RUBRIC") {
      return NextResponse.json({ error: "Invalid type." }, { status: 400 });
    }
    if (!title || !originalFilename || !suppliedStoredFilename || !storagePath || !blobUrl) {
      return NextResponse.json({ error: "Missing upload metadata." }, { status: 400 });
    }
    if (!isPdfUpload(originalFilename, contentType)) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }
    if (!Number.isFinite(version) || version < 1) {
      return NextResponse.json({ error: "Invalid version." }, { status: 400 });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (sizeBytes > MAX_REFERENCE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_REFERENCE_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }

    const storedFilename = safeName(suppliedStoredFilename);
    const expectedPath = toStorageRelativePath("reference_uploads", storedFilename);
    if (storagePath !== expectedPath) {
      return NextResponse.json({ error: "Storage path mismatch." }, { status: 400 });
    }
    if (blobPathname && blobPathname !== expectedPath) {
      return NextResponse.json({ error: "Blob pathname mismatch." }, { status: 400 });
    }

    const blobMeta = await head(blobUrl, { token });
    if (blobMeta.pathname !== expectedPath) {
      return NextResponse.json({ error: "Blob path mismatch." }, { status: 400 });
    }
    if (blobMeta.size > MAX_REFERENCE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_REFERENCE_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }
    if (!isPdfUpload(originalFilename, String(blobMeta.contentType || contentType))) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const checksumSha256 = await checksumSha256FromPrivateUrl(blobMeta.url || blobUrl, token);

    const sourceMeta: Record<string, unknown> = {
      uploadTransport: "vercel_blob_client",
      blobPathname: blobMeta.pathname,
      blobEtag: blobMeta.etag,
      sizeBytes: blobMeta.size,
    };
    if (versionLabel) sourceMeta.versionLabel = versionLabel;
    if (framework) sourceMeta.framework = framework;
    if (category) sourceMeta.category = category;

    const baseCreateData = {
      type: type as any,
      title,
      version,
      originalFilename,
      storedFilename,
      storagePath: blobMeta.url || blobUrl,
      checksumSha256,
      sourceMeta: sourceMeta as any,
    };
    const scopedCreateData = organizationId
      ? {
          ...baseCreateData,
          organizationId,
        }
      : baseCreateData;

    let document: Awaited<ReturnType<typeof prisma.referenceDocument.create>>;
    try {
      document = await prisma.referenceDocument.create({
        data: scopedCreateData as any,
      });
    } catch (createErr) {
      if (!isOrgScopeCompatError(createErr)) throw createErr;
      document = await prisma.referenceDocument.create({
        data: baseCreateData as any,
      });
    }

    return NextResponse.json({ document });
  } catch (error) {
    const raw = String((error as { message?: unknown } | null)?.message || error || "").trim();
    return NextResponse.json(
      {
        error: raw || "Blob finalize failed.",
        code: "REFERENCE_BLOB_FINALIZE_FAILED",
      },
      { status: 500 },
    );
  }
}
