"use client";

import { useMemo, useState } from "react";
import { TasksOverrideModal } from "./TasksOverrideModal";
import { Pill } from "../../components/ui";
import { tone } from "./briefStyles";

type Part = { key: string; text: string };

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

function isFormulaLike(text: string) {
  return /[=^/√π]|\bsqrt\b/i.test(text || "");
}

function PartCard({ part }: { part: Part }) {
  const [showRaw, setShowRaw] = useState(false);
  const [tableRaw, setTableRaw] = useState(false);
  const tableLines = detectTableLines(part.text);
  const formula = isFormulaLike(part.text);
  const mathUnclean = hasUncleanMath(part.text);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(showRaw ? part.text : part.text);
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
          {tableLines.length > 0 ? <Pill cls={tone("ok")}>TABLE</Pill> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {showRaw ? "Clean" : "Raw"}
          </button>
          <button
            type="button"
            onClick={copyText}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Copy
          </button>
        </div>
      </div>

      {tableLines.length > 0 ? (
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
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-zinc-900">{part.text}</pre>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <tbody>
                  {tableLines.map((line, idx) => {
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
          {part.text}
        </pre>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-zinc-800">{part.text}</div>
      )}
    </article>
  );
}

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
  const taskRows = useMemo((): TaskRow[] => {
    if (!tasksOverride || !tasksOverride.length) {
      return extracted.map((task: any) => ({ task, extractedTask: task, overrideApplied: false }));
    }

    return extracted.map((task: any, idx: number) => {
      const override = tasksOverride.find((o: any) => o?.n === task?.n) ?? tasksOverride[idx] ?? null;
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

  const linkedId: string | null = linkedDoc?.id ?? null;
  const [editForId, setEditForId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<number | null>(taskRows[0]?.task?.n ?? null);

  const editOpen = editForId !== null && editForId === linkedId;

  const selected =
    taskRows.find((r) => Number(r.task?.n) === Number(selectedTask)) ||
    taskRows[0] ||
    null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Tasks & questions</h2>
          <p className="mt-1 text-sm text-zinc-700">Structured task blocks with clean/raw view and warnings.</p>
        </div>

        <div className="flex items-center gap-2">
          <Pill cls={tasksOverride ? tone("info") : tone("muted")}>{tasksOverride ? "OVERRIDE" : "EXTRACTED"}</Pill>
          <button
            type="button"
            onClick={() => linkedId && setEditForId(linkedId)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Edit override
          </button>
        </div>
      </div>

      {warnings.length ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Extraction warnings</div>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w: any, i: number) => (
              <li key={i}>{String(w)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!taskRows.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">No tasks detected yet</div>
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
                    onClick={() => setSelectedTask(task?.n)}
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
            {selected ? (
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

                {(Array.isArray(selected.task?.parts) && selected.task.parts.length
                  ? selected.task.parts
                  : [{ key: "body", text: selected.task?.text || "" }]
                ).map((part: Part) => (
                  <PartCard key={`${selected.task?.n}-${part.key}`} part={part} />
                ))}
              </>
            ) : null}
          </main>
        </div>
      )}

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
