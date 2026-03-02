import fs from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { resolveStoredFile } from "@/lib/extraction/storage/resolveStoredFile";
import { extractReferenceDocument } from "@/lib/extraction/index";
import { sanitizeBriefDraftArtifacts } from "@/lib/extraction/brief/draftIntegrity";
import { validateBriefExtractionHard } from "@/lib/extraction/brief/hardValidation";
import { recoverBriefFromWholePdfWithOpenAi } from "@/lib/openai/briefWholePdfRecovery";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function safeBool(x: unknown) {
  return x === true || x === "true" || x === 1 || x === "1";
}

function parseTaskNumbers(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<number>();
  for (const v of input) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

function collectEqIdsFromBriefLike(value: any) {
  const ids = new Set<string>();
  const collect = (src: unknown) => {
    const text = String(src || "");
    const re = /\[\[EQ:([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[1]) ids.add(m[1]);
    }
  };
  const tasks = Array.isArray(value?.tasks) ? value.tasks : [];
  for (const task of tasks) {
    collect(task?.text);
    collect(task?.prompt);
    collect(task?.scenarioText);
    if (Array.isArray(task?.parts)) {
      for (const part of task.parts) collect(part?.text);
    }
  }
  const scenarios = Array.isArray(value?.scenarios) ? value.scenarios : [];
  for (const scenario of scenarios) collect(scenario?.text);
  return ids;
}

function mergeBriefExtractionByTaskNumbers(prev: any, next: any, taskNumbers: number[]) {
  const prevTasks = Array.isArray(prev?.tasks) ? prev.tasks : [];
  const nextTasks = Array.isArray(next?.tasks) ? next.tasks : [];
  const selected = new Set(taskNumbers);
  const nextByN = new Map<number, any>();
  for (const task of nextTasks) {
    const n = Number(task?.n);
    if (Number.isInteger(n)) nextByN.set(n, task);
  }

  const mergedTasks: any[] = [];
  const seen = new Set<number>();
  for (const oldTask of prevTasks) {
    const n = Number(oldTask?.n);
    if (!Number.isInteger(n)) {
      mergedTasks.push(oldTask);
      continue;
    }
    seen.add(n);
    if (selected.has(n) && nextByN.has(n)) {
      mergedTasks.push(nextByN.get(n));
    } else {
      mergedTasks.push(oldTask);
    }
  }
  for (const n of selected) {
    if (!seen.has(n) && nextByN.has(n)) mergedTasks.push(nextByN.get(n));
  }
  mergedTasks.sort((a, b) => Number(a?.n || 0) - Number(b?.n || 0));

  const prevScenarios = Array.isArray(prev?.scenarios) ? prev.scenarios : [];
  const nextScenarios = Array.isArray(next?.scenarios) ? next.scenarios : [];
  const carryScenarios = prevScenarios.filter((s: any) => !selected.has(Number(s?.appliesToTask)));
  const replaceScenarios = nextScenarios.filter((s: any) => selected.has(Number(s?.appliesToTask)));
  const mergedScenarios = [...carryScenarios, ...replaceScenarios];

  const merged = {
    ...prev,
    tasks: mergedTasks,
    scenarios: mergedScenarios,
    pageCount: next?.pageCount ?? prev?.pageCount,
    hasFormFeedBreaks: next?.hasFormFeedBreaks ?? prev?.hasFormFeedBreaks,
    extractionWarnings: next?.extractionWarnings ?? prev?.extractionWarnings,
    preview: next?.preview ?? prev?.preview,
    charCount: next?.charCount ?? prev?.charCount,
  };

  const ids = collectEqIdsFromBriefLike(merged);
  const eqMap = new Map<string, any>();
  const prevEq = Array.isArray(prev?.equations) ? prev.equations : [];
  const nextEq = Array.isArray(next?.equations) ? next.equations : [];
  for (const eq of prevEq) {
    const id = String(eq?.id || "");
    if (id) eqMap.set(id, eq);
  }
  for (const eq of nextEq) {
    const id = String(eq?.id || "");
    if (id) eqMap.set(id, eq);
  }
  merged.equations = Array.from(ids).map((id) => eqMap.get(id)).filter(Boolean);
  return merged;
}

function summarizeExtracted(extractedJson: any) {
  try {
    if (!extractedJson || typeof extractedJson !== "object") return null;

    const kind = extractedJson?.kind ?? null;
    const parserVersion = extractedJson?.parserVersion ?? null;
    const unitCode = extractedJson?.unit?.unitCode ?? null;
    const specIssue = extractedJson?.unit?.specIssue ?? null;

    let loCount: number | null = null;
    let criteriaCount: number | null = null;

    const los = extractedJson?.learningOutcomes;
    if (Array.isArray(los)) {
      loCount = los.length;
      let c = 0;
      for (const lo of los) {
        const arr = lo?.criteria;
        if (Array.isArray(arr)) c += arr.length;
      }
      criteriaCount = c;
    }

    const detected = extractedJson?.detectedCriterionCodes;
    const detectedCount = Array.isArray(detected) ? detected.length : null;

    return { kind, parserVersion, unitCode, specIssue, loCount, criteriaCount, detectedCount };
  } catch {
    return null;
  }
}

function hardValidationEnabledForRequest(body: any) {
  if (safeBool(body?.disableHardValidation) || safeBool(body?.skipHardValidation)) return false;
  const env = String(process.env.BRIEF_HARD_VALIDATION || "true").toLowerCase();
  return !["0", "false", "no", "off"].includes(env);
}

function maxHardAttemptsForRequest(body: any) {
  const fromReq = Number(body?.hardValidationAttempts || body?.maxValidationAttempts || body?.maxAttempts || 0);
  const fromEnv = Number(process.env.BRIEF_HARD_VALIDATION_ATTEMPTS || 2);
  const raw = Number.isFinite(fromReq) && fromReq > 0 ? fromReq : fromEnv;
  return Math.min(4, Math.max(1, Math.floor(raw || 2)));
}

function summarizeHardIssues(validation: any) {
  const issues = Array.isArray(validation?.issues) ? validation.issues : [];
  return issues.map((issue: any) => {
    const n = Number(issue?.taskNumber || 0);
    const prefix = Number.isInteger(n) && n > 0 ? `Task ${n} - ` : "";
    return `[${String(issue?.level || "WARNING")}] ${prefix}${String(issue?.message || "")}`;
  });
}

function scoreCandidate(candidate: {
  validation?: { score?: number; blockerCount?: number; warningCount?: number } | null;
  extractedJson: any;
}) {
  const v = candidate.validation;
  if (v) {
    const score = Number(v.score || 0);
    const blockers = Number(v.blockerCount || 0);
    const warnings = Number(v.warningCount || 0);
    return score - blockers * 10 - warnings * 2;
  }
  const taskCount = Array.isArray(candidate?.extractedJson?.tasks) ? candidate.extractedJson.tasks.length : 0;
  return taskCount * 10;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));

  const documentId = safeStr(body?.documentId || body?.id || body?.referenceDocumentId);
  const forceReextract = safeBool(body?.forceReextract || body?.forceReExtract || body?.force || body?.reextract);
  const runOpenAiCleanup = body?.runOpenAiCleanup === true || body?.openAiCleanup === true;
  const reason = safeStr(body?.reason || body?.note || body?.message);
  const taskNumbers = parseTaskNumbers(body?.taskNumbers);

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
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
      extractedJson: true,
      sourceMeta: true,
      lockedAt: true,
      lockedBy: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Reference document not found." }, { status: 404 });
  }

  // 🔒 Stability rule: locked docs are immutable unless forceReextract=true.
  if (doc.lockedAt && !forceReextract) {
    return NextResponse.json(
      {
        error: "REFERENCE_LOCKED",
        message: "Reference document is locked. Use forceReextract=true to overwrite (audit logged).",
      },
      { status: 423 }
    );
  }

  try {
    const resolved = await resolveStoredFile({
      storagePath: doc.storagePath,
      storedFilename: doc.storedFilename,
    });

    if (!resolved.ok || !resolved.path) {
      const triedList = resolved.tried.length ? resolved.tried : ["(no candidates)"];
      const msg =
        `File not found for reference document.\n` +
        `originalFilename: ${doc.originalFilename}\n` +
        `storedFilename: ${doc.storedFilename}\n` +
        `storagePath (DB): ${doc.storagePath}\n` +
        `Tried:\n- ${triedList.join("\n- ")}\n`;

      await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: { status: "FAILED", extractionWarnings: [msg] },
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

    const prevMeta = (doc.sourceMeta && typeof doc.sourceMeta === "object") ? (doc.sourceMeta as any) : {};
    const prevExtractSummary = summarizeExtracted(doc.extractedJson);
    const isBrief = doc.type === "BRIEF";
    const useHardValidation = isBrief && hardValidationEnabledForRequest(body);
    const allowHardValidationBypass = safeBool(body?.allowHardValidationBypass || body?.allowValidationBypass);
    const maxAttempts = useHardValidation ? maxHardAttemptsForRequest(body) : 1;
    const extractionAttempts: any[] = [];

    let bestCandidate: null | {
      extractedJson: any;
      warnings: string[];
      text: string;
      validation: ReturnType<typeof validateBriefExtractionHard> | null;
      mode: string;
      runOpenAiCleanup: boolean;
      forceStructureRecovery: boolean;
    } = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const cleanupThisAttempt = attempt === 0 ? runOpenAiCleanup : true;
      const forceStructureRecovery = attempt >= 1;
      const result = await extractReferenceDocument({
        type: doc.type,
        filePath: resolved.path,
        docTitleFallback: doc.title || doc.originalFilename || "",
        runOpenAiCleanup: cleanupThisAttempt,
        forceStructureRecovery,
      });

      const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
      let extractedJson = result?.extractedJson ?? null;
      const canPartialMerge =
        taskNumbers.length > 0 &&
        doc.type === "BRIEF" &&
        doc.extractedJson &&
        typeof doc.extractedJson === "object" &&
        String((doc.extractedJson as any)?.kind || "").toUpperCase() === "BRIEF" &&
        extractedJson &&
        typeof extractedJson === "object" &&
        String((extractedJson as any)?.kind || "").toUpperCase() === "BRIEF";
      if (canPartialMerge) {
        extractedJson = mergeBriefExtractionByTaskNumbers(doc.extractedJson, extractedJson, taskNumbers);
      }
      extractedJson = sanitizeBriefDraftArtifacts(extractedJson);

      const validation = useHardValidation ? validateBriefExtractionHard(extractedJson, result?.text || "") : null;
      extractionAttempts.push({
        mode: "native",
        attempt: attempt + 1,
        runOpenAiCleanup: cleanupThisAttempt,
        forceStructureRecovery,
        warningCount: warnings.length,
        validation: validation
          ? {
              ok: validation.ok,
              score: validation.score,
              blockerCount: validation.blockerCount,
              warningCount: validation.warningCount,
            }
          : null,
      });

      const candidate = {
        extractedJson,
        warnings,
        text: String(result?.text || ""),
        validation,
        mode: "native",
        runOpenAiCleanup: cleanupThisAttempt,
        forceStructureRecovery,
      };
      if (!bestCandidate || scoreCandidate(candidate) > scoreCandidate(bestCandidate)) {
        bestCandidate = candidate;
      }
      if (!useHardValidation || (validation && validation.ok)) break;
    }

    if (useHardValidation && bestCandidate && !bestCandidate.validation?.ok) {
      try {
        const pdfBytes = await fs.readFile(resolved.path);
        const fallback = await recoverBriefFromWholePdfWithOpenAi({
          pdfBytes,
          fallbackTitle: doc.title || doc.originalFilename || "",
          sourceText: bestCandidate.text || "",
          currentBrief: bestCandidate.extractedJson,
        });
        extractionAttempts.push({
          mode: "openai_whole_pdf",
          attempt: extractionAttempts.length + 1,
          ok: fallback.ok,
          reason: fallback.reason || null,
        });
        if (fallback.ok && fallback.brief) {
          let aiExtracted = sanitizeBriefDraftArtifacts(fallback.brief);
          const canPartialMerge =
            taskNumbers.length > 0 &&
            doc.type === "BRIEF" &&
            doc.extractedJson &&
            typeof doc.extractedJson === "object" &&
            String((doc.extractedJson as any)?.kind || "").toUpperCase() === "BRIEF" &&
            aiExtracted &&
            typeof aiExtracted === "object" &&
            String((aiExtracted as any)?.kind || "").toUpperCase() === "BRIEF";
          if (canPartialMerge) {
            aiExtracted = mergeBriefExtractionByTaskNumbers(doc.extractedJson, aiExtracted, taskNumbers);
          }
          const aiValidation = validateBriefExtractionHard(aiExtracted, bestCandidate.text || "");
          const aiWarnings = Array.from(new Set([...(bestCandidate.warnings || []), "ai whole-pdf fallback applied"]));
          const aiCandidate = {
            extractedJson: aiExtracted,
            warnings: aiWarnings,
            text: bestCandidate.text,
            validation: aiValidation,
            mode: "openai_whole_pdf",
            runOpenAiCleanup: true,
            forceStructureRecovery: true,
          };
          if (!bestCandidate || scoreCandidate(aiCandidate) >= scoreCandidate(bestCandidate)) {
            bestCandidate = aiCandidate;
          }
        }
      } catch (fallbackErr: any) {
        extractionAttempts.push({
          mode: "openai_whole_pdf",
          attempt: extractionAttempts.length + 1,
          ok: false,
          reason: String(fallbackErr?.message || fallbackErr || "fallback failed"),
        });
      }
    }

    if (!bestCandidate) {
      throw new Error("No extraction candidate was produced.");
    }

    if (useHardValidation && bestCandidate.validation && !bestCandidate.validation.ok && !allowHardValidationBypass) {
      const validationLines = summarizeHardIssues(bestCandidate.validation);
      const nextStatus = doc.lockedAt ? "LOCKED" : "FAILED";
      await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: {
          status: nextStatus as any,
          extractionWarnings: validationLines.slice(0, 80),
          sourceMeta: {
            ...prevMeta,
            filePathUsed: resolved.path,
            hardValidation: {
              ok: false,
              blockerCount: bestCandidate.validation.blockerCount,
              warningCount: bestCandidate.validation.warningCount,
              score: bestCandidate.validation.score,
              checkedAt: new Date().toISOString(),
              attempts: extractionAttempts,
            },
          } as any,
        },
      });
      return NextResponse.json(
        {
          error: "BRIEF_HARD_VALIDATION_FAILED",
          message: "Extraction failed hard validation after retries and fallback.",
          validation: bestCandidate.validation,
          attempts: extractionAttempts,
          extractedJson: bestCandidate.extractedJson,
        },
        { status: 422 }
      );
    }

    const warnings = Array.isArray(bestCandidate.warnings) ? [...bestCandidate.warnings] : [];
    if (useHardValidation && bestCandidate.validation && !bestCandidate.validation.ok && allowHardValidationBypass) {
      warnings.push("hard validation bypassed by request");
    }
    const extractedJson = bestCandidate.extractedJson;

    const nextExtractSummary = summarizeExtracted(extractedJson);
    const nowIso = new Date().toISOString();

    // Only append history when we're explicitly overwriting a locked doc.
    const existingHistory: any[] = Array.isArray(prevMeta.reextractHistory) ? prevMeta.reextractHistory : [];
    const reextractHistory = forceReextract
      ? [...existingHistory, { at: nowIso, reason: reason || null, previous: prevExtractSummary, next: nextExtractSummary }].slice(-25)
      : existingHistory;

    const sourceMeta = {
      ...prevMeta,
      filePathUsed: resolved.path,
      originalFilename: doc.originalFilename,
      storedFilename: doc.storedFilename,
      unitCode: extractedJson?.unit?.unitCode || null,
      unitCodeQualifier: extractedJson?.unit?.unitCodeQualifier || null,
      specIssue: extractedJson?.unit?.specIssue || null,
      parserVersion: extractedJson?.parserVersion || null,
      hardValidation: useHardValidation
        ? {
            ok: !!bestCandidate.validation?.ok,
            blockerCount: Number(bestCandidate.validation?.blockerCount || 0),
            warningCount: Number(bestCandidate.validation?.warningCount || 0),
            score: Number(bestCandidate.validation?.score || 0),
            checkedAt: nowIso,
            attempts: extractionAttempts,
          }
        : prevMeta.hardValidation || null,
      reextractHistory,
    } as any;

    const nextStatus = doc.lockedAt ? "LOCKED" : "EXTRACTED";
    const updatedDoc = await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: nextStatus as any,
        extractedJson: extractedJson as any,
        extractionWarnings: warnings,
        sourceMeta,
      },
    });

    return NextResponse.json({
      ok: true,
      id: doc.id,
      usedPath: resolved.path,
      warnings,
      extractedJson,
      hardValidation: useHardValidation ? bestCandidate.validation : null,
      extractionAttempts: useHardValidation ? extractionAttempts : undefined,
      partialTaskReextract: taskNumbers.length ? taskNumbers : undefined,
      document: updatedDoc,
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    const stack = err?.stack ? String(err.stack) : "";

      const nextStatus = doc.lockedAt ? "LOCKED" : "FAILED";
      await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: {
          status: nextStatus as any,
          extractionWarnings: [`REFERENCE_EXTRACT_ERROR: ${message}`, stack ? stack.slice(0, 2000) : ""].filter(Boolean),
        },
      });

    // Surface the error in the server console for fast debugging.
    // (We still store a truncated stack in extractionWarnings for audit.)
    console.error("REFERENCE_EXTRACT_ERROR", message, stack);

    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json({ error: "REFERENCE_EXTRACT_ERROR", message, ...(isDev && stack ? { stack } : {}) }, { status: 500 });
  }

}
