import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * UTILS & CONSTANTS
 */
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
    "level",
    "learning",
    "outcome",
    "contents",
    "appendix",
    "references",
  ].map((s) => s.toLowerCase())
);

const norm = (s: string) =>
  (s || "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s@._'’-]+/gu, "") // keep @ . _ apostrophes/hyphens
    .trim();

const titleCase = (w: string) => {
  const s = (w || "").trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const cleanToken = (t: string) =>
  (t || "")
    .replace(/\.(pdf|docx?)$/i, "")
    .replace(/[\(\)\[\]\{\}]/g, "")
    .replace(/[^\p{L}\p{N}'’-]+/gu, "")
    .trim();

/**
 * Name detection that is robust but conservative.
 * - allows particles: de/da/del/di/van/von/al, etc.
 * - rejects common academic headers/codes
 */
function isPersonName(text: string): boolean {
  const s = norm(text);
  if (!s || s.length < 4 || s.length > 60) return false;
  if (s.includes("@")) return false;

  // Reject obvious non-names / academic keywords / noisy labels
  if (
    /\b(unit|assignment|pearson|btec|level|hnc|hnd|rqf|ref|page|student\s*id|candidate\s*id|learner\s*id|programme|course|submission|engineering)\b/i.test(
      s
    )
  )
    return false;

  // Reject codes/IDs
  if (/\b\d{4,}\b/.test(s)) return false;
  if (/\b(LO\d+|P\d+|M\d+|D\d+)\b/i.test(s)) return false;

  const parts = s.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;

  const particles = new Set([
    "de",
    "da",
    "do",
    "dos",
    "das",
    "del",
    "della",
    "di",
    "van",
    "von",
    "der",
    "den",
    "la",
    "le",
    "al",
    "el",
    "ibn",
  ]);

  const isTitleToken = (p: string) =>
    /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]+$/.test(p);

  const isAllCapsToken = (p: string) =>
    /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’\-]{1,}$/.test(p);

  const lowerOK = (p: string) => particles.has(p.toLowerCase());

  const titleish = parts.every((p) => isTitleToken(p) || lowerOK(p));
  const capsish = parts.every((p) => isAllCapsToken(p) || lowerOK(p));

  // Require at least 2 "real" name-like tokens (not just particles)
  const realCount = parts.filter((p) => !lowerOK(p)).length;
  if (realCount < 2) return false;

  return titleish || capsish;
}

function extractSignalsFromText(textRaw: string) {
  const fullText = (textRaw || "").slice(0, 20000);
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 160);

  const joined = lines.join("\n");

  const email =
    joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].toLowerCase() ||
    null;

  const unitCode = joined.match(/\b(4\d{3})\b/)?.[1] || null;

  const aMatch = joined.match(/\b(?:Assignment|A)\s*([1-9]\d?)\b/i);
  const assignmentRef = aMatch ? `A${aMatch[1]}` : null;

  // Name detection: labeled first
  let studentName: string | null = null;

  const labeled = joined.match(
    /(?:student\s*name|learner\s*name|candidate\s*name|student|learner|candidate|name)\s*[:\-]\s*([^\n|—-]+)/i
  );

  if (labeled?.[1]) {
    const candidate = norm(labeled[1]);
    if (isPersonName(candidate)) studentName = candidate;
  }

  // Fallback: scan header block (before Contents), reverse scan
  if (!studentName) {
    const contentsIdx = lines.findIndex((l) => /\bcontents\b/i.test(l));
    const searchArea =
      contentsIdx > 0 ? lines.slice(0, contentsIdx) : lines.slice(0, 45);

    for (let i = searchArea.length - 1; i >= 0; i--) {
      const candidate = searchArea[i].split(/[|—\-]/)[0].trim();
      if (isPersonName(candidate)) {
        studentName = norm(candidate);
        break;
      }
    }
  }

  return {
    email,
    unitCode,
    assignmentRef,
    studentName,
    sampleLines: lines.slice(0, 20),
  };
}

function extractSignalsFromFilename(filename: string) {
  const nameOnly = (filename || "")
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = nameOnly.split(" ").filter(Boolean);

  const unitCode =
    nameOnly.match(/\bU(?:nit)?\s*(4\d{3})\b/i)?.[1] ||
    nameOnly.match(/\b(4\d{3})\b/)?.[1] ||
    null;

  const aMatch = nameOnly.match(/\b(?:Assignment|A)\s*([1-9]\d?)\b/i);
  const assignmentRef = aMatch ? `A${aMatch[1]}` : null;

  const filtered = tokens
    .map(cleanToken)
    .filter(Boolean)
    .filter((t) => {
      const low = t.toLowerCase();
      if (STOPWORDS.has(low)) return false;
      if (unitCode && (low === unitCode.toLowerCase() || low === `u${unitCode}`))
        return false;
      if (assignmentRef && low === assignmentRef.toLowerCase()) return false;
      if (/^a\d{1,2}$/i.test(t)) return false;
      if (/^\d+$/.test(t)) return false;
      return true;
    });

  let studentName: string | null = null;
  if (filtered.length >= 2) {
    const candidate = filtered.slice(0, 3).map(titleCase).join(" ").trim();
    if (candidate && isPersonName(candidate)) studentName = candidate; // ✅ critical guard
  }

  return { unitCode, assignmentRef, studentName };
}

