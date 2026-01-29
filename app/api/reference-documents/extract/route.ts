import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
async function resolveStoredFile(doc: { storagePath: string | null; storedFilename: string | null }) {
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
    if (await fileExists(p)) return { ok: true as const, path: p, tried };
  }

  return { ok: false as const, path: null as string | null, tried };
}

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

/** Split text into clean-ish lines (pdf-parse table flattening friendly) */
function toLines(text: string): string[] {
  return (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Slice ONLY the LO/AC region to avoid criteria swallowing "Recommended Resources" etc.
 * Start: "Learning Outcomes and Assessment Criteria"
 * End: first match of one of the known section headings that follow criteria.
 */
function sliceCriteriaRegion(lines: string[]): string[] {
  const start = lines.findIndex((l) => /Learning Outcomes and Assessment Criteria/i.test(l));
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

/**
 * Parse P/M/D criteria and assign to LO1/LO2/...
 * Works when tables get flattened and text wraps.
 *
 * IMPORTANT:
 * - bounded to LO/AC region so D4 won't absorb page sections like "Recommended Resources"
 * - additional hard stop if those headings appear while accumulating a criterion
 */
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
    /^(Essential Content|Recommended Resources|Journals|Links|This unit links to)\b/i.test(l);

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
    const arr = byLo[currentLO] || (byLo[currentLO] = []);
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

    // If we ever hit a section heading while accumulating, STOP.
    if (currentCode && isHardStopHeading(l)) {
      flush();
      break;
    }

    // Update LO context (LO1, LO2 etc)
    const loHit = l.match(/\b(LO\d{1,2})\b/i);
    if (loHit) {
      const lo = loHit[1].toUpperCase();

      // LO and criterion on same line: "LO1 P1 Describe ..."
      const loAndCode = l.match(/\b(LO\d{1,2})\b.*?\b([PMD])\s*(\d{1,2})\b\s*(.*)$/i);
      if (loAndCode) {
        const lo2 = loAndCode[1].toUpperCase();
        const code = (loAndCode[2].toUpperCase() + loAndCode[3]) as string;
        const rest = (loAndCode[4] || "").trim();

        if (loCodes.includes(lo2)) {
          flush();
          currentLO = lo2;
          currentCode = code;
          if (rest) descParts.push(rest);
        }
        continue;
      }

      // LO header line
      if (loCodes.includes(lo)) {
        flush();
        currentLO = lo;
        continue;
      }
    }

    // Criterion code line: "P1 Describe..." / "M2 Analyse..."
    const codeHit = l.match(/^\s*([PMD])\s*(\d{1,2})\b\s*(.*)$/i);
    if (codeHit) {
      if (!currentLO) continue; // avoid false positives elsewhere
      flush();
      currentCode = (codeHit[1].toUpperCase() + codeHit[2]) as string;
      const rest = (codeHit[3] || "").trim();
      if (rest) descParts.push(rest);
      continue;
    }

    // Continuation line for current criterion
    if (currentCode) {
      // ignore repeated headers / page artifacts
      if (/^(Unit Descriptors|Issue\s+\d+|© Pearson|Pearson Education|Page\s+\d+)/i.test(l)) {
        continue;
      }

      // if we hit another LO label at the start of a line, flush and switch
      const loSwitch = l.match(/^\s*(LO\d{1,2})\b/i);
      if (loSwitch) {
        const lo = loSwitch[1].toUpperCase();
        if (loCodes.includes(lo)) {
          flush();
          currentLO = lo;
          continue;
        }
      }

      descParts.push(l);
    }
  }

  flush();

  // Sort P..M..D, numeric within band
  const rank = (ac: string) => {
    const band = ac[0];
    const num = parseInt(ac.slice(1), 10) || 0;
    const base = band === "P" ? 0 : band === "M" ? 100 : 200;
    return base + num;
  };
  for (const lo of Object.keys(byLo)) {
    byLo[lo].sort((a, b) => rank(a.acCode) - rank(b.acCode));
  }

  return byLo;
}

/**
 * SPEC parser (Pearson Unit Descriptor PDFs)
 * Produces the structure your UI + /lock endpoint expects.
 */
function parseSpecDraft(text: string, docTitleFallback: string) {
  const t = text || "";

  const issueLabel =
    firstMatch(t, /\b(Issue\s+\d+\s*[–-]\s*[A-Za-z]+\s+\d{4})\b/i) ||
    firstMatch(t, /\b(Issue\s+\d+)\b/i);

  const unitCode =
    firstMatch(t, /\bUnit\s+(4\d{3})\b/i) ||
    firstMatch(docTitleFallback, /\b(4\d{3})\b/i);

  let unitTitle =
    firstMatch(t, /\bUnit\s+4\d{3}\s*[:\-]\s*([^\n]+)\n/i) ||
    firstMatch(t, /\bUnit\s+4\d{3}\s*[:\-]\s*([^\n]+)\r?\n/i);

  if (unitTitle) {
    unitTitle = unitTitle.replace(/\s{2,}/g, " ").trim();
  } else {
    const titleFromDoc = docTitleFallback || "";
    const m = titleFromDoc.match(/\bUnit\s+4\d{3}\s*[-:]\s*(.+?)(?:\s*-\s*Issue|\s*Issue|\s*$)/i);
    if (m?.[1]) unitTitle = normalizeWhitespace(m[1]);
  }

  const pearsonUnitCode = firstMatch(t, /\bUnit\s+Code:\s*([A-Z0-9/]+)\b/i);
  const level = firstMatch(t, /\bLevel:\s*([0-9]+)\b/i);
  const credits = firstMatch(t, /\bCredits:\s*([0-9]+)\b/i);

  // LO extraction: allow 1+ spaces (some PDFs don’t have “double space”)
  const loMatches = Array.from(t.matchAll(/\b(LO\d{1,2})\b\s*[:\-–]?\s*([^\n]+)\n/gi));

  const learningOutcomes = loMatches
    .map((m) => ({
      loCode: m[1].toUpperCase(),
      description: normalizeWhitespace(m[2]),
      essentialContent: null as string | null,
      criteria: [] as Array<{
        acCode: string;
        gradeBand: "PASS" | "MERIT" | "DISTINCTION";
        description: string;
      }>,
    }))
    .filter((lo, idx, arr) => arr.findIndex((x) => x.loCode === lo.loCode) === idx);

  // Essential content (optional)
  const essentialIdx = t.search(/\bEssential\s+Content\b/i);
  if (essentialIdx >= 0) {
    const essentialText = t.slice(essentialIdx);

    for (const lo of learningOutcomes) {
      const re = new RegExp(
        `\\b${lo.loCode}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\bLO\\d{1,2}\\b|\\bLearning\\s+Outcomes\\b|\\bAssessment\\b|\\bGrading\\b|\\bRecommended\\s+Resources\\b|\\bJournals\\b|\\bLinks\\b|\\bThis\\s+unit\\s+links\\b|$)`,
        "i"
      );
      const m = essentialText.match(re);
      if (m?.[1]) {
        const chunk = normalizeWhitespace(m[1]).slice(0, 1200);
        lo.essentialContent = chunk || null;
      }
    }
  }

  // ✅ Criteria extraction (P/M/D) — bounded to LO/AC region
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
      pearsonUnitCode: pearsonUnitCode || null,
      level: level ? Number(level) : null,
      credits: credits ? Number(credits) : null,
      specIssue: issueLabel || null,
      specVersionLabel: issueLabel || null,
    },
    learningOutcomes,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const documentId = safeStr(body?.documentId || body?.id || body?.referenceDocumentId);

  if (!documentId) {
    return NextResponse.json({ error: "Missing reference document id." }, { status: 400 });
  }

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      version: true,
      storagePath: true,
      storedFilename: true,
      originalFilename: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "Reference document not found." }, { status: 404 });
  }

  try {
    const resolved = await resolveStoredFile({
      storagePath: doc.storagePath,
      storedFilename: doc.storedFilename,
    });

    if (!resolved.ok || !resolved.path) {
      const msg =
        `File not found for reference document.\n` +
        `originalFilename: ${doc.originalFilename}\n` +
        `storedFilename: ${doc.storedFilename}\n` +
        `storagePath (DB): ${doc.storagePath}\n` +
        `Tried:\n- ${resolved.tried.join("\n- ")}\n`;

      await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: {
          status: "FAILED",
          extractionWarnings: [msg],
        },
      });

      return NextResponse.json(
        {
          error: "REFERENCE_FILE_MISSING",
          message: "The stored file path is invalid or the file was moved/deleted.",
          detail: msg,
        },
        { status: 400 }
      );
    }

    const buf = await fs.readFile(resolved.path);

    // IMPORTANT: avoid pdf-parse test harness importing its own test data
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = (mod as any).default ?? (mod as any);

    const parsed = await pdfParse(buf);
    const text = (parsed?.text || "").trim();

    const warnings: string[] = [];
    if (!text || text.length < 50) {
      warnings.push(
        "Extraction produced empty/short text. This may be a scanned PDF. Vision OCR is not enabled yet."
      );
    }

    let extractedJson: any = null;

    if (doc.type === "SPEC") {
      extractedJson = parseSpecDraft(text, doc.title || doc.originalFilename || "");
    } else {
      extractedJson = {
        kind: doc.type,
        preview: text.slice(0, 4000),
        charCount: text.length,
      };
    }

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
          unitCode: extractedJson?.unit?.unitCode || null,
          specIssue: extractedJson?.unit?.specIssue || null,
        } as any,
      },
    });

    return NextResponse.json({
      ok: true,
      id: doc.id,
      usedPath: resolved.path,
      warnings,
      extractedJson,
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    const stack = err?.stack ? String(err.stack) : "";

    await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: "FAILED",
        extractionWarnings: [
          `REFERENCE_EXTRACT_ERROR: ${message}`,
          stack ? stack.slice(0, 2000) : "",
        ].filter(Boolean),
      },
    });

    return NextResponse.json({ error: "REFERENCE_EXTRACT_ERROR", message }, { status: 500 });
  }
}
