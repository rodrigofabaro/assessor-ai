import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // Treat empty strings as "not provided"
    const rawStudentId = formData.get("studentId");
    const rawAssignmentId = formData.get("assignmentId");

    const studentId =
      typeof rawStudentId === "string" && rawStudentId.trim() ? rawStudentId.trim() : null;

    const assignmentId =
      typeof rawAssignmentId === "string" && rawAssignmentId.trim() ? rawAssignmentId.trim() : null;

    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Missing files" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const created: any[] = [];

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
          studentId,      // may be null (Inbox mode)
          assignmentId,   // may be null (Inbox mode)
        },
      });

      created.push(submission);
    }

    // Teacher workflow: upload → start extraction immediately.
    // We do a best-effort trigger (do not fail the upload if extraction fails).
    // NOTE: This runs synchronously so the UI can show EXTRACTING right away.
    const baseUrl = new URL(req.url);
    const origin = `${baseUrl.protocol}//${baseUrl.host}`;

    for (const s of created) {
      try {
        await fetch(`${origin}/api/submissions/${s.id}/extract`, { method: "POST", cache: "no-store" });
      } catch (e) {
        console.warn("AUTO_EXTRACT_TRIGGER_FAILED:", s?.id, e);
      }
    }

    return NextResponse.json({ submissions: created, extraction: { triggered: true } });
  } catch (err) {
    console.error("UPLOAD_ERROR:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
