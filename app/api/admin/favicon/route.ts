import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettingsWriteContext } from "@/lib/admin/settingsPermissions";
import { appendSettingsAuditEvent } from "@/lib/admin/settingsAudit";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { deleteStorageFile, toStorageRelativePath, writeStorageFile } from "@/lib/storage/provider";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/x-icon", "image/vnd.microsoft.icon", "image/png", "image/svg+xml"]);

function extensionFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/svg+xml") return "svg";
  return "ico";
}

export async function POST(req: Request) {
  const ctx = await getSettingsWriteContext();
  if (!ctx.canWrite) {
    return NextResponse.json({ error: "Insufficient role for branding settings." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Invalid favicon size." }, { status: 400 });
  }
  if (!ALLOWED.has(String(file.type || "").toLowerCase())) {
    return NextResponse.json({ error: "Unsupported favicon type." }, { status: 400 });
  }

  try {
    const mimeType = String(file.type || "").trim().toLowerCase();
    const ext = extensionFromMime(mimeType);
    const bytes = Buffer.from(await file.arrayBuffer());
    const storageKey = toStorageRelativePath("storage", "branding", `favicon.${ext}`);
    const saved = await writeStorageFile(storageKey, bytes);

    const previous = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: { faviconStoragePath: true },
    });
    const previousPath = String(previous?.faviconStoragePath || "").trim();
    const nextPath = String(saved.storagePath || "").trim();
    if (previousPath && previousPath !== nextPath) {
      void deleteStorageFile(previousPath).catch(() => null);
    }

    await prisma.appConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        faviconUpdatedAt: new Date(),
        faviconStoragePath: nextPath,
        faviconMimeType: mimeType,
      },
      update: {
        faviconUpdatedAt: new Date(),
        faviconStoragePath: nextPath,
        faviconMimeType: mimeType,
      },
    });
    appendSettingsAuditEvent({
      actor: await getCurrentAuditActor(),
      role: ctx.role,
      action: "FAVICON_UPDATED",
      target: "favicon",
      changes: {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storagePath: nextPath,
      },
    });

    const cacheBuster = Date.now();
    return NextResponse.json({
      ok: true,
      faviconPath: `/api/favicon?v=${cacheBuster}`,
      note: "Favicon updated and stored durably.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: String((error as Error)?.message || "Failed to persist favicon."),
      },
      { status: 500 }
    );
  }
}
