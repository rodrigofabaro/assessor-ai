"use client";

import { useMemo, useState } from "react";
import { TaskCard } from "../../components/TaskCard";
import { TasksOverrideModal } from "./TasksOverrideModal";
import { TasksControls } from "./tasks/TasksControls";
import { TasksEmptyState } from "./tasks/TasksEmptyState";
import { TasksTabHeader } from "./tasks/TasksTabHeader";
import { getExtractedTasks, getWarnings, makeTaskKey, mergeOverrideTasks } from "./tasks/tasksTab.logic";
import { TasksWarnings } from "./tasks/TasksWarnings";

export function TasksTab({
  vm,
  onGoToExtract,
}: {
  vm: any;
  onGoToExtract?: () => void;
}) {
  const linkedDoc = vm.linkedDoc;
  const tasksOverride = vm.tasksOverride;
  const linkedId: string | null = linkedDoc?.id ?? null;
  const extractedEquations = Array.isArray(linkedDoc?.extractedJson?.equations) ? linkedDoc.extractedJson.equations : [];
  const equationLatexOverrides = linkedDoc?.sourceMeta?.equationLatexOverrides || {};
  const taskLatexOverrides = linkedDoc?.sourceMeta?.taskLatexOverrides || {};
  const equationsById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const eq of extractedEquations) {
      if (!eq?.id) continue;
      const override = equationLatexOverrides?.[eq.id];
      if (typeof override === "string" && override.trim()) {
        map[eq.id] = {
          ...eq,
          latex: override.trim(),
          latexSource: "manual",
          needsReview: false,
          confidence: Math.max(Number(eq.confidence || 0), 0.99),
        };
      } else {
        map[eq.id] = eq;
      }
    }
    return map;
  }, [equationLatexOverrides, extractedEquations]);

  const extracted = useMemo(() => getExtractedTasks(linkedDoc), [linkedDoc]);
  const warnings = useMemo(() => getWarnings(linkedDoc), [linkedDoc]);
  const taskRows = useMemo(() => mergeOverrideTasks(extracted, tasksOverride), [extracted, tasksOverride]);

  const [editForId, setEditForId] = useState<string | null>(null);
  const [forceExpanded, setForceExpanded] = useState<boolean | undefined>(undefined);

  const editOpen = editForId !== null && editForId === linkedId;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <TasksTabHeader
        hasOverride={!!tasksOverride}
        onEditOverride={() => {
          if (linkedId) setEditForId(linkedId);
        }}
      />

      <TasksWarnings warnings={warnings} />

      {vm.tasksError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{vm.tasksError}</div>
      ) : null}

      <TasksControls onExpandAll={() => setForceExpanded(true)} onCollapseAll={() => setForceExpanded(false)} />

      <div className="mt-3 grid gap-3">
        {taskRows && taskRows.length ? (
          taskRows.map((row: any, index: number) => (
            <TaskCard
              key={makeTaskKey(row, index)}
              task={row.task}
              extractedTask={row.extractedTask}
              overrideApplied={row.overrideApplied}
              forcedExpanded={forceExpanded}
              taskLatexOverrides={taskLatexOverrides}
              equationsById={equationsById}
              openPdfHref={linkedId ? `/api/reference-documents/${linkedId}/file` : undefined}
              canEditLatex={true}
              onSaveEquationLatex={vm.saveEquationLatex}
              onSaveTaskLatexOverrides={vm.saveTaskLatex}
              showSidebar={false}
            />
          ))
        ) : (
          <TasksEmptyState onGoToExtract={onGoToExtract} />
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
