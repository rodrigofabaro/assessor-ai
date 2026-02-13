"use client";

import { useState } from "react";
import type { Criterion, ReferenceDocument, Unit } from "../../reference/reference.logic";
import { Pill } from "./ui";
import BriefMappingPanel from "./BriefMappingPanel";
import { ui } from "@/components/ui/uiClasses";
import { useRouter } from "next/navigation";
import { TaskCard } from "./TaskCard";
import { statusTone, tone } from "../[briefId]/components/briefStyles";

function normalizeComparableText(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function parsePartsFromPartBlocks(text: string) {
  const src = String(text || "");
  const re = /(?:^|\n)\s*PART\s+(\d+)\s*\n/g;
  const starts: Array<{ idx: number; n: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    starts.push({ idx: m.index, n: Number(m[1]) });
  }
  if (!starts.length) return [] as Array<{ key: string; text: string }>;

  const alpha = "abcdefghijklmnopqrstuvwxyz";
  const parts: Array<{ key: string; text: string }> = [];
  for (let i = 0; i < starts.length; i += 1) {
    const cur = starts[i];
    const next = starts[i + 1];
    const markerLen = (`PART ${cur.n}\n`).length;
    const start = cur.idx + (src.slice(cur.idx).startsWith("\n") ? 1 : 0);
    const markerPos = src.indexOf("\n", start);
    if (markerPos < 0) continue;
    const bodyStart = markerPos + 1;
    const bodyEnd = next ? next.idx : src.length;
    const body = src.slice(bodyStart, bodyEnd).trim();
    const key = alpha[i] || `p${i + 1}`;
    if (body) parts.push({ key, text: body });
  }
  return parts;
}

function syncTaskFromText(task: any) {
  const text = String(task?.text || "");
  if (!text.trim()) return task;
  const next = { ...task, prompt: text };
  const parsed = parsePartsFromPartBlocks(text);
  if (!parsed.length) return next;

  const existing = Array.isArray(task?.parts) ? task.parts : [];
  const existingJoined = normalizeComparableText(existing.map((p: any) => String(p?.text || "")).join("\n"));
  const parsedJoined = normalizeComparableText(parsed.map((p) => p.text).join("\n"));
  if (parsedJoined && parsedJoined !== existingJoined) {
    next.parts = parsed;
  }
  return next;
}

export default function BriefReviewCard({ rx }: { rx: any }) {
  const router = useRouter();
  const doc = rx.selectedDoc as ReferenceDocument | null;

  // 1. Prefer live manual JSON preview (when enabled and valid), then saved manual draft, then extracted.
  const manualDraft: any = (doc?.sourceMeta as any)?.manualDraft || null;
  let liveRawDraft: any = null;
  if (rx.showRawJson && typeof rx.rawJson === "string" && rx.rawJson.trim()) {
    try {
      liveRawDraft = JSON.parse(rx.rawJson);
    } catch {
      liveRawDraft = null;
    }
  }
  const latestDraft: any = liveRawDraft || manualDraft || doc?.extractedJson || null;

  /**
   * 2. Derive a "safe" draft (replaces lastGoodDraft state/effect)
   * We validate the current latestDraft. If it's empty (e.g. during a re-extract),
   * we show the last persisted truth from the doc object.
   */
  const isValidDraft = (d: any) =>
    d &&
    typeof d === "object" &&
    (d.kind || d.header || d.tasks);

  const draft: any = isValidDraft(latestDraft) 
    ? latestDraft 
    : (doc?.extractedJson ?? null);

  const rawTasks = (Array.isArray(draft?.tasks) ? draft.tasks : []).map(syncTaskFromText);
  const draftWarnings = Array.isArray(draft?.warnings) ? draft.warnings : [];
  const taskWarningRows = rawTasks.flatMap((task: any, idx: number) => {
    const n = Number(task?.n || idx + 1);
    const label = String(task?.label || (task?.n ? `Task ${task.n}` : `Task ${idx + 1}`)).trim();
    const ws = Array.isArray(task?.warnings) ? task.warnings : [];
    return ws.map((w: any) => ({ n, label, warning: String(w) }));
  });
  const taskWarnings = taskWarningRows.map((row) => ({ ...row, text: `${row.label}: ${row.warning}` }));
  const lockConflict = rx.lockConflict;
  const [expandAll, setExpandAll] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);
  const [copyJsonStatus, setCopyJsonStatus] = useState<"idle" | "copied" | "failed">("idle");
  const readiness = (doc as any)?.readiness as string | undefined;
  const usage = rx.selectedDocUsage;
  const usageLoading = rx.usageLoading;
  const canExtract = !!doc && !(rx?.busy?.current ?? rx?.busy) && !doc.lockedAt;
  const canLock = !!doc && !(rx?.busy?.current ?? rx?.busy) && !doc.lockedAt;
  const canUnlock = !!doc && !(rx?.busy?.current ?? rx?.busy) && !!doc.lockedAt && !!usage && !usage.inUse;
  const canDelete = !!doc && !(rx?.busy?.current ?? rx?.busy) && !doc.lockedAt && !!usage && !usage.inUse;

  const extractedEquations = Array.isArray(draft?.equations) ? draft.equations : [];
  const equationLatexOverrides = doc?.sourceMeta?.equationLatexOverrides || {};
  const taskLatexOverrides = doc?.sourceMeta?.taskLatexOverrides || {};
  const equationsById = extractedEquations.reduce((acc: Record<string, any>, eq: any) => {
    if (!eq?.id) return acc;
    const override = equationLatexOverrides?.[eq.id];
    acc[eq.id] =
      typeof override === "string" && override.trim()
        ? {
            ...eq,
            latex: override.trim(),
            latexSource: "manual",
            needsReview: false,
            confidence: Math.max(Number(eq.confidence || 0), 0.99),
          }
        : eq;
    return acc;
  }, {});
  const tasks = rawTasks.filter((task: any) => {
    const text = typeof task?.text === "string" ? task.text : "";
    return text.trim().length > 0;
  });
  const tasksTotal = rawTasks.length;
  const tasksShown = tasks.length;
  const taskWarningCount = rawTasks.reduce((sum: number, task: any) => sum + (task?.warnings?.length || 0), 0);
  const warningCount = draftWarnings.length + taskWarningCount;
  const toggleExpandAll = (next: boolean) => {
    setExpandAll(next);
    setExpandSignal((prev) => prev + 1);
  };

  const jumpToTask = (taskNumber: number) => {
    if (!Number.isFinite(taskNumber) || taskNumber < 1) return;
    toggleExpandAll(true);
    window.setTimeout(() => {
      const el = document.getElementById(`task-card-${taskNumber}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  };

  const handleCopyExtractionJson = async () => {
    try {
      const payload = JSON.stringify(draft ?? {}, null, 2);
      await navigator.clipboard.writeText(payload);
      setCopyJsonStatus("copied");
    } catch {
      setCopyJsonStatus("failed");
    }
    setTimeout(() => setCopyJsonStatus("idle"), 2000);
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm min-w-0 overflow-hidden">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Review</div>
            <div className="mt-1 text-xs text-zinc-600">Review extracted tasks and warnings.</div>
          </div>
          {doc ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill cls={statusTone(doc.status)}>{doc.status}</Pill>
              {doc.lockedAt ? <Pill cls={tone("ok")}>Locked</Pill> : <Pill cls={tone("warn")}>Unlocked</Pill>}
              <Pill cls={warningCount ? tone("warn") : tone("ok")}>{warningCount} warning(s)</Pill>
              {readiness ? (
                <Pill cls={readiness === "READY" ? tone("ok") : readiness === "BLOCKED" ? tone("bad") : tone("warn")}>
                  {readiness === "READY" ? "Ready" : readiness === "BLOCKED" ? "Blocked" : "Needs review"}
                </Pill>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3">
          <div className="text-sm font-semibold text-zinc-900">
            {doc ? `Selected: ${doc.title || doc.originalFilename || "Untitled brief"}` : "No brief selected yet."}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canExtract}
              onClick={rx.extractSelected}
              className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              Extract
            </button>
            <button
              type="button"
              disabled={!canExtract}
              onClick={rx.reextractSelected}
              className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
            >
              Re-extract
            </button>
            <button
              type="button"
              disabled={!canLock}
              onClick={rx.lockSelected}
              className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              Lock brief
            </button>
            <button
              type="button"
              disabled={!canUnlock}
              onClick={rx.unlockSelectedDocument}
              title={
                usageLoading
                  ? "Checking usage…"
                  : usage?.inUse
                    ? "This brief has submissions attached and cannot be unlocked."
                    : !doc?.lockedAt
                      ? "Brief is not locked."
                      : ""
              }
              className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
            >
              Unlock
            </button>
            {doc ? (
              <a
                href={`/api/reference-documents/${doc.id}/file`}
                target="_blank"
                rel="noreferrer"
                className={ui.btnSecondary}
              >
                PDF preview
              </a>
            ) : (
              <button type="button" disabled className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}>
                PDF preview
              </button>
            )}
            <button
              type="button"
              disabled={!canDelete}
              onClick={rx.deleteSelectedDocument}
              title={
                usageLoading
                  ? "Checking usage…"
                  : doc?.lockedAt
                    ? "Locked briefs cannot be deleted. Unlock first."
                    : usage?.inUse
                      ? "This brief has submissions attached and cannot be deleted."
                      : ""
              }
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
          <details className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <summary className="cursor-pointer font-semibold text-zinc-700">Why locking matters</summary>
            <p className="mt-2">
              Locking binds this brief to a fixed spec version for audit-ready grading. Unlock only when corrections are required.
            </p>
          </details>
        </div>
      </div>

      {!doc ? (
        <div className="p-4 text-sm text-zinc-600">Select a brief to review extracted tasks and warnings.</div>
      ) : (
        <div className="p-4 grid gap-4">
          {draft?.kind === "BRIEF" ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Tasks (extracted)</div>
                  <div className="mt-0.5 text-xs text-zinc-600">Review each task and open to view full text.</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                    {tasksTotal} tasks
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExpandAll(true)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpandAll(false)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              <div className="mt-2 text-xs text-zinc-500">
                Showing <span className="font-semibold text-zinc-700">{tasksShown}</span> of{" "}
                <span className="font-semibold text-zinc-700">{tasksTotal}</span> tasks
              </div>

              {tasksShown ? (
                <div className="mt-3 grid gap-3">
                  {tasks.map((t: any, i: number) => (
                    <TaskCard
                      key={`task-${t?.id ?? ""}-${t?.n ?? ""}-${i}-${expandSignal}`}
                      task={t}
                      anchorId={`task-card-${Number(t?.n || i + 1)}`}
                      defaultExpanded={expandAll}
                      taskLatexOverrides={taskLatexOverrides}
                      equationsById={equationsById}
                      openPdfHref={doc ? `/api/reference-documents/${doc.id}/file` : undefined}
                      canEditLatex={true}
                      onSaveEquationLatex={rx.saveSelectedDocEquationLatex}
                      onSaveTaskLatexOverrides={rx.saveSelectedDocTaskLatex}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-semibold">No tasks detected</div>
                  <div className="mt-1">
                    {taskWarnings.length ? <span>{taskWarnings.join(" ")}</span> : <span>No tasks detected yet. Run Extract, then review Tasks.</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        rx.setShowRawJson?.(true);
                        document.getElementById("brief-raw-json")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-amber-200 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-300"
                    >
                      Manual override
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Warnings & readiness</div>
                <div className="mt-1 text-xs text-zinc-600">Resolve blockers before locking the brief.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Pill cls={warningCount ? tone("warn") : tone("ok")}>{warningCount} warning(s)</Pill>
                {readiness ? (
                  <Pill cls={readiness === "READY" ? tone("ok") : readiness === "BLOCKED" ? tone("bad") : tone("warn")}>
                    {readiness === "READY" ? "Ready" : readiness === "BLOCKED" ? "Blocked" : "Needs review"}
                  </Pill>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-zinc-700">
              {doc.lockedAt ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">Locked: extraction and edits are disabled.</div> : null}
              {warningCount > 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Fix options</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canExtract}
                      onClick={rx.reextractSelected}
                      className={ui.btnSecondary + " text-xs disabled:cursor-not-allowed disabled:opacity-60"}
                    >
                      Re-extract and review
                    </button>
                    <button
                      type="button"
                      disabled={!canExtract}
                      onClick={rx.extractSelected}
                      className={ui.btnSecondary + " text-xs disabled:cursor-not-allowed disabled:opacity-60"}
                    >
                      Re-run extract
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        rx.setShowRawJson?.(true);
                        document.getElementById("brief-raw-json")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className={ui.btnSecondary + " text-xs"}
                    >
                      Open manual override
                    </button>
                  </div>
                </div>
              ) : null}
              {draftWarnings.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div className="text-xs font-semibold uppercase tracking-wide">Extraction warnings ({draftWarnings.length})</div>
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {draftWarnings.map((w: string, i: number) => (
                      <li key={`${w}-${i}`}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No extraction warnings.</div>
              )}
              {taskWarnings.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div className="text-xs font-semibold uppercase tracking-wide">Task warnings ({taskWarnings.length})</div>
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {taskWarnings.map((w: { n: number; text: string }, i: number) => (
                      <li key={`${w.text}-${i}`}>
                        <button
                          type="button"
                          onClick={() => jumpToTask(w.n)}
                          className="text-left underline decoration-dotted underline-offset-2 hover:text-amber-950"
                        >
                          {w.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          <BriefMappingPanel
            draft={draft}
            units={rx.units as unknown as Unit[]}
            briefUnitId={rx.briefUnitId}
            setBriefUnitId={rx.setBriefUnitId}
            criteria={rx.criteriaForSelectedUnit as unknown as Criterion[]}
            mapSelected={rx.mapSelected}
            setMapSelected={rx.setMapSelected}
            assignmentCodeInput={rx.assignmentCodeInput}
            setAssignmentCodeInput={rx.setAssignmentCodeInput}
          />

          <div id="brief-raw-json" className="rounded-2xl border border-zinc-200 bg-white p-4 max-w-full overflow-hidden">
            <details className="max-w-full">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Manual override (raw JSON)</summary>
              <div className="mt-3 grid gap-2 max-w-full">
                <label className="flex items-start gap-2 max-w-full text-sm font-semibold text-zinc-900">
                  <input
                    type="checkbox"
                    checked={!!rx.showRawJson}
                    onChange={(e) => rx.setShowRawJson?.(e.target.checked)}
                  />
                  <span className="break-words">Enable manual override editing</span>
                </label>
                <p className="text-xs text-zinc-600">Use only when extraction misses structure. Overrides are logged at lock time.</p>
                {rx.showRawJson && typeof rx.rawJson === "string" && rx.rawJson.trim() ? (
                  (() => {
                    try {
                      JSON.parse(rx.rawJson);
                      return <p className="text-[11px] text-emerald-700">Live preview is using your current manual JSON.</p>;
                    } catch {
                      return <p className="text-[11px] text-rose-700">Invalid JSON: preview is still showing last valid draft.</p>;
                    }
                  })()
                ) : null}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyExtractionJson}
                      className={ui.btnSecondary + " text-xs"}
                    >
                      {copyJsonStatus === "copied"
                        ? "Copied extraction JSON"
                        : copyJsonStatus === "failed"
                          ? "Copy failed"
                          : "Copy extraction JSON"}
                    </button>
                    <button
                      type="button"
                      disabled={!doc || !!rx.busy}
                      onClick={rx.saveRawJsonDraft}
                      className={ui.btnPrimary + " text-xs disabled:cursor-not-allowed disabled:bg-zinc-300"}
                    >
                      Save draft override
                    </button>
                    <button
                      type="button"
                      disabled={!doc || !!rx.busy}
                      onClick={rx.clearRawJsonDraft}
                      className={ui.btnSecondary + " text-xs disabled:cursor-not-allowed disabled:opacity-60"}
                    >
                      Clear saved override
                    </button>
                  </div>
                  {manualDraft ? (
                    <p className="mt-2 text-[11px] text-emerald-700">Saved override draft is active for this brief.</p>
                  ) : null}
                </div>
                {rx.showRawJson ? (
                  <div className="overflow-x-auto max-w-full">
                    <textarea
                      value={rx.rawJson}
                      onChange={(e) => rx.setRawJson?.(e.target.value)}
                      className="h-[240px] w-full max-w-full rounded-xl border border-zinc-300 p-3 font-mono text-xs"
                      placeholder="Paste adjusted JSON here before locking."
                    />
                  </div>
                ) : (
                  <pre className="max-h-[240px] overflow-x-auto overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
                    {JSON.stringify(draft, null, 2)}
                  </pre>
                )}
              </div>
            </details>
          </div>
        </div>
      )}

      {lockConflict ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-zinc-900">Brief already locked</div>
            <p className="mt-2 text-sm text-zinc-700">
              A brief for{" "}
              <span className="font-semibold">
                {lockConflict.unitCode ? `Unit ${lockConflict.unitCode}` : "this unit"}{" "}
                {lockConflict.assignmentCode ? lockConflict.assignmentCode : ""}
              </span>{" "}
              is already locked.
            </p>
            {lockConflict.existingTitle ? (
              <p className="mt-2 text-xs text-zinc-600">Existing brief: {lockConflict.existingTitle}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/admin/briefs/${lockConflict.existingBriefId}`)}
                className={ui.btnSecondary}
              >
                Open existing locked brief
              </button>
              <button
                type="button"
                onClick={rx.confirmLockOverwrite}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                Replace it (danger)
              </button>
              <button type="button" onClick={() => rx.setLockConflict(null)} className={ui.btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
