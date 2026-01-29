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

export async function GET() {
  const docs = await prisma.referenceDocument.findMany({
    orderBy: [{ uploadedAt: "desc" }],
  });

  return NextResponse.json({ documents: docs });
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
    const version = typeof versionRaw === "string" ? Number(versionRaw) : 1;

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
        storagePath: storagePathRel, // ✅ RELATIVE (portable)
        checksumSha256,
      },
    });

    return NextResponse.json({ document: doc });
  } catch (err) {
    console.error("REFERENCE_UPLOAD_ERROR:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
