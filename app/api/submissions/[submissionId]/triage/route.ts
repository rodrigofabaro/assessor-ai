import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function norm(s: string) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s@._-]+/gu, "")
    .trim();
}

function looksLikePersonName(line: string) {
  const s = norm(line);
  if (!s) return false;
  if (s.length < 5 || s.length > 60) return false;
  if (/\d/.test(s)) return false; // names usually don't contain digits
  if (/@/.test(s)) return false;

  // Avoid common header keywords
  if (/\b(unit|assignment|contents|code|programme|course|pearson|btec|level|submission)\b/i.test(s)) return false;

  // 2–4 words, mostly Title Case
  const parts = s.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;

  const titleCaseCount = parts.filter((p) => /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]+$/.test(p)).length;
  return titleCaseCount >= 2;
}

function extractSignalsFromText(textRaw: string) {
  const text = (textRaw || "").slice(0, 20000);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 160);

  const joined = lines.join("\n");

  // Email (best student key)
  const emailMatch = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  // Unit code: 4 digits starting with 4 (e.g. 4017)
  const unitMatch = joined.match(/\b(4\d{3})\b/);
  const unitCode = unitMatch ? unitMatch[1] : null;

  // Assignment ref:
  // - A1 / A2
  // - Assignment 1 / Assignment 2
  let assignmentRef: string | null = null;

  const aRefMatch = joined.match(/\bA\s*([1-9]\d?)\b/i);
  if (aRefMatch) assignmentRef = `A${aRefMatch[1]}`;

  if (!assignmentRef) {
    const asgMatch = joined.match(/\bAssignment\s*([1-9]\d?)\b/i);
    if (asgMatch) assignmentRef = `A${asgMatch[1]}`;
  }

  // Student name:
  // 1) labeled fields
  const labeled = joined.match(/(?:student\s*name|learner\s*name|candidate\s*name|name)\s*[:\-]\s*(.+)/i);
  let studentName: string | null = null;
  if (labeled?.[1]) {
    const candidate = norm(labeled[1]).split("\n")[0].trim();
    if (looksLikePersonName(candidate)) studentName = candidate;
  }

  // 2) fallback: scan first ~40 lines for a name-like line
  if (!studentName) {
    const scanWindow = lines.slice(0, 60);
    const candidates = scanWindow.filter(looksLikePersonName);

    // Prefer the last candidate before a "Contents" line (often header ends there)
    const contentsIdx = scanWindow.findIndex((l) => /\bcontents\b/i.test(l));
    const preContents = contentsIdx > 0 ? scanWindow.slice(0, contentsIdx) : scanWindow;
    const preCandidates = preContents.filter(looksLikePersonName);

    studentName =
      preCandidates.length > 0
        ? norm(preCandidates[preCandidates.length - 1])
        : candidates.length > 0
        ? norm(candidates[candidates.length - 1])
        : null;
  }

  return { email, unitCode, assignmentRef, studentName, sampleLines: lines.slice(0, 25) };
}

function extractSignalsFromFilename(filename: string) {
  const base = (filename || "").replace(/\.[a-z0-9]+$/i, "");
  const normed = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  const unitMatch = normed.match(/\b(4\d{3})\b/);
  const unitCode = unitMatch ? unitMatch[1] : null;

  let assignmentRef: string | null = null;

  const aRefMatch = normed.match(/\bA\s*([1-9]\d?)\b/i);
  if (aRefMatch) assignmentRef = `A${aRefMatch[1]}`;

  if (!assignmentRef) {
    const asgMatch = normed.match(/\bAssignment\s*([1-9]\d?)\b/i);
    if (asgMatch) assignmentRef = `A${asgMatch[1]}`;
  }

  return { unitCode, assignmentRef };
}

export async function POST(_req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;

  const existing = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { student: true, assignment: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const warnings: string[] = [];

  const textSignals = extractSignalsFromText(existing.extractedText || "");
  const fileSignals = extractSignalsFromFilename(existing.filename);

  const unitCode = textSignals.unitCode || fileSignals.unitCode;
  const assignmentRef = textSignals.assignmentRef || fileSignals.assignmentRef;

  if (!existing.extractedText || existing.extractedText.trim().length < 50) {
    warnings.push("Triage: extractedText is empty/too short; falling back to filename-only signals.");
  }

  if (!unitCode) warnings.push("Triage: could not detect unit code (e.g. 4017) from extracted text or filename.");
  if (!assignmentRef)
    warnings.push("Triage: could not detect assignment ref (e.g. A1 / Assignment 1) from extracted text or filename.");
  if (!textSignals.email && !textSignals.studentName) warnings.push("Triage: could not detect student email/name in extracted text.");

  // Resolve Assignment
  let assignment: any = null;
  if (unitCode) {
    if (assignmentRef) {
      assignment = await prisma.assignment.findFirst({
        where: { unitCode, assignmentRef },
      });
      if (!assignment) warnings.push(`Triage: no assignment found for unitCode=${unitCode} and assignmentRef=${assignmentRef}.`);
    } else {
      const matches = await prisma.assignment.findMany({ where: { unitCode } });
      if (matches.length === 1) assignment = matches[0];
      else warnings.push(`Triage: unitCode=${unitCode} matches ${matches.length} assignments; not auto-linking without assignmentRef.`);
    }
  }

  // Resolve Student (email first, then name)
  let student: any = null;

  if (textSignals.email) {
    student = await prisma.student.findFirst({ where: { email: textSignals.email } });
    if (!student) warnings.push(`Triage: no student found with email="${textSignals.email}".`);
  }

  if (!student && textSignals.studentName) {
    student = await prisma.student.findFirst({
      where: { name: { equals: textSignals.studentName, mode: "insensitive" } },
    });

    if (!student) {
      // conservative contains on last token
      const parts = textSignals.studentName.split(" ").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last.length >= 3) {
        student = await prisma.student.findFirst({
          where: { name: { contains: last, mode: "insensitive" } },
        });
      }
    }

    if (!student) warnings.push(`Triage: no student match found for name="${textSignals.studentName}".`);
  }

  // Apply updates (best-effort, never block)
  const data: any = {};
  if (student?.id) data.studentId = student.id;
  if (assignment?.id) data.assignmentId = assignment.id;

  if (Object.keys(data).length > 0) {
    await prisma.submission.update({ where: { id: submissionId }, data });
  } else {
    warnings.push("Triage: no links applied (student/assignment not confidently resolved).");
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: true,
      assignment: true,
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        include: { pages: { orderBy: { pageNumber: "asc" } } },
      },
    },
  });

  return NextResponse.json({
    submission,
    triage: {
      unitCode,
      assignmentRef,
      studentName: textSignals.studentName,
      email: textSignals.email,
      sampleLines: textSignals.sampleLines,
      warnings,
    },
  });
}
