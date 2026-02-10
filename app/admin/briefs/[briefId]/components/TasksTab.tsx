"use client";

import { useMemo, useState } from "react";
import { TasksOverrideModal } from "./TasksOverrideModal";
import { Pill } from "../../components/ui";
import { tone } from "./briefStyles";
<<<<<<< HEAD
import { TaskCard } from "../../components/TaskCard";
=======

type Part = { key: string; text: string };

type RenderedPart = {
  key: string;
  rawText: string;
  renderedText: string;
  tableLines: string[];
};

type TaskDisplayModel = {
  intro: string;
  parts: RenderedPart[];
  rawText: string;
  html: string;
};

type TaskRow = {
  task: any;
  extractedTask: any;
  overrideApplied: boolean;
};

function hasUncleanMath(text: string) {
  return /[\u{1D400}-\u{1D7FF}\uD479]/u.test(text || "");
}

function detectTableLines(text: string) {
  const lines = String(text || "").split(/\r?\n/);
  return lines.filter((line) => {
    const cols = line.trim().split(/\s{2,}|\t+/).filter(Boolean);
    return cols.length >= 3 && /\d/.test(line);
  });
}

function stripTableLines(text: string, tableLines: string[]) {
  if (!tableLines.length) return text;
  const tableSet = new Set(tableLines.map((line) => line.trim()));
  const lines = String(text || "").split(/\r?\n/);
  return lines
    .filter((line) => !tableSet.has(line.trim()))
    .join("\n")
    .trim();
}

function dedupeParagraphs(text: string) {
  const paras = String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const para of paras) {
    const normalized = para.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.length > 80 && seen.has(normalized)) continue;
    out.push(para);
    if (normalized.length > 80) seen.add(normalized);
  }
  return out.join("\n\n");
}

