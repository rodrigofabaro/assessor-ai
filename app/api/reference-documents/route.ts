import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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
      return NextResponse.json(
        { error: "Missing title or file" },
        { status: 400 }
      );
    }

    if (type !== "SPEC" && type !== "BRIEF" && type !== "RUBRIC") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (!Number.isFinite(version) || version < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const checksumSha256 = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    // Store under /reference_uploads (dev local). Later you can swap to object storage.
    const uploadDir = path.join(process.cwd(), "reference_uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const storedFilename = `${uuid()}-${file.name}`;
    const storagePath = path.join(uploadDir, storedFilename);
    fs.writeFileSync(storagePath, buffer);

    const doc = await prisma.referenceDocument.create({
      data: {
        type: type as any,
        title,
        version,
        originalFilename: file.name,
        storedFilename,
        storagePath,
        checksumSha256,
      },
    });

    return NextResponse.json({ document: doc });
  } catch (err) {
    console.error("REFERENCE_UPLOAD_ERROR:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
