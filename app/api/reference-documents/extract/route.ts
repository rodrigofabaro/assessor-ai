import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { resolveStoredFile } from "@/lib/extraction/storage/resolveStoredFile";
import { extractReferenceDocument } from "@/lib/extraction/index";


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

    const result = await extractReferenceDocument({
      type: doc.type,
      filePath: resolved.path,
      docTitleFallback: doc.title || doc.originalFilename || "",
      runOpenAiCleanup,
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
      reextractHistory,
    } as any;

    const updatedDoc = await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: "EXTRACTED",
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
      partialTaskReextract: taskNumbers.length ? taskNumbers : undefined,
      document: updatedDoc,
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    const stack = err?.stack ? String(err.stack) : "";

    await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: "FAILED",
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
