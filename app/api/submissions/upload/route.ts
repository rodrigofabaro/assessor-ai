import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import type { Submission } from "@prisma/client";
import { apiError, makeRequestId } from "@/lib/api/errors";

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
  const requestId = makeRequestId();
  try {
    const formData = await req.formData();

    const studentId = getOptionalId(formData.get("studentId"));
    const assignmentId = getOptionalId(formData.get("assignmentId"));
    const actor = getOptionalId(formData.get("actor")) || "upload";

    const files = formData.getAll("files").filter((x): x is File => x instanceof File);

    if (!files.length) {
      return apiError({
        status: 400,
        code: "UPLOAD_MISSING_FILES",
        userMessage: "No files were provided.",
        route: "/api/submissions/upload",
        requestId,
      });
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    await ensureDir(uploadDir);

    const validFiles = files.filter((f) => isAllowedFile(f.name));
    if (!validFiles.length) {
      return apiError({
        status: 400,
        code: "UPLOAD_INVALID_FILE_TYPE",
        userMessage: "Only PDF and DOCX files are supported.",
        route: "/api/submissions/upload",
        requestId,
        details: {
          provided: files.map((f) => f.name),
        },
      });
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
          studentLinkedAt: studentId ? new Date() : null,
          studentLinkedBy: studentId ? actor : null,
        },
      });

      if (studentId) {
        await prisma.submissionAuditEvent.create({
          data: {
            submissionId: submission.id,
            type: "STUDENT_LINKED",
            actor,
            meta: {
              source: "upload",
              studentId,
            },
          },
        });
      }

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

    return NextResponse.json(
      { submissions: created, extraction: { triggered: true }, requestId },
      { headers: { "x-request-id": requestId } }
    );
  } catch (err) {
    return apiError({
      status: 500,
      code: "UPLOAD_FAILED",
      userMessage: "Upload failed. Please try again.",
      route: "/api/submissions/upload",
      requestId,
      cause: err,
    });
  }
}
