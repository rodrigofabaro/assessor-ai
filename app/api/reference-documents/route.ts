import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import crypto from "crypto";

function safeName(name: string) {
  // keep it filesystem-safe and predictable
  return (name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 120);
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const type = (url.searchParams.get("type") || "").toUpperCase(); // SPEC | BRIEF | RUBRIC
  const status = (url.searchParams.get("status") || "").toUpperCase(); // UPLOADED | EXTRACTED | REVIEWED | LOCKED | FAILED
  const q = (url.searchParams.get("q") || "").trim();
  const onlyLocked = url.searchParams.get("onlyLocked") === "true";
  const onlyUnlocked = url.searchParams.get("onlyUnlocked") === "true";

  const where: any = {};

  // ✅ Key fix: apply type filter when provided
  if (type) where.type = type;

  // Optional status filter
  if (status) where.status = status;

  // Optional locked filters (lockedAt is set when locked)
  if (onlyLocked) where.lockedAt = { not: null };
  if (onlyUnlocked) where.lockedAt = null;

  // Optional text search
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { originalFilename: { contains: q, mode: "insensitive" } },
      { storedFilename: { contains: q, mode: "insensitive" } },
    ];
  }

  const docs = await prisma.referenceDocument.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { uploadedAt: "desc" }],
  });

  return NextResponse.json({ documents: docs });
}


function parseVersion(raw: FormDataEntryValue | null): { version: number; versionLabel?: string } {
  if (typeof raw !== "string") return { version: 1 };

  const label = raw.trim();
  if (!label) return { version: 1 };

  // If user typed "2" or "02"
  if (/^\d+$/.test(label)) {
    const v = Math.max(1, parseInt(label, 10));
    return { version: v, versionLabel: label };
  }

  // If user typed "issue 2", "Issue: 2", "v2", "2025/26 issue 2", etc.
  const m = label.match(/(\d+)/);
  if (m) {
    const v = Math.max(1, parseInt(m[1], 10));
    return { version: v, versionLabel: label };
  }

  // No number found (e.g., "Draft") — default to 1 but keep label
  return { version: 1, versionLabel: label };
}


export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const typeRaw = formData.get("type");
    const titleRaw = formData.get("title");
    const versionRaw = formData.get("version");
    const file = formData.get("file");

    const type = typeof typeRaw === "string" ? typeRaw.toUpperCase() : "";
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    const { version, versionLabel } = parseVersion(versionRaw);


    if (!title || !file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing title or file" }, { status: 400 });
    }

    if (type !== "SPEC" && type !== "BRIEF" && type !== "RUBRIC") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (!Number.isFinite(version) || version < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // ✅ Canonical folder (dev local). Keep DB path RELATIVE so it’s portable.
    const uploadDirRel = "reference_uploads";
    const uploadDirAbs = path.join(process.cwd(), uploadDirRel);

    if (!fs.existsSync(uploadDirAbs)) fs.mkdirSync(uploadDirAbs, { recursive: true });

    // ✅ storedFilename should be stable and safe; keep original name for humans
    const originalSafe = safeName(file.name);
    const storedFilename = `${uuid()}-${originalSafe}`;

    // ✅ Write using absolute path; store RELATIVE in DB
    const storagePathRel = path.join(uploadDirRel, storedFilename);
    const storagePathAbs = path.join(process.cwd(), storagePathRel);

    fs.writeFileSync(storagePathAbs, buffer);

const doc = await prisma.referenceDocument.create({
  data: {
    type: type as any,
    title,
    version,
    originalFilename: file.name,
    storedFilename,
    storagePath: storagePathRel,
    checksumSha256,
    sourceMeta: versionLabel ? { versionLabel } : undefined,
  },
});

    return NextResponse.json({ document: doc });
  } catch (err) {
    console.error("REFERENCE_UPLOAD_ERROR:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