/**
 * MAIN ROUTE HANDLER
 */
export async function POST(
  _req: Request,
  { params }: { params: { submissionId: string } }
) {
  const { submissionId } = params;
  const warnings: string[] = [];

  const existing = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { student: true, assignment: true },
  });

  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fromText = extractSignalsFromText(existing.extractedText || "");
  const fromFile = extractSignalsFromFilename(existing.filename);

  // Resolution hierarchy
  const unitCode = fromText.unitCode || fromFile.unitCode;
  const assignmentRef = fromText.assignmentRef || fromFile.assignmentRef;

  const email = fromText.email;

  const studentNameDetected = fromText.studentName || fromFile.studentName;
  const nameSource = fromText.studentName
    ? "text"
    : fromFile.studentName
    ? "filename"
    : null;

  // Detection vs linking eligibility (audit-safe)
  let studentNameEligibleForLinking: string | null = studentNameDetected
    ? norm(studentNameDetected)
    : null;

  if (studentNameEligibleForLinking && !isPersonName(studentNameEligibleForLinking)) {
    warnings.push(
      `Triage: detected name-like text ("${studentNameEligibleForLinking}") looks non-person (ignored for linking).`
    );
    studentNameEligibleForLinking = null;
  }

  if (!existing.extractedText || existing.extractedText.trim().length < 50) {
    warnings.push("Missing/short document text; using filename signals where possible.");
  }
  if (!unitCode) warnings.push("Unit code (e.g. 4001) not found.");
  if (!assignmentRef)
    warnings.push("Assignment ref (e.g. A1 / Assignment 1) not found.");

  // Resolve Student (Email -> Full Name -> UNIQUE surname match)
  let resolvedStudentId: string | null = null;

  if (email) {
    const s = await prisma.student.findUnique({
      where: { email },
      select: { id: true },
    });
    if (s) resolvedStudentId = s.id;
  }

  if (!resolvedStudentId && studentNameEligibleForLinking) {
    const exact = await prisma.student.findFirst({
      where: { fullName: { equals: studentNameEligibleForLinking, mode: "insensitive" } },
      select: { id: true },
    });

    if (exact) {
      resolvedStudentId = exact.id;
    } else {
      const parts = studentNameEligibleForLinking.split(" ").filter(Boolean);
      const lastName = parts[parts.length - 1];

      if (lastName && lastName.length > 2) {
        const matches = await prisma.student.findMany({
          where: { fullName: { contains: lastName, mode: "insensitive" } },
          select: { id: true, fullName: true },
          take: 5,
        });

        if (matches.length === 1) {
          resolvedStudentId = matches[0].id;
          warnings.push(`Matched student uniquely by surname "${lastName}".`);
        } else if (matches.length > 1) {
          warnings.push(
            `Surname "${lastName}" matched ${matches.length} students; not linking automatically.`
          );
        }
      }
    }
  }

  // Resolve / create Assignment in a transaction with submission update
  let resolvedAssignmentId: string | null = null;

  const result = await prisma.$transaction(async (tx) => {
    if (unitCode && assignmentRef) {
      const found = await tx.assignment.findFirst({
        where: { unitCode, assignmentRef },
        select: { id: true },
      });

      if (found) {
        resolvedAssignmentId = found.id;
      } else {
        const placeholder = await tx.assignment.create({
          data: {
            unitCode,
            assignmentRef,
            title: `Auto-Generated: ${unitCode} ${assignmentRef}`,
            isPlaceholder: true,
            triageConfidence: 0.6,
            triageSignals: {
              from: "triage",
              unitCode,
              assignmentRef,
              email,
              studentName: studentNameDetected ? norm(studentNameDetected) : null,
              nameSource,
            },
            createdFromFilename: existing.filename,
          },
          select: { id: true },
        });

        resolvedAssignmentId = placeholder.id;
        warnings.push("Created new assignment placeholder.");
      }
    }

    return tx.submission.update({
      where: { id: submissionId },
      data: {
        studentId: resolvedStudentId || undefined,
        assignmentId: resolvedAssignmentId || undefined,
      },
      include: {
        student: true,
        assignment: true,
        extractionRuns: {
          orderBy: { startedAt: "desc" },
          include: { pages: { orderBy: { pageNumber: "asc" } } },
        },
      },
    });
  });

  // Final linking warnings (honest + non-spammy)
  if (!resolvedStudentId && (email || studentNameEligibleForLinking)) {
    warnings.push(
      `Identified ${email ? `email "${email}"` : ""}${
        email && studentNameEligibleForLinking ? " and " : ""
      }${
        studentNameEligibleForLinking
          ? `name "${studentNameEligibleForLinking}"`
          : ""
      } but no unique student record could be linked.`
    );
  }

  return NextResponse.json({
    submission: result,
    triage: {
      unitCode,
      assignmentRef,
      studentName: studentNameDetected ? norm(studentNameDetected) : null,
      email,
      warnings,
      detection: {
        found: !!(email || studentNameDetected),
        linked: !!resolvedStudentId,
        source: nameSource ?? (email ? "email" : null),
      },
      sampleLines: fromText.sampleLines,
    },
  });
}
