function normalizeText(text: string) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function cleanBlankRuns(text: string) {
  return String(text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeUnitArtifacts(text: string) {
  return normalizeText(text)
    .replace(/∘\s*(?:\n\s*)?퐶\s*(?:\n\s*)?퐶/g, "°C")
    .replace(/°\s*(?:\n\s*)?퐶\s*(?:\n\s*)?퐶/g, "°C")
    .replace(/∘\s*(?:\n\s*)?C\s*(?:\n\s*)?C/gi, "°C")
    .replace(/°\s*(?:\n\s*)?C\s*(?:\n\s*)?C/gi, "°C")
    // Common OCR split for Celsius: "100 ∘ 퐶퐶" / "100 ° CC" / line-broken variants
    .replace(/([0-9])\s*(?:\n\s*)?[∘°]\s*(?:\n\s*)?(?:퐶퐶|퐶\s*퐶|C\s*C|C{2,})\b/g, "$1 °C")
    .replace(/([0-9])\s*(?:\n\s*)?퐶퐶\b/g, "$1 °C")
    .replace(/([0-9])\s*[∘°]\s*(?:\n\s*)?C\b/g, "$1 °C");
}

function isFailureTablePart(text: string) {
  const src = normalizeUnitArtifacts(text);
  const hasHeader = /\bfailure reason\b/i.test(src) && /\bnumber of chips\b/i.test(src);
  if (!hasHeader) return false;
  const rowCount = (src.match(/^(overheating|voltage performance|unacceptable noise|radiation tolerance)\s+\d+\s*$/gim) || []).length;
  if (rowCount >= 2) return true;
  if (/Recovered chart data \(from uploaded image\):/i.test(src)) return false;
  return true;
}

function stripFailureTableEquationTokens(text: string) {
  return normalizeUnitArtifacts(text).replace(/\[\[EQ:[^\]]+\]\]/g, "");
}

function stripFailureTableLeakageFromNonFailurePart(text: string) {
  const lines = normalizeUnitArtifacts(text).split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const s = String(line || "").trim();
    if (!s) {
      kept.push(line);
      continue;
    }
    if (/^failure reason\s+number of chips$/i.test(s)) continue;
    if (/^(overheating|voltage performance|unacceptable noise|radiation tolerance)\s+\d+$/i.test(s)) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

function parseRecoveredChartRows(blockText: string) {
  const lines = normalizeUnitArtifacts(blockText).split("\n");
  const rows: Array<{ label: string; value: number }> = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const m = clean.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)\s*%?\s*$/);
    if (!m) continue;
    const label = String(m[1] || "").trim().replace(/[:\-]+$/g, "").trim();
    const value = Number(m[2]);
    if (!label || !Number.isFinite(value)) continue;
    const key = `${label.toLowerCase()}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ label, value });
  }
  return rows;
}

function normalizeRecoveredChartBlock(text: string) {
  const src = normalizeUnitArtifacts(text);
  const marker = /Recovered chart data \(from uploaded image\):/i;
  const m = src.match(marker);
  if (!m || typeof m.index !== "number") return src;

  const start = m.index;
  const markerText = m[0];
  const before = src.slice(0, start).trimEnd();
  const after = src.slice(start + markerText.length);
  const rows = parseRecoveredChartRows(after);

  if (rows.length < 2) return cleanBlankRuns(before);

  const rebuiltRows = rows.map((r) => `${r.label} ${Number.isInteger(r.value) ? r.value : r.value.toFixed(2).replace(/\.00$/, "")}`);
  const rebuilt = `${markerText}\n\n${rebuiltRows.join("\n\n")}`;
  return cleanBlankRuns(before ? `${before}\n\n${rebuilt}` : rebuilt);
}

function sanitizePartText(text: string) {
  const src = normalizeUnitArtifacts(text);
  const isFailure = isFailureTablePart(src);

  let next = src;
  if (isFailure) {
    next = stripFailureTableEquationTokens(next);
    next = next.replace(/Recovered chart data \(from uploaded image\):[\s\S]*$/i, "");
  } else {
    next = stripFailureTableLeakageFromNonFailurePart(next);
  }
  next = normalizeRecoveredChartBlock(next);
  return cleanBlankRuns(next);
}

function stripStandaloneFalseEquationTokenLines(
  text: string,
  removableEqIds: Set<string>
) {
  if (!removableEqIds.size) return cleanBlankRuns(normalizeText(text));
  const lines = normalizeUnitArtifacts(text).split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    const m = trimmed.match(/^\[\[EQ:([^\]]+)\]\]$/);
    if (m && removableEqIds.has(String(m[1] || ""))) continue;
    kept.push(line);
  }
  return cleanBlankRuns(kept.join("\n"));
}

function collectReferencedEquationIdsFromBriefLike(value: any) {
  const ids = new Set<string>();
  const scan = (src: unknown) => {
    const text = String(src || "");
    const re = /\[\[EQ:([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[1]) ids.add(String(m[1]));
    }
  };
  const scenarios = Array.isArray(value?.scenarios) ? value.scenarios : [];
  for (const s of scenarios) scan(s?.text);
  const tasks = Array.isArray(value?.tasks) ? value.tasks : [];
  for (const t of tasks) {
    scan(t?.text);
    scan(t?.prompt);
    scan(t?.scenarioText);
    if (Array.isArray(t?.parts)) for (const p of t.parts) scan(p?.text);
  }
  return ids;
}

function collectBriefValidationWarnings(draftLike: any) {
  const warnings = new Set<string>();
  const tasks = Array.isArray(draftLike?.tasks) ? draftLike.tasks : [];

  if (tasks.length === 0) warnings.add("validation: no tasks extracted");

  const scenarios = Array.isArray(draftLike?.scenarios) ? draftLike.scenarios : [];
  const scenarioTaskIds = new Set<number>(
    scenarios.map((s: any) => Number(s?.appliesToTask)).filter((n: number) => Number.isInteger(n) && n > 0)
  );

  for (const task of tasks) {
    const n = Number(task?.n || 0);
    const parts = Array.isArray(task?.parts) ? task.parts : [];
    if (parts.length > 0) {
      const seen = new Set<string>();
      for (const p of parts) {
        const key = String(p?.key || "").trim().toLowerCase();
        if (!key) continue;
        if (seen.has(key)) {
          warnings.add(`validation: duplicate part key in Task ${n} (${key})`);
        }
        seen.add(key);
      }
    }

    const taskText = String(task?.text || "");
    const partsText = parts.map((p: any) => String(p?.text || "")).join("\n");
    const joined = `${taskText}\n${partsText}`;
    if (/\bfigure\s*\d+\b/i.test(joined) && !/\[\[IMG:[^\]]+\]\]/.test(joined)) {
      warnings.add(`validation: figure reference without image token in Task ${n}`);
    }
    if (/[∘°]\s*(?:\n\s*)?(?:퐶퐶|C\s*C|C{2,})\b/.test(joined)) {
      warnings.add(`validation: unresolved Celsius symbol artifacts in Task ${n}`);
    }

    if (n > 0 && !scenarioTaskIds.has(n)) {
      warnings.add(`validation: missing scenario mapping for Task ${n}`);
    }
  }

  return Array.from(warnings);
}

export function sanitizeBriefDraftArtifacts(draft: any) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return draft;
  if (String(draft?.kind || "").toUpperCase() !== "BRIEF") return draft;

  const tasks = Array.isArray(draft.tasks) ? draft.tasks : [];
  const scenarios = Array.isArray(draft.scenarios) ? draft.scenarios : [];
  const equations = Array.isArray(draft.equations) ? draft.equations : [];

  const removableEqIds = new Set<string>();
  for (const eq of equations) {
    const id = String(eq?.id || "");
    if (!id) continue;
    const latex = String(eq?.latex || "").trim();
    const confidence = Number(eq?.confidence);
    const needsReview = eq?.needsReview === true;
    if (!latex && needsReview && Number.isFinite(confidence) && confidence <= 0.25) {
      removableEqIds.add(id);
    }
  }

  const nextTasks = tasks.map((task: any) => {
    if (!task || typeof task !== "object") return task;
    const nextTask = { ...task };
    if (typeof nextTask.text === "string") {
      nextTask.text = stripStandaloneFalseEquationTokenLines(sanitizePartText(nextTask.text), removableEqIds);
    }
    if (typeof nextTask.prompt === "string") {
      nextTask.prompt = stripStandaloneFalseEquationTokenLines(sanitizePartText(nextTask.prompt), removableEqIds);
    }
    if (typeof nextTask.scenarioText === "string") {
      nextTask.scenarioText = stripStandaloneFalseEquationTokenLines(nextTask.scenarioText, removableEqIds);
    }
    if (Array.isArray(nextTask.parts)) {
      nextTask.parts = nextTask.parts.map((part: any) => {
        if (!part || typeof part !== "object") return part;
        if (typeof part.text !== "string") return part;
        return { ...part, text: stripStandaloneFalseEquationTokenLines(sanitizePartText(part.text), removableEqIds) };
      });
    }
    return nextTask;
  });

  const nextScenarios = scenarios.map((s: any) => {
    if (!s || typeof s !== "object") return s;
    if (typeof s.text !== "string") return s;
    return { ...s, text: stripStandaloneFalseEquationTokenLines(s.text, removableEqIds) };
  });

  const draftLike = { ...draft, tasks: nextTasks, scenarios: nextScenarios };
  const referencedIds = collectReferencedEquationIdsFromBriefLike(draftLike);
  const nextEquations = equations.filter((eq: any) => referencedIds.has(String(eq?.id || "")));
  const validationWarnings = collectBriefValidationWarnings(draftLike);
  const mergedWarnings = Array.from(
    new Set([...(Array.isArray(draftLike?.warnings) ? draftLike.warnings : []), ...validationWarnings])
  );

  return { ...draftLike, equations: nextEquations, warnings: mergedWarnings };
}
