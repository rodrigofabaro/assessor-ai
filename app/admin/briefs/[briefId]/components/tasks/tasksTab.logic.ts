export function getExtractedTasks(linkedDoc: any): any[] {
  const tasks = linkedDoc?.extractedJson?.tasks;
  return Array.isArray(tasks) ? tasks : [];
}

export function getWarnings(linkedDoc: any): any[] {
  const ws = linkedDoc?.extractedJson?.warnings;
  return Array.isArray(ws) ? ws : [];
}

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

function normalizeTaskNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function mergeOverrideTasks(extracted: any[], overrides: any[]) {
  if (!overrides || !overrides.length) {
    return extracted.map((task: any) => ({
      task: syncTaskFromText(task),
      extractedTask: task,
      overrideApplied: false,
    }));
  }

  return extracted.map((task: any) => {
    const taskN = normalizeTaskNumber(task?.n);
    const override = taskN !== null
      ? overrides.find((o: any) => normalizeTaskNumber(o?.n) === taskN) ?? null
      : null;
    if (!override) return { task: syncTaskFromText(task), extractedTask: task, overrideApplied: false };

    const merged = { ...task };
    if ("label" in override) merged.label = override.label;
    if ("heading" in override) merged.heading = override.heading;
    if ("title" in override) merged.title = override.title;
    if ("text" in override) {
      merged.text = override.text;
      merged.prompt = override.text;
    }
    if ("parts" in override) {
      merged.parts = Array.isArray(override.parts) ? override.parts : [];
    } else if ("text" in override) {
      // When text is overridden but parts are not, avoid rendering stale extracted parts.
      merged.parts = [];
    }
    if ("warnings" in override) merged.warnings = override.warnings;

    return { task: syncTaskFromText(merged), extractedTask: task, overrideApplied: true };
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
