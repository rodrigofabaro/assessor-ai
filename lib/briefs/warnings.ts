export type BriefTaskLike = {
  n?: number | string;
  confidence?: "CLEAN" | "HEURISTIC" | "OVERRIDDEN" | string;
  warnings?: unknown;
  aiCorrected?: boolean;
  text?: unknown;
  prompt?: unknown;
  parts?: unknown;
  equations?: unknown;
};

type WarningOptions = {
  equationsById?: Record<string, any>;
  taskLatexOverrides?: Record<string, string>;
};

function rawWarnings(task: BriefTaskLike): string[] {
  return Array.isArray(task?.warnings) ? task.warnings.map((w) => String(w)) : [];
}

function referencedEquationIds(task: BriefTaskLike): string[] {
  const ids = new Set<string>();
  const tokenRe = /\[\[EQ:([^\]]+)\]\]/g;
  const collect = (value: unknown) => {
    const txt = String(value || "");
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(txt))) {
      if (m[1]) ids.add(String(m[1]));
    }
  };

  collect(task?.text);
  collect(task?.prompt);
  if (Array.isArray(task?.parts)) {
    for (const p of task.parts as Array<any>) collect(p?.text);
  }
  return Array.from(ids);
}

function hasManualTaskLatexOverride(task: BriefTaskLike, taskLatexOverrides?: Record<string, string>): boolean {
  const n = Number(task?.n);
  if (!Number.isFinite(n) || n <= 0) return false;
  const prefix = `${n}.`;
  const src = taskLatexOverrides || {};
  return Object.keys(src).some((k) => {
    if (!String(k || "").startsWith(prefix)) return false;
    return String(src[k] || "").trim().length > 0;
  });
}

function isResolvedEquation(eq: any): boolean {
  const latex = String(eq?.latex || "").trim();
  return !!latex && !eq?.needsReview;
}

function hasResolvedTaskEquations(task: BriefTaskLike): boolean {
  if (!Array.isArray(task?.equations)) return false;
  if ((task.equations as Array<any>).length === 0) return false;
  return (task.equations as Array<any>).every(isResolvedEquation);
}

function hasResolvedReferencedEquations(task: BriefTaskLike, equationsById?: Record<string, any>): boolean {
  const ids = referencedEquationIds(task);
  if (!ids.length) return false;
  return ids.every((id) => isResolvedEquation(equationsById?.[id]));
}

export function computeEffectiveTaskWarnings(task: BriefTaskLike, options?: WarningOptions): string[] {
  const raw = rawWarnings(task);
  const resolved =
    hasResolvedTaskEquations(task) ||
    hasResolvedReferencedEquations(task, options?.equationsById) ||
    hasManualTaskLatexOverride(task, options?.taskLatexOverrides);

  return raw
    .filter((w) => !/openai math cleanup applied/i.test(w))
    .filter((w) => !(resolved && /equation quality: low-confidence/i.test(w)));
}

export function isTaskAiCorrected(task: BriefTaskLike): boolean {
  const raw = rawWarnings(task);
  return !!task?.aiCorrected || raw.some((w) => /openai math cleanup applied/i.test(w));
}

export function computeEffectiveTaskConfidence(
  task: BriefTaskLike,
  warnings: string[],
  overrideApplied?: boolean
): "CLEAN" | "HEURISTIC" | "OVERRIDDEN" {
  const base = overrideApplied
    ? "OVERRIDDEN"
    : task?.confidence === "HEURISTIC"
      ? "HEURISTIC"
      : "CLEAN";
  if (base === "HEURISTIC" && warnings.length === 0) return "CLEAN";
  return base;
}

