export type BriefHardValidationLevel = "BLOCKER" | "WARNING";

export type BriefHardValidationIssue = {
  level: BriefHardValidationLevel;
  code:
    | "NOT_BRIEF"
    | "NO_TASKS"
    | "TASK_NUMBER_DUPLICATE"
    | "TASK_TEXT_SHORT"
    | "TASK_WARNING_SHORT_OR_EMPTY"
    | "MISSING_SCENARIO"
    | "DUPLICATE_PART_KEY"
    | "FIGURE_WITHOUT_IMAGE_TOKEN"
    | "CELSIUS_ARTIFACT"
    | "TASK_COUNT_LOWER_THAN_SOURCE";
  message: string;
  taskNumber?: number;
  detail?: string;
};

export type BriefHardValidationResult = {
  ok: boolean;
  blockerCount: number;
  warningCount: number;
  score: number;
  issues: BriefHardValidationIssue[];
};

function norm(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractExpectedTaskCountFromSource(sourceText: string) {
  const src = String(sourceText || "");
  const matches = Array.from(src.matchAll(/\bTask\s*([1-9]\d?)\b/gi))
    .map((m) => Number(m[1]))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!matches.length) return 0;
  return new Set(matches).size;
}

function hasUnresolvedCelsiusArtifacts(text: string) {
  const src = String(text || "");
  if (!src) return false;
  if (/[0-9]\s*(?:\n\s*)?[∘°]\s*(?:\n\s*)?(?:퐶퐶|퐶\s*퐶|C\s*C|C{2,})\b/i.test(src)) return true;
  if (/[0-9]\s*(?:\n\s*)?퐶퐶\b/i.test(src)) return true;
  return false;
}

function looksSuspiciousTaskWarning(warnings: string[]) {
  const lowered = warnings.map((w) => String(w || "").toLowerCase());
  return lowered.some((w) => w.includes("task body: empty") || w.includes("task body: suspiciously short"));
}

function normalizePartKeys(parts: any[]) {
  const out: string[] = [];
  let currentParent = "";
  for (const part of Array.isArray(parts) ? parts : []) {
    const raw = String(part?.key || "").trim().toLowerCase();
    if (!raw) continue;

    if (/^[a-z]$/.test(raw)) {
      currentParent = raw;
      out.push(raw);
      continue;
    }

    if (/^[a-z](?:\.[a-z0-9ivxlcdm]+)+$/i.test(raw)) {
      currentParent = raw.split(".")[0] || currentParent;
      out.push(raw);
      continue;
    }

    if (/^(?:\d+|[ivxlcdm]+)$/i.test(raw) && currentParent) {
      out.push(`${currentParent}.${raw}`);
      continue;
    }

    out.push(raw);
  }
  return out;
}

function hasScenarioSignal(draftLike: any) {
  const scenarios = Array.isArray(draftLike?.scenarios) ? draftLike.scenarios : [];
  if (scenarios.some((s: any) => norm(s?.text))) return true;
  const tasks = Array.isArray(draftLike?.tasks) ? draftLike.tasks : [];
  return tasks.some((t: any) => norm(t?.scenarioText));
}

