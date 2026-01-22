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

    const type = formData.get("type") as string | null;
    const title = formData.get("title") as string | null;
    const versionRaw = formData.get("version") as string | null;
    const file = formData.get("file") as File | null;

    if (!type || !title || !file) {
      return NextResponse.json(
        { error: "Missing type, title, or file" },
        { status: 400 }
      );
    }

    const version = versionRaw ? Number(versionRaw) : 1;
    if (!Number.isFinite(version) || version < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const checksumSha256 = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

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
