export function getExtractedTasks(linkedDoc: any): any[] {
  const tasks = linkedDoc?.extractedJson?.tasks;
  return Array.isArray(tasks) ? tasks : [];
}

export function getWarnings(linkedDoc: any): any[] {
  const ws = linkedDoc?.extractedJson?.warnings;
  return Array.isArray(ws) ? ws : [];
}

export function mergeOverrideTasks(extracted: any[], overrides: any[]) {
  if (!overrides || !overrides.length) {
    return extracted.map((task: any) => ({
      task,
      extractedTask: task,
      overrideApplied: false,
    }));
  }

  return extracted.map((task: any, index: number) => {
    const override = overrides.find((o: any) => o?.n === task?.n) ?? overrides[index] ?? null;
    if (!override) return { task, extractedTask: task, overrideApplied: false };

    const merged = { ...task };
    if ("label" in override) merged.label = override.label;
    if ("heading" in override) merged.heading = override.heading;
    if ("title" in override) merged.title = override.title;
    if ("text" in override) merged.text = override.text;
    if ("parts" in override) {
      merged.parts = Array.isArray(override.parts) ? override.parts : [];
    } else if ("text" in override) {
      // When text is overridden but parts are not, avoid rendering stale extracted parts.
      merged.parts = [];
    }
    if ("warnings" in override) merged.warnings = override.warnings;

    return { task: merged, extractedTask: task, overrideApplied: true };
  });
}

export function makeTaskKey(row: any, index: number): string {
  const n = row?.task?.n ?? row?.extractedTask?.n;
  const heading = row?.task?.heading ?? row?.task?.title ?? row?.task?.label;
  if (n !== undefined && n !== null && String(n).trim()) return `task-${String(n)}`;
  if (heading !== undefined && heading !== null && String(heading).trim()) {
    return `task-heading-${String(heading)}-${index}`;
  }
  return `task-index-${index}`;
}
