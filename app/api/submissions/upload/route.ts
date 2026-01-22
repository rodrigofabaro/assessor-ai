import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const studentId = formData.get("studentId") as string | null;
    const assignmentId = formData.get("assignmentId") as string | null;
    const files = formData.getAll("files") as File[];

    if (!studentId || !assignmentId || !files || files.length === 0) {
      return NextResponse.json(
        { error: "Missing studentId, assignmentId, or files" },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const created = [];

    for (const file of files) {
      const lower = (file.name || "").toLowerCase();
      const isAllowed = lower.endsWith(".pdf") || lower.endsWith(".docx");
      if (!isAllowed) continue;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const storedFilename = `${uuid()}-${file.name}`;
      const storagePath = path.join(uploadDir, storedFilename);

      fs.writeFileSync(storagePath, buffer);

      const submission = await prisma.submission.create({
        data: {
          filename: file.name,
          storedFilename,
          storagePath,
          status: "UPLOADED",
          studentId,
          assignmentId,
        },
      });

      created.push(submission);
    }

    return NextResponse.json({ submissions: created });
  } catch (err) {
    console.error("UPLOAD_ERROR:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
