export type BriefFidelityIssueLevel = "BLOCKER" | "WARNING";

export type BriefFidelityIssue = {
  level: BriefFidelityIssueLevel;
  code:
    | "NOT_BRIEF"
    | "NO_TASKS"
    | "TASK_NOT_FOUND_IN_SOURCE"
    | "TASK_MISSING_FROM_EXTRACTION"
    | "TASK_MISSING_PAGE_PROVENANCE"
    | "TASK_LOW_SOURCE_OVERLAP"
    | "TASK_VISUAL_REFERENCE_WITHOUT_IMAGE_TOKEN"
    | "TASK_END_MATTER_LEAK";
  message: string;
  taskNumber?: number;
  detail?: string;
};

export type BriefTaskProvenance = {
  taskNumber: number;
  pages: number[];
  sourceAnchor: string;
  sourceSnippet: string;
  matchScore: number;
  citationStatus?: "CITED" | "NEEDS_REVIEW";
};

export type BriefFidelityReport = {
  ok: boolean;
  blockerCount: number;
  warningCount: number;
  issues: BriefFidelityIssue[];
  metrics: {
    expectedTaskCount: number;
    extractedTaskCount: number;
    matchedTaskCount: number;
    tasksWithPages: number;
    tasksWithoutPages: number;
    averageMatchScore: number;
  };
  taskProvenance: BriefTaskProvenance[];
};

function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toTaskNumber(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function parsePages(input: unknown) {
  if (!Array.isArray(input)) return [] as number[];
  const set = new Set<number>();
  for (const value of input) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function extractTaskSegmentsFromSource(sourceText: string) {
  const map = new Map<number, string>();
  const src = String(sourceText || "");
  const regex = /(?:^|\n)\s*Task\s*([1-9]\d?)\b[\s\S]*?(?=(?:\n\s*Task\s*[1-9]\d?\b)|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(src))) {
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1) continue;
    const existing = normalizeText(map.get(n) || "");
    const candidate = normalizeText(match[0] || "");
    if (!candidate) continue;
    if (!existing || candidate.length > existing.length) {
      map.set(n, candidate);
    }
  }
  return map;
}

function tokenize(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function keywordSet(value: string) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "task",
    "you",
    "your",
    "using",
    "into",
    "have",
    "has",
    "are",
    "was",
    "were",
    "will",
    "shall",
    "could",
    "should",
    "about",
    "below",
    "above",
  ]);
  const out = new Set<string>();
  for (const token of tokenize(value)) {
    if (!stopWords.has(token)) out.add(token);
  }
  return out;
}

function overlapScore(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  const denominator = Math.max(1, Math.min(a.size, b.size));
  return overlap / denominator;
}

function containsVisualCue(value: string) {
  return /\b(figure\s*\d+|figure\s+below|diagram|schematic|graph\s+below|chart\s+below|see\s+figure|shown\s+below)\b/i.test(
    String(value || "")
  );
}

function hasImageToken(value: string) {
  return /\[\[IMG:[^\]]+\]\]/.test(String(value || ""));
}

function containsEndMatterLeak(value: string) {
  const text = normalizeText(value).toLowerCase();
  return (
    /\bsources?\s+of\s+information\b/.test(text) ||
    /\brelevant\s+learning\s+outcomes?\s+and\s+assessment\s+criteria\b/.test(text)
  );
}

