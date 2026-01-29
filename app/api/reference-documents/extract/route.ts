import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

// extractors
import { extractBrief } from "@/lib/extractors/brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------- helpers -------------------- */

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve where the uploaded file actually lives.
 * Supports:
 * - absolute storagePath
 * - relative storagePath
 * - path stored from repo root while running in /webapp
 * - fallback: canonicalRoot + storedFilename
 */
async function resolveStoredFile(doc: {
  storagePath: string | null;
  storedFilename: string | null;
}) {
  const storagePathRaw = safeStr(doc.storagePath);
  const storedFilename = safeStr(doc.storedFilename);

  const projectRoot = process.cwd(); // typically .../webapp
  const legacyUploadDir = path.join(projectRoot, "reference_uploads");
  const envRoot = safeStr(process.env.FILE_STORAGE_ROOT);
  const canonicalRoot = envRoot || legacyUploadDir;

  const candidates: string[] = [];

  if (storagePathRaw) {
    candidates.push(storagePathRaw);
    candidates.push(path.resolve(projectRoot, storagePathRaw));
    candidates.push(path.resolve(projectRoot, "..", storagePathRaw));
  }

  if (storedFilename) {
    candidates.push(path.join(canonicalRoot, storedFilename));
  }

  const tried = Array.from(
    new Set(
      candidates
        .map((p) => (p || "").trim())
        .filter(Boolean)
        .map((p) => path.normalize(p))
    )
  );

  for (const p of tried) {
    if (await fileExists(p)) {
      return { ok: true as const, path: p, tried };
    }
  }

  return { ok: false as const, path: null as string | null, tried };
}

/* -------------------- SPEC parser (unchanged) -------------------- */

function normalizeWhitespace(s: string) {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ? normalizeWhitespace(m[1]) : null;
}

