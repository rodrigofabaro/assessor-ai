"use client";

import { useMemo, useState } from "react";
import { TasksOverrideModal } from "./TasksOverrideModal";
import { TasksText } from "./TasksText";
import { Pill } from "../../components/ui";
import { tone } from "./briefStyles";

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
  const activeTasks = tasksOverride && tasksOverride.length ? tasksOverride : extracted;

  // ✅ No effect. Modal opens for the CURRENT linked doc only.
  const linkedId: string | null = linkedDoc?.id ?? null;
  const [editForId, setEditForId] = useState<string | null>(null);

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

      <div className="mt-4 grid gap-3">
      {activeTasks && activeTasks.length ? (
        activeTasks.map((t: any) => (
          <div key={`${t.label}-${t.n}`} className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{t.title || t.heading || t.label}</div>
                  {t.warnings?.length ? (
                    <div className="mt-1 text-xs text-amber-900">Warning: {t.warnings.join(", ")}</div>
                  ) : null}
                </div>
                <Pill cls={tone("muted")}>#{t.n}</Pill>
              </div>

              <div className="mt-3">
                <TasksText text={t.text || "(no body detected)"} />
              </div>
            </div>
          ))
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">No tasks detected yet</div>
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
