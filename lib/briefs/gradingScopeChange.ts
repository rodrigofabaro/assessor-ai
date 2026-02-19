export type GradingScopeChangeInput = {
  criterionCode?: unknown;
  excluded?: unknown;
  reason?: unknown;
  confirmLiveChange?: unknown;
};

export type GradingScopeChangeValidation =
  | {
      ok: true;
      criterionCode: string;
      excluded: boolean;
      reason: string;
      confirmLiveChange: boolean;
      previousExcluded: string[];
      nextExcluded: string[];
    }
  | {
      ok: false;
      error: string;
      message: string;
      details?: Record<string, unknown>;
    };

export type GradingScopeChangeLogEntry = {
  criterionCode: string;
  excluded: boolean;
  reason: string;
  at: string;
  actor?: string;
  gradedSubmissionCount?: number;
};

export function normalizeCriterionCode(value: unknown): string | null {
  const raw = String(value || "").trim().toUpperCase();
  const m = raw.match(/^([PMD])\s*(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}${Number(m[2])}`;
}

export function normalizeCriteriaCodeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((v) => normalizeCriterionCode(v))
        .filter(Boolean) as string[]
    )
  ).sort((a, b) => a.localeCompare(b));
}

function toBool(value: unknown) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value || "") === "1";
}

export function validateGradingScopeChangeRequest(
  previousExcludedRaw: unknown,
  nextExcludedRaw: unknown,
  changeRaw: GradingScopeChangeInput | null | undefined
): GradingScopeChangeValidation {
  const previousExcluded = normalizeCriteriaCodeList(previousExcludedRaw);
  const nextExcluded = normalizeCriteriaCodeList(nextExcludedRaw);
  const added = nextExcluded.filter((code) => !previousExcluded.includes(code));
  const removed = previousExcluded.filter((code) => !nextExcluded.includes(code));
  const changedCount = added.length + removed.length;
  if (changedCount !== 1) {
    return {
      ok: false,
      error: "BRIEF_CRITERIA_SCOPE_CHANGE_ONE_AT_A_TIME",
      message: "Change exactly one criterion per request.",
      details: { previousExcluded, nextExcluded, added, removed },
    };
  }

  const inferredCriterionCode = added[0] || removed[0];
  const inferredExcluded = added.length === 1;
  const change = changeRaw && typeof changeRaw === "object" ? changeRaw : {};
  const criterionCode = normalizeCriterionCode((change as any).criterionCode);
  const excluded = toBool((change as any).excluded);
  const reason = String((change as any).reason || "").trim();
  const confirmLiveChange = toBool((change as any).confirmLiveChange);

  if (!criterionCode) {
    return {
      ok: false,
      error: "BRIEF_CRITERIA_SCOPE_CHANGE_REASON_REQUIRED",
      message: "Missing or invalid criterion code for grading scope change.",
      details: { inferredCriterionCode, inferredExcluded },
    };
  }
  if (criterionCode !== inferredCriterionCode || excluded !== inferredExcluded) {
    return {
      ok: false,
      error: "BRIEF_CRITERIA_SCOPE_CHANGE_MISMATCH",
      message: "Requested scope change does not match the exclusions diff.",
      details: {
        inferredCriterionCode,
        inferredExcluded,
        requestedCriterionCode: criterionCode,
        requestedExcluded: excluded,
      },
    };
  }
  if (reason.length < 6) {
    return {
      ok: false,
      error: "BRIEF_CRITERIA_SCOPE_CHANGE_REASON_REQUIRED",
      message: "A short reason (minimum 6 characters) is required.",
      details: { criterionCode, excluded },
    };
  }

  return {
    ok: true,
    criterionCode,
    excluded,
    reason,
    confirmLiveChange,
    previousExcluded,
    nextExcluded,
  };
}

export function applyGradingScopeChangeMeta(args: {
  previousMeta: any;
  change: {
    criterionCode: string;
    excluded: boolean;
    reason: string;
  };
  actor: string;
  atIso?: string;
  gradedSubmissionCount?: number;
}) {
  const previousMeta = args.previousMeta && typeof args.previousMeta === "object" ? args.previousMeta : {};
  const nowIso = args.atIso || new Date().toISOString();
  const previousReasons =
    previousMeta?.gradingCriteriaExclusionReasons && typeof previousMeta.gradingCriteriaExclusionReasons === "object"
      ? { ...previousMeta.gradingCriteriaExclusionReasons }
      : ({} as Record<string, { reason: string; at: string; actor?: string }>);
  if (args.change.excluded) {
    previousReasons[args.change.criterionCode] = {
      reason: args.change.reason,
      at: nowIso,
      actor: args.actor || "system",
    };
  } else {
    delete previousReasons[args.change.criterionCode];
  }

  const prevLog = Array.isArray(previousMeta?.gradingCriteriaExclusionLog)
    ? (previousMeta.gradingCriteriaExclusionLog as GradingScopeChangeLogEntry[])
    : [];
  const nextLog = [
    ...prevLog,
    {
      criterionCode: args.change.criterionCode,
      excluded: args.change.excluded,
      reason: args.change.reason,
      at: nowIso,
      actor: args.actor || "system",
      gradedSubmissionCount: Math.max(0, Math.floor(Number(args.gradedSubmissionCount || 0))),
    },
  ].slice(-120);

  return {
    gradingCriteriaExclusionReasons: previousReasons,
    gradingCriteriaExclusionLog: nextLog,
  };
}