export function validateBriefExtractionHard(draftLike: any, sourceText = ""): BriefHardValidationResult {
  const issues: BriefHardValidationIssue[] = [];
  const kind = String(draftLike?.kind || "").toUpperCase();
  if (kind !== "BRIEF") {
    issues.push({
      level: "BLOCKER",
      code: "NOT_BRIEF",
      message: "Hard validation only applies to BRIEF drafts.",
    });
  }

  const tasks = Array.isArray(draftLike?.tasks) ? draftLike.tasks : [];
  if (!tasks.length) {
    issues.push({
      level: "BLOCKER",
      code: "NO_TASKS",
      message: "No tasks were extracted from the brief.",
    });
  }

  const seenTaskNumbers = new Set<number>();
  const requireScenarioMapping = hasScenarioSignal(draftLike);
  for (const task of tasks) {
    const n = Number(task?.n || 0);
    const taskText = String(task?.text || "");
    const parts = Array.isArray(task?.parts) ? task.parts : [];
    const warnings = Array.isArray(task?.warnings) ? task.warnings.map((w: any) => String(w || "")) : [];

    if (Number.isInteger(n) && n > 0) {
      if (seenTaskNumbers.has(n)) {
        issues.push({
          level: "BLOCKER",
          code: "TASK_NUMBER_DUPLICATE",
          taskNumber: n,
          message: `Task ${n} appears more than once.`,
        });
      }
      seenTaskNumbers.add(n);
    }

    const textWords = norm(taskText).split(" ").filter(Boolean).length;
    if (textWords < 35) {
      issues.push({
        level: "WARNING",
        code: "TASK_TEXT_SHORT",
        taskNumber: n || undefined,
        message: `Task ${n || "?"} text is very short (${textWords} words).`,
      });
    }

    if (looksSuspiciousTaskWarning(warnings)) {
      issues.push({
        level: "BLOCKER",
        code: "TASK_WARNING_SHORT_OR_EMPTY",
        taskNumber: n || undefined,
        message: `Task ${n || "?"} still carries empty/short-body extraction warnings.`,
      });
    }

    if (requireScenarioMapping && n > 0 && !norm(task?.scenarioText)) {
      issues.push({
        level: "WARNING",
        code: "MISSING_SCENARIO",
        taskNumber: n,
        message: `Task ${n} has no mapped scenario/context.`,
      });
    }

    const partKeySet = new Set<string>();
    for (const key of normalizePartKeys(parts)) {
      if (!key) continue;
      if (partKeySet.has(key)) {
        issues.push({
          level: "BLOCKER",
          code: "DUPLICATE_PART_KEY",
          taskNumber: n || undefined,
          detail: key,
          message: `Task ${n || "?"} has duplicate part key "${key}".`,
        });
      }
      partKeySet.add(key);
    }

    const joined = [taskText, ...parts.map((p: any) => String(p?.text || ""))].join("\n");
    const mentionsFigure = /\b(figure\s*\d+|figure\s+below|diagram|schematic|graph\s+below|chart\s+below|shown\s+in\s+the\s+figure|see\s+figure|following\s+graph|in\s+the\s+graph)\b/i.test(
      joined
    );
    const hasImageToken = /\[\[IMG:[^\]]+\]\]/.test(joined);
    if (mentionsFigure && !hasImageToken) {
      issues.push({
        level: "WARNING",
        code: "FIGURE_WITHOUT_IMAGE_TOKEN",
        taskNumber: n || undefined,
        message: `Task ${n || "?"} references a figure/diagram but has no [[IMG:...]] token.`,
      });
    }

    if (hasUnresolvedCelsiusArtifacts(joined)) {
      issues.push({
        level: "BLOCKER",
        code: "CELSIUS_ARTIFACT",
        taskNumber: n || undefined,
        message: `Task ${n || "?"} still contains unresolved Celsius OCR artifacts.`,
      });
    }
  }

  const expectedTasks = extractExpectedTaskCountFromSource(sourceText);
  const actualTasks = new Set(tasks.map((t: any) => Number(t?.n || 0)).filter((n: number) => n > 0)).size;
  if (expectedTasks > 0 && actualTasks > 0 && actualTasks < expectedTasks) {
    issues.push({
      level: "BLOCKER",
      code: "TASK_COUNT_LOWER_THAN_SOURCE",
      message: `Extracted ${actualTasks} tasks but source text indicates ${expectedTasks}.`,
      detail: `source=${expectedTasks}, extracted=${actualTasks}`,
    });
  }

  const blockerCount = issues.filter((i) => i.level === "BLOCKER").length;
  const warningCount = issues.filter((i) => i.level === "WARNING").length;
  const score = Math.max(0, 100 - blockerCount * 22 - warningCount * 6);
  return {
    ok: blockerCount === 0,
    blockerCount,
    warningCount,
    score,
    issues,
  };
}
