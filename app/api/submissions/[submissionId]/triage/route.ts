import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function norm(s: string) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s@._-]+/gu, "")
    .trim();
}

function looksLikePersonName(line: string) {
  // take only the left side before common separators (often "NAME | COURSE | DATE")
  const left = (line || "").split("|")[0].split("—")[0].split("-")[0].trim();
  const s = norm(left);
  if (!s) return false;

  if (s.length < 5 || s.length > 60) return false;
  if (/@/.test(s)) return false;

  // Avoid common header keywords (and things that caused false positives)
  if (/\b(unit|assignment|contents|code|programme|course|pearson|btec|level|submission|engineering)\b/i.test(s))
    return false;

  const parts = s.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;

  // Accept Title Case: "John Birkin"
  const titleCaseCount = parts.filter((p) => /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]+$/.test(p)).length;
  if (titleCaseCount >= 2) return true;

  // Accept ALL CAPS names: "JOHN BIRKIN"
  const allCapsCount = parts.filter((p) => /^[A-ZÀ-ÖØ-Þ]{2,}$/.test(p)).length;
  if (allCapsCount >= 2) return true;

  return false;
}

function extractNameFromLine(line: string): string | null {
  const left = (line || "").split("|")[0].split("—")[0].split("-")[0].trim();
  const s = norm(left);
  if (!s) return null;

  const parts = s.split(" ").filter(Boolean);
  const candidate = parts.slice(0, 3).join(" ").trim(); // allow 2–3 tokens

  return looksLikePersonName(candidate) ? candidate : null;
}

function extractSignalsFromText(textRaw: string) {
  const text = (textRaw || "").slice(0, 20000);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 160);

  const joined = lines.join("\n");

  const emailMatch = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  const unitMatch = joined.match(/\b(4\d{3})\b/);
  const unitCode = unitMatch ? unitMatch[1] : null;

  let assignmentRef: string | null = null;
  const aRefMatch = joined.match(/\bA\s*([1-9]\d?)\b/i);
  if (aRefMatch) assignmentRef = `A${aRefMatch[1]}`;

  if (!assignmentRef) {
    const asgMatch = joined.match(/\bAssignment\s*([1-9]\d?)\b/i);
    if (asgMatch) assignmentRef = `A${asgMatch[1]}`;
  }

  const labeled = joined.match(/(?:student\s*name|learner\s*name|candidate\s*name|name)\s*[:\-]\s*(.+)/i);
  let studentName: string | null = null;

  if (labeled?.[1]) {
    const candidate = norm(labeled[1]).split("\n")[0].trim();
    if (looksLikePersonName(candidate)) studentName = candidate;
  }

  // Fallback: scan first ~60 lines, prefer last candidate before "Contents"
  if (!studentName) {
    const scanWindow = lines.slice(0, 60);
    const contentsIdx = scanWindow.findIndex((l) => /\bcontents\b/i.test(l));
    const preContents = contentsIdx > 0 ? scanWindow.slice(0, contentsIdx) : scanWindow;

    const extracted = preContents.map(extractNameFromLine).filter(Boolean) as string[];
    studentName = extracted.length ? extracted[extracted.length - 1] : null;
  }

  return { email, unitCode, assignmentRef, studentName, sampleLines: lines.slice(0, 25) };
}

