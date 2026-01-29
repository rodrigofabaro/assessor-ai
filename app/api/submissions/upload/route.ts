import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import type { Submission } from "@prisma/client";

const ALLOWED_EXTS = new Set([".pdf", ".docx"]);

function getOptionalId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function isAllowedFile(filename: string): boolean {
  const ext = path.extname(filename || "").toLowerCase();
  return ALLOWED_EXTS.has(ext);
}

async function ensureDir(dir: string) {
  if (!fssync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const studentId = getOptionalId(formData.get("studentId"));
    const assignmentId = getOptionalId(formData.get("assignmentId"));

    const files = formData.getAll("files").filter((x): x is File => x instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "Missing files" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    await ensureDir(uploadDir);

    const validFiles = files.filter((f) => isAllowedFile(f.name));
    if (!validFiles.length) {
      return NextResponse.json({ error: "No valid files (PDF/DOCX) provided" }, { status: 400 });
    }

    const created: Submission[] = [];

    // Create submissions sequentially (safe + simple). If you want concurrency later, we can add it.
    for (const file of validFiles) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const storedFilename = `${uuid()}-${file.name}`;
      const storagePath = path.join(uploadDir, storedFilename);

      await fs.writeFile(storagePath, buffer);

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

    // Best-effort trigger extraction (don’t fail upload if extraction fails)
    const baseUrl = new URL(req.url);
    const origin = `${baseUrl.protocol}//${baseUrl.host}`;

    await Promise.allSettled(
      created.map((s) =>
        fetch(`${origin}/api/submissions/${s.id}/extract`, { method: "POST", cache: "no-store" })
      )
    );

    return NextResponse.json({ submissions: created, extraction: { triggered: true } });
  } catch (err) {
    console.error("UPLOAD_ERROR:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