function toLines(text: string): string[] {
  return (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function sliceCriteriaRegion(lines: string[]): string[] {
  const start = lines.findIndex((l) =>
    /Learning Outcomes and Assessment Criteria/i.test(l)
  );
  const base = start >= 0 ? lines.slice(start) : lines;

  const endMarkers: RegExp[] = [
    /^Essential Content\b/i,
    /^Recommended Resources\b/i,
    /^Journals\b/i,
    /^Links\b/i,
    /^This unit links to\b/i,
  ];

  let end = -1;
  for (const re of endMarkers) {
    const idx = base.findIndex((l) => re.test(l));
    if (idx >= 0 && (end < 0 || idx < end)) end = idx;
  }

  return end >= 0 ? base.slice(0, end) : base;
}

function parseCriteriaByLO(text: string, loCodes: string[]) {
  const lines = sliceCriteriaRegion(toLines(text));

  const byLo: Record<
    string,
    Array<{
      acCode: string;
      gradeBand: "PASS" | "MERIT" | "DISTINCTION";
      description: string;
    }>
  > = Object.fromEntries(loCodes.map((lo) => [lo, []]));

  let currentLO: string | null = null;
  let currentCode: string | null = null;
  let descParts: string[] = [];

  const gradeBandFor = (code: string) =>
    code.startsWith("P") ? "PASS" : code.startsWith("M") ? "MERIT" : "DISTINCTION";

  const isHardStopHeading = (l: string) =>
    /^(Essential Content|Recommended Resources|Journals|Links|This unit links to)\b/i.test(
      l
    );

  const flush = () => {
    if (!currentLO || !currentCode) {
      currentCode = null;
      descParts = [];
      return;
    }
    const desc = normalizeWhitespace(descParts.join(" "));
    if (!desc) {
      currentCode = null;
      descParts = [];
      return;
    }
    const arr = byLo[currentLO];
    if (!arr.some((c) => c.acCode === currentCode)) {
      arr.push({
        acCode: currentCode,
        gradeBand: gradeBandFor(currentCode),
        description: desc,
      });
    }
    currentCode = null;
    descParts = [];
  };

  for (const raw of lines) {
    const l = raw.trim();

    if (currentCode && isHardStopHeading(l)) {
      flush();
      break;
    }

    const loHit = l.match(/\b(LO\d{1,2})\b/i);
    if (loHit) {
      const lo = loHit[1].toUpperCase();

      const loAndCode = l.match(
        /\b(LO\d{1,2})\b.*?\b([PMD])\s*(\d{1,2})\b\s*(.*)$/i
      );
      if (loAndCode) {
        flush();
        currentLO = loAndCode[1].toUpperCase();
        currentCode = loAndCode[2].toUpperCase() + loAndCode[3];
        if (loAndCode[4]) descParts.push(loAndCode[4].trim());
        continue;
      }

      if (loCodes.includes(lo)) {
        flush();
        currentLO = lo;
        continue;
      }
    }

    const codeHit = l.match(/^\s*([PMD])\s*(\d{1,2})\b\s*(.*)$/i);
    if (codeHit) {
      if (!currentLO) continue;
      flush();
      currentCode = codeHit[1].toUpperCase() + codeHit[2];
      if (codeHit[3]) descParts.push(codeHit[3].trim());
      continue;
    }

    if (currentCode) {
      if (/^(© Pearson|Pearson Education|Page\s+\d+)/i.test(l)) continue;
      descParts.push(l);
    }
  }

  flush();
  return byLo;
}

function parseSpecDraft(text: string, docTitleFallback: string) {
  const t = text || "";

  const unitCode =
    firstMatch(t, /\bUnit\s+(4\d{3})\b/i) ||
    firstMatch(docTitleFallback, /\b(4\d{3})\b/i);

  const unitTitle =
    firstMatch(t, /\bUnit\s+4\d{3}\s*[:\-]\s*([^\n]+)\n/i) ||
    firstMatch(docTitleFallback, /\bUnit\s+4\d{3}\s*[:\-]\s*(.+)/i);

  const loMatches = Array.from(
    t.matchAll(/\b(LO\d{1,2})\b\s*[:\-–]?\s*([^\n]+)\n/gi)
  );

  const learningOutcomes = loMatches.map((m) => ({
    loCode: m[1].toUpperCase(),
    description: normalizeWhitespace(m[2]),
    criteria: [],
  }));

  const loCodes = learningOutcomes.map((x) => x.loCode);
  const criteriaByLo = parseCriteriaByLO(t, loCodes);

  for (const lo of learningOutcomes) {
    lo.criteria = criteriaByLo[lo.loCode] || [];
  }

  return {
    kind: "SPEC" as const,
    unit: {
      unitCode: unitCode || "",
      unitTitle: unitTitle || "",
    },
    learningOutcomes,
  };
}

/* -------------------- POST /extract -------------------- */

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const documentId = safeStr(
    body?.documentId || body?.id || body?.referenceDocumentId
  );

  if (!documentId) {
    return NextResponse.json(
      { error: "Missing reference document id." },
      { status: 400 }
    );
  }

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      title: true,
      storagePath: true,
      storedFilename: true,
      originalFilename: true,
    },
  });

  if (!doc) {
    return NextResponse.json(
      { error: "Reference document not found." },
      { status: 404 }
    );
  }

  try {
    const resolved = await resolveStoredFile({
      storagePath: doc.storagePath,
      storedFilename: doc.storedFilename,
    });

    if (!resolved.ok || !resolved.path) {
      await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: { status: "FAILED" },
      });

      return NextResponse.json(
        { error: "REFERENCE_FILE_MISSING" },
        { status: 400 }
      );
    }

    const buf = await fs.readFile(resolved.path);
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = (mod as any).default ?? mod;
    const parsed = await pdfParse(buf);
    const text = (parsed?.text || "").trim();

    const warnings: string[] = [];
    if (!text || text.length < 50) {
      warnings.push("Extraction produced little or no text (likely scanned).");
    }

    let extractedJson: any = null;

    if (doc.type === "SPEC") {
      extractedJson = parseSpecDraft(
        text,
        doc.title || doc.originalFilename || ""
      );
    } else if (doc.type === "BRIEF") {
      extractedJson = extractBrief(text);
    } else {
      extractedJson = {
        kind: doc.type,
        preview: text.slice(0, 4000),
        charCount: text.length,
      };
    }

    const derivedAssignmentCode =
      extractedJson?.assignmentCode ||
      (extractedJson?.assignmentNumber
        ? `A${extractedJson.assignmentNumber}`
        : null);

    await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: "EXTRACTED",
        extractedJson: extractedJson as any,
        extractionWarnings: warnings.length ? warnings : [],
        sourceMeta: {
          filePathUsed: resolved.path,
          originalFilename: doc.originalFilename,
          storedFilename: doc.storedFilename,
          unitCode:
            extractedJson?.unit?.unitCode ||
            extractedJson?.unitCodeGuess ||
            null,
          assignmentCode: derivedAssignmentCode,
        } as any,
      },
    });

    return NextResponse.json({
      ok: true,
      id: doc.id,
      extractedJson,
      warnings,
    });
  } catch (err: any) {
    await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: { status: "FAILED" },
    });

    return NextResponse.json(
      { error: "REFERENCE_EXTRACT_ERROR", message: String(err?.message || err) },
      { status: 500 }
    );
  }
}