export function buildBriefFidelityReport(draftLike: any, sourceText: string): BriefFidelityReport {
  const issues: BriefFidelityIssue[] = [];
  const kind = String(draftLike?.kind || "").toUpperCase();
  if (kind !== "BRIEF") {
    issues.push({
      level: "BLOCKER",
      code: "NOT_BRIEF",
      message: "Fidelity report applies only to BRIEF drafts.",
    });
  }

  const tasks = Array.isArray(draftLike?.tasks) ? draftLike.tasks : [];
  if (tasks.length === 0) {
    issues.push({
      level: "BLOCKER",
      code: "NO_TASKS",
      message: "No tasks available to evaluate fidelity.",
    });
  }

  const sourceTaskMap = extractTaskSegmentsFromSource(sourceText);
  const expectedTasks = Array.from(sourceTaskMap.keys()).sort((a, b) => a - b);
  const extractedTaskNumbers = new Set<number>();
  const taskProvenance: BriefTaskProvenance[] = [];
  let tasksWithPages = 0;
  let tasksWithoutPages = 0;
  let matchedTaskCount = 0;
  let matchScoreTotal = 0;

  for (const task of tasks) {
    const n = toTaskNumber(task?.n);
    if (n > 0) extractedTaskNumbers.add(n);

    const pages = parsePages(task?.pages);
    if (pages.length > 0) tasksWithPages += 1;
    else tasksWithoutPages += 1;

    const taskText = normalizeText(
      [task?.text, ...(Array.isArray(task?.parts) ? task.parts.map((p: any) => p?.text) : [])].join("\n")
    );
    const sourceSegment = normalizeText(sourceTaskMap.get(n) || "");
    const score = sourceSegment ? overlapScore(keywordSet(taskText), keywordSet(sourceSegment)) : 0;
    if (sourceSegment) {
      matchedTaskCount += 1;
      matchScoreTotal += score;
    }

    if (n > 0 && !sourceSegment) {
      issues.push({
        level: "BLOCKER",
        code: "TASK_NOT_FOUND_IN_SOURCE",
        taskNumber: n,
        message: `Task ${n} is displayed but no matching Task ${n} heading was found in source text.`,
      });
    }

    if (n > 0 && sourceSegment && score < 0.12) {
      issues.push({
        level: "WARNING",
        code: "TASK_LOW_SOURCE_OVERLAP",
        taskNumber: n,
        message: `Task ${n} has weak lexical overlap with source text.`,
        detail: `overlap=${score.toFixed(2)}`,
      });
    }

    if (n > 0 && pages.length === 0) {
      issues.push({
        level: "WARNING",
        code: "TASK_MISSING_PAGE_PROVENANCE",
        taskNumber: n,
        message: `Task ${n} has no page provenance.`,
      });
    }

    if (n > 0 && containsVisualCue(taskText) && !hasImageToken(taskText)) {
      issues.push({
        level: "WARNING",
        code: "TASK_VISUAL_REFERENCE_WITHOUT_IMAGE_TOKEN",
        taskNumber: n,
        message: `Task ${n} references a visual element without an image token.`,
      });
    }

    if (n > 0 && containsEndMatterLeak(taskText)) {
      issues.push({
        level: "BLOCKER",
        code: "TASK_END_MATTER_LEAK",
        taskNumber: n,
        message: `Task ${n} appears contaminated by end-matter content.`,
      });
    }

    if (n > 0) {
      taskProvenance.push({
        taskNumber: n,
        pages,
        sourceAnchor: `Task ${n}`,
        sourceSnippet: sourceSegment.slice(0, 260),
        matchScore: Number(score.toFixed(3)),
        citationStatus: sourceSegment ? "CITED" : "NEEDS_REVIEW",
      });
    }
  }

  for (const expected of expectedTasks) {
    if (!extractedTaskNumbers.has(expected)) {
      issues.push({
        level: "BLOCKER",
        code: "TASK_MISSING_FROM_EXTRACTION",
        taskNumber: expected,
        message: `Source includes Task ${expected}, but extraction output is missing it.`,
      });
    }
  }

  const blockerCount = issues.filter((i) => i.level === "BLOCKER").length;
  const warningCount = issues.filter((i) => i.level === "WARNING").length;
  const averageMatchScore = matchedTaskCount > 0 ? Number((matchScoreTotal / matchedTaskCount).toFixed(3)) : 0;

  return {
    ok: blockerCount === 0,
    blockerCount,
    warningCount,
    issues,
    metrics: {
      expectedTaskCount: expectedTasks.length,
      extractedTaskCount: tasks.length,
      matchedTaskCount,
      tasksWithPages,
      tasksWithoutPages,
      averageMatchScore,
    },
    taskProvenance,
  };
}

export function attachBriefTaskProvenance(draftLike: any, report: BriefFidelityReport) {
  if (!draftLike || typeof draftLike !== "object") return draftLike;
  if (!Array.isArray(draftLike.tasks)) return draftLike;

  const byTaskNumber = new Map<number, BriefTaskProvenance>();
  for (const row of report.taskProvenance || []) {
    if (row?.taskNumber) byTaskNumber.set(row.taskNumber, row);
  }

  const tasks = draftLike.tasks.map((task: any) => {
    const n = toTaskNumber(task?.n);
    const provenance = n > 0 ? byTaskNumber.get(n) : null;
    if (!provenance) {
      const existingPages = Array.isArray(task?.pages)
        ? task.pages.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
        : [];
      const mergedWarnings = Array.isArray(task?.warnings)
        ? task.warnings.map((w: unknown) => String(w || "")).filter(Boolean)
        : [];
      if (!mergedWarnings.some((w) => /fidelity: source citation missing/i.test(w))) {
        mergedWarnings.push("fidelity: source citation missing (needs review)");
      }
      return {
        ...task,
        warnings: mergedWarnings,
        provenance: {
          taskNumber: n || undefined,
          pages: existingPages,
          sourceAnchor: n > 0 ? `Task ${n}` : "Task",
          sourceSnippet: "UNKNOWN / NEEDS_REVIEW: no source citation was found for this extracted task block.",
          matchScore: 0,
          citationStatus: "NEEDS_REVIEW" as const,
        },
      };
    }
    return {
      ...task,
      provenance: {
        taskNumber: provenance.taskNumber,
        pages: provenance.pages,
        sourceAnchor: provenance.sourceAnchor,
        sourceSnippet:
          provenance.sourceSnippet ||
          (provenance.citationStatus === "NEEDS_REVIEW"
            ? "UNKNOWN / NEEDS_REVIEW: no source citation was found for this extracted task block."
            : ""),
        matchScore: provenance.matchScore,
        citationStatus: provenance.citationStatus || "CITED",
      },
    };
  });

  return {
    ...draftLike,
    tasks,
  };
}