function cleanToken(t: string) {
  return (t || "")
    .replace(/\.(pdf|docx?)$/i, "")
    .replace(/[\(\)\[\]\{\}]/g, "")
    .replace(/[^\p{L}\p{N}'’-]+/gu, "")
    .trim();
}

function titleCase(w: string) {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function titleCaseNameFromTokens(tokens: string[]) {
  const clean = tokens
    .map(cleanToken)
    .filter(Boolean)
    .filter((t) => !/^\d+$/.test(t));

  if (clean.length < 2) return null;

  const nameTokens = clean.slice(0, 3).map(titleCase);
  const name = nameTokens.join(" ").trim();
  return name.length >= 5 ? name : null;
}

function extractSignalsFromFilename(filename: string) {
  const base = (filename || "").replace(/\.[a-z0-9]+$/i, "");
  const normed = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  const unitMatch =
    normed.match(/\bU\s*(4\d{3})\b/i) ||
    normed.match(/\bUnit\s*(4\d{3})\b/i) ||
    normed.match(/(?:^|[^0-9])(4\d{3})(?:[^0-9]|$)/);

  const unitCode = unitMatch ? unitMatch[1] : null;

  let assignmentRef: string | null = null;
  const aRefMatch = normed.match(/\bA\s*([1-9]\d?)\b/i);
  if (aRefMatch) assignmentRef = `A${aRefMatch[1]}`;

  if (!assignmentRef) {
    const asgMatch = normed.match(/\bAssignment\s*([1-9]\d?)\b/i);
    if (asgMatch) assignmentRef = `A${asgMatch[1]}`;
  }

  const STOPWORDS = new Set(
    [
      "assignment",
      "unit",
      "submission",
      "final",
      "draft",
      "course",
      "module",
      "engineering",
      "hnc",
      "hnd",
      "btec",
      "pearson",
      "rqf",
      "report",
      "work",
      "portfolio",
      "task",
    ].map((s) => s.toLowerCase())
  );

  const rawTokens = normed.split(" ").map((t) => t.trim()).filter(Boolean);

  const filtered = rawTokens
    .map(cleanToken)
    .filter(Boolean)
    .filter((t) => {
      const low = t.toLowerCase();
      if (!low) return false;
      if (low === "u" && unitCode) return false;
      if (unitCode && low === unitCode.toLowerCase()) return false;
      if (assignmentRef && low === assignmentRef.toLowerCase()) return false;
      if (/^u4\d{3}$/i.test(t)) return false;
      if (/^a\d{1,2}$/i.test(t)) return false;
      if (STOPWORDS.has(low)) return false;
      return true;
    });

  const firstStopIdx = rawTokens.findIndex((t) => STOPWORDS.has(cleanToken(t).toLowerCase()));
  const nameTokens = firstStopIdx > 0 ? rawTokens.slice(0, firstStopIdx) : rawTokens;

  const cleanedNameTokens = nameTokens
    .map(cleanToken)
    .filter(Boolean)
    .filter((t) => {
      const low = t.toLowerCase();
      if (unitCode && (low === unitCode.toLowerCase() || low === `u${unitCode}`)) return false;
      if (assignmentRef && low === assignmentRef.toLowerCase()) return false;
      if (/^u4\d{3}$/i.test(t)) return false;
      if (/^a\d{1,2}$/i.test(t)) return false;
      if (STOPWORDS.has(low)) return false;
      return true;
    });

  const studentName = titleCaseNameFromTokens(cleanedNameTokens) ?? titleCaseNameFromTokens(filtered);

  return { unitCode, assignmentRef, studentName };
}

async function computeCoverage(unitCode: string | null, assignmentRef: string | null) {
  const missing: string[] = [];
  let hasUnitSpec = false;
  let hasAssignmentBrief = false;

  if (!unitCode) {
    missing.push("Unit code not detected (cannot check reference coverage).");
    return { hasUnitSpec, hasAssignmentBrief, missing };
  }

  const unit = await prisma.unit.findFirst({
    where: { unitCode, status: "LOCKED" },
    select: { id: true },
  });

  hasUnitSpec = !!unit;
  if (!hasUnitSpec) missing.push(`Missing LOCKED Unit SPEC for unit ${unitCode}.`);

  if (!assignmentRef) {
    missing.push(`Assignment ref not detected (cannot check BRIEF for unit ${unitCode}).`);
    return { hasUnitSpec, hasAssignmentBrief, missing };
  }

  if (!unit) {
    missing.push(`Cannot validate BRIEF: unit ${unitCode} is not LOCKED.`);
    return { hasUnitSpec, hasAssignmentBrief, missing };
  }

  const brief = await prisma.assignmentBrief.findFirst({
    where: { unitId: unit.id, assignmentCode: assignmentRef, status: "LOCKED" },
    select: { id: true },
  });

  hasAssignmentBrief = !!brief;
  if (!hasAssignmentBrief) missing.push(`Missing LOCKED Assignment BRIEF for ${unitCode} ${assignmentRef}.`);

  return { hasUnitSpec, hasAssignmentBrief, missing };
}

export async function POST(_req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;

  const existing = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { student: true, assignment: true },
  });

  if (!existing) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const warnings: string[] = [];

  const textSignals = extractSignalsFromText(existing.extractedText || "");
  const fileSignals = extractSignalsFromFilename(existing.filename);

  const unitCode = textSignals.unitCode || fileSignals.unitCode;
  const assignmentRef = textSignals.assignmentRef || fileSignals.assignmentRef;
  const studentName = textSignals.studentName || fileSignals.studentName;

  if (!existing.extractedText || existing.extractedText.trim().length < 50) {
    warnings.push("Triage: extractedText is empty/too short; falling back to filename-only signals.");
  }

  if (!unitCode) warnings.push("Triage: could not detect unit code (e.g. 4003) from extracted text or filename.");
  if (!assignmentRef) warnings.push("Triage: could not detect assignment ref (e.g. A1 / Assignment 1) from extracted text or filename.");
  if (!textSignals.email && !studentName) warnings.push("Triage: could not detect student email/name in extracted text or filename.");

  const coverage = await computeCoverage(unitCode, assignmentRef);
  for (const m of coverage.missing) warnings.push(`Reference: ${m}`);

  // Resolve / create operational Assignment (fills header fields)
  let assignment: { id: string } | null = null;

  if (unitCode && assignmentRef) {
    const found = await prisma.assignment.findFirst({
      where: { unitCode, assignmentRef },
      select: { id: true },
    });

    if (found) {
      assignment = found;
    } else {
      warnings.push(`Triage: no operational Assignment found for ${unitCode} ${assignmentRef}; creating placeholder.`);

      assignment = await prisma.assignment.create({
        data: {
          unitCode,
          assignmentRef,
          title: `Placeholder ${unitCode} ${assignmentRef}`,
          isPlaceholder: true,
          triageConfidence: 0.6,
          triageSignals: {
            from: "triage",
            unitCode,
            assignmentRef,
            email: textSignals.email,
            studentName,
          },
          createdFromFilename: existing.filename,
        },
        select: { id: true },
      });
    }
  }

  // Resolve Student (email first, then name) — do NOT create students automatically yet
  let student: { id: string } | null = null;

  if (textSignals.email) {
    const found = await prisma.student.findFirst({ where: { email: textSignals.email }, select: { id: true } });
    if (found) student = found;
  }

  if (!student && studentName) {
    const exact = await prisma.student.findFirst({
      where: { name: { equals: studentName, mode: "insensitive" } },
      select: { id: true },
    });

    if (exact) {
      student = exact;
    } else {
      const parts = studentName.split(" ").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last.length >= 3) {
        const partial = await prisma.student.findFirst({
          where: { name: { contains: last, mode: "insensitive" } },
          select: { id: true },
        });
        if (partial) student = partial;
      }
    }
  }

  // ✅ IMPORTANT: this warning is about LINKING, not DETECTION
  if (!student && studentName) {
    warnings.push(`Triage: student name detected ("${studentName}") but not linked to an existing student record.`);
  }
  if (!student && textSignals.email) {
    warnings.push(`Triage: student email detected ("${textSignals.email}") but not linked to an existing student record.`);
  }

  // Apply updates
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

  const studentDetection = {
    detected: !!studentName || !!textSignals.email,
    linked: !!student?.id,
    source: textSignals.studentName ? "text" : fileSignals.studentName ? "filename" : textSignals.email ? "email" : null,
  } as const;

  return NextResponse.json({
    submission,
    triage: {
      unitCode,
      assignmentRef,
      studentName,
      email: textSignals.email,
      studentDetection,
      sampleLines: textSignals.sampleLines,
      warnings,
      coverage,
    },
  });
}