function isFormulaLike(text: string) {
  return /[=^/√π]|\bsqrt\b/i.test(text || "");
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTaskDisplayModel(task: any): TaskDisplayModel {
  const hasParts = Array.isArray(task?.parts) && task.parts.length > 0;
  const sourceParts: Part[] = hasParts ? task.parts : [{ key: "body", text: task?.text || "" }];

  const parts: RenderedPart[] = sourceParts.map((part) => {
    const rawText = String(part?.text || "");
    const tableLines = detectTableLines(rawText);
    const withoutTables = stripTableLines(rawText, tableLines);
    const renderedText = dedupeParagraphs(withoutTables);
    return {
      key: String(part?.key || "part"),
      rawText,
      renderedText,
      tableLines,
    };
  });

  const intro = String(task?.heading || task?.title || "").trim();
  const rawText = String(task?.text || "");
  const html = [
    intro ? `<p>${escapeHtml(intro)}</p>` : "",
    ...parts.map((part) => {
      const title = `<h4>${escapeHtml(part.key)}</h4>`;
      const body = part.tableLines.length
        ? `<pre>${escapeHtml(part.renderedText || "")}</pre>`
        : `<p>${escapeHtml(part.renderedText || "").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`;
      return `<section>${title}${body}</section>`;
    }),
  ]
    .filter(Boolean)
    .join("\n");

  return { intro, parts, rawText, html };
}

function PartCard({ part }: { part: RenderedPart }) {
  const [tableRaw, setTableRaw] = useState(false);
  const formula = isFormulaLike(part.renderedText);
  const mathUnclean = hasUncleanMath(part.renderedText);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(part.renderedText || part.rawText);
      window.alert(`Copied ${part.key}`);
    } catch {
      window.alert(`Copy failed for ${part.key}`);
    }
  };

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-800">{part.key}</span>
          {mathUnclean ? <Pill cls={tone("warn")}>MATH_UNCLEAN</Pill> : null}
          {part.tableLines.length > 0 ? <Pill cls={tone("ok")}>TABLE</Pill> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyText}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Copy
          </button>
        </div>
      </div>

      {part.tableLines.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-700">Table block</div>
            <button
              type="button"
              onClick={() => setTableRaw((v) => !v)}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
            >
              {tableRaw ? "Table view" : "Raw monospace"}
            </button>
          </div>
          {tableRaw ? (
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-zinc-900">{part.rawText}</pre>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <tbody>
                  {part.tableLines.map((line, idx) => {
                    const cols = line.trim().split(/\s{2,}|\t+/).filter(Boolean);
                    return (
                      <tr key={`${idx}-${line}`} className="border-b border-zinc-200 last:border-b-0">
                        {cols.map((col, i) => (
                          <td key={`${idx}-${i}`} className="px-2 py-1 text-zinc-800">
                            {col}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : formula ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono text-xs text-zinc-900">
          {part.renderedText}
        </pre>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-zinc-800">{part.renderedText}</div>
      )}
    </article>
  );
}
>>>>>>> 7ed6c2b (Deduplicate task rendered content in briefs tasks tab)

export function TasksTab({ vm, onGoToExtract }: { vm: any; onGoToExtract?: () => void }) {
  const linkedDoc = vm.linkedDoc;

  const extracted = useMemo(() => {
    const tasks = linkedDoc?.extractedJson?.tasks;
    return Array.isArray(tasks) ? tasks : [];
  }, [linkedDoc]);

  const warnings = useMemo(() => {
    const ws = linkedDoc?.extractedJson?.warnings;
    return Array.isArray(ws) ? ws : [];
  }, [linkedDoc]);

  const tasksOverride = vm.tasksOverride;
  const taskRows = useMemo(() => {
    if (!tasksOverride || !tasksOverride.length) {
      return extracted.map((task: any) => ({ task, extractedTask: task, overrideApplied: false }));
    }

    return extracted.map((task: any, idx: number) => {
      const override =
        tasksOverride.find((o: any) => o?.n === task?.n) ??
        tasksOverride[idx] ??
        null;
      if (!override) return { task, extractedTask: task, overrideApplied: false };
      const merged = { ...task };
      if ("label" in override) merged.label = override.label;
      if ("heading" in override) merged.heading = override.heading;
      if ("title" in override) merged.title = override.title;
      if ("text" in override) merged.text = override.text;
      if ("warnings" in override) merged.warnings = override.warnings;
      return { task: merged, extractedTask: task, overrideApplied: true };
    });
  }, [extracted, tasksOverride]);

  // ✅ No effect. Modal opens for the CURRENT linked doc only.
  const linkedId: string | null = linkedDoc?.id ?? null;
  const [editForId, setEditForId] = useState<string | null>(null);
<<<<<<< HEAD
  const [forceExpanded, setForceExpanded] = useState<boolean | undefined>(undefined);

  const editOpen = editForId !== null && editForId === linkedId;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Tasks & questions</h2>
          <p className="mt-1 text-sm text-zinc-700">
            This is the brief&apos;s “question paper”. The grader will later check student evidence against these task
            blocks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Pill cls={tasksOverride ? tone("info") : tone("muted")}>{tasksOverride ? "OVERRIDE" : "EXTRACTED"}</Pill>

          <button
            type="button"
            onClick={() => {
              if (linkedId) setEditForId(linkedId);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Edit override
          </button>
        </div>
      </div>

      {warnings.length ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Extraction warnings</div>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w: any, i: number) => (
              <li key={i}>{String(w)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {vm.tasksError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {vm.tasksError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-zinc-500">Default view is compact. Expand only the task you are reviewing.</div>
=======
  const [selectedTask, setSelectedTask] = useState<number | null>(taskRows[0]?.task?.n ?? null);
  const [taskTab, setTaskTab] = useState<"rendered" | "html" | "raw">("rendered");

  const editOpen = editForId !== null && editForId === linkedId;

  const selected =
    taskRows.find((r) => Number(r.task?.n) === Number(selectedTask)) ||
    taskRows[0] ||
    null;

  const selectedModel = useMemo(() => {
    if (!selected?.task) return null;
    return buildTaskDisplayModel(selected.task);
  }, [selected]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Tasks & questions</h2>
          <p className="mt-1 text-sm text-zinc-700">Structured task blocks with clean/raw view and warnings.</p>
        </div>

>>>>>>> 7ed6c2b (Deduplicate task rendered content in briefs tasks tab)
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setForceExpanded(true)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setForceExpanded(false)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
      {taskRows && taskRows.length ? (
        taskRows.map(({ task, extractedTask, overrideApplied }: any) => (
          <TaskCard
            key={`${task?.label ?? ""}-${task?.n ?? ""}`}
            task={task}
            extractedTask={extractedTask}
            overrideApplied={overrideApplied}
            forcedExpanded={forceExpanded}
          />
        ))
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">No tasks detected yet</div>
<<<<<<< HEAD
          <div className="mt-1">
            Run Extract on the BRIEF PDF in the inbox. If the template is odd, use the override editor below.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onGoToExtract?.()}
              className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Go to Extract tools
            </button>
          </div>
=======
          <button
            type="button"
            onClick={() => onGoToExtract?.()}
            className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Go to Extract tools
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-2 text-xs font-semibold text-zinc-700">Tasks</div>
            <div className="grid gap-2">
              {taskRows.map(({ task }) => {
                const selectedNow = Number(selectedTask) === Number(task?.n);
                const pages = Array.isArray(task?.pages) && task.pages.length ? `${Math.min(...task.pages)}-${Math.max(...task.pages)}` : "—";
                const ws = Array.isArray(task?.warnings) ? task.warnings : [];
                return (
                  <button
                    key={`task-rail-${task?.n}`}
                    type="button"
                    onClick={() => {
                      setSelectedTask(task?.n);
                      setTaskTab("rendered");
                    }}
                    className={`rounded-lg border px-2 py-2 text-left ${selectedNow ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:bg-zinc-100"}`}
                  >
                    <div className="text-sm font-semibold text-zinc-900">Task {task?.n}</div>
                    <div className="text-xs text-zinc-600">Pages: {pages}</div>
                    {ws.length ? <div className="mt-1 text-[11px] text-amber-700">{ws.length} warning(s)</div> : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="grid gap-3">
            {selected && selectedModel ? (
              <>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-sm font-semibold text-zinc-900">{selected.task?.label || `Task ${selected.task?.n}`}</div>
                  {selected.overrideApplied ? <div className="text-xs text-indigo-700">Override applied</div> : null}
                  {Array.isArray(selected.task?.warnings) && selected.task.warnings.length ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                      {selected.task.warnings.map((w: string, i: number) => (
                        <li key={`w-${i}`}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTaskTab("rendered")}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${taskTab === "rendered" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
                  >
                    Rendered
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskTab("html")}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${taskTab === "html" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
                  >
                    HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskTab("raw")}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${taskTab === "raw" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
                  >
                    Raw
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(selectedModel.html);
                        window.alert("Copied task HTML");
                      } catch {
                        window.alert("Copy HTML failed");
                      }
                    }}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Copy HTML
                  </button>
                </div>

                {taskTab === "rendered" ? (
                  <>
                    {selectedModel.intro ? (
                      <article className="rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="whitespace-pre-wrap text-sm text-zinc-800">{selectedModel.intro}</div>
                      </article>
                    ) : null}
                    {selectedModel.parts.map((part) => (
                      <PartCard key={`${selected.task?.n}-${part.key}`} part={part} />
                    ))}
                  </>
                ) : null}

                {taskTab === "html" ? (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900">
                    {selectedModel.html}
                  </pre>
                ) : null}

                {taskTab === "raw" ? (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900">
                    {selectedModel.rawText}
                  </pre>
                ) : null}
              </>
            ) : null}
          </main>
>>>>>>> 7ed6c2b (Deduplicate task rendered content in briefs tasks tab)
        </div>
      )}
      </div>

      <TasksOverrideModal
        open={editOpen}
        onClose={() => setEditForId(null)}
        extractedTasks={extracted}
        overrideTasks={tasksOverride}
        busy={vm.tasksBusy}
        onSave={async (next: any) => {
          await vm.saveTasksOverride(next);
          setEditForId(null);
        }}
      />
    </section>
  );
}
