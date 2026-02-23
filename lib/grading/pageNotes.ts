type EvidenceLike = {
  page?: number | null;
  quote?: string | null;
  visualDescription?: string | null;
};

type CriterionCheckLike = {
  code?: string | null;
  decision?: string | null;
  rationale?: string | null;
  comment?: string | null;
  evidence?: EvidenceLike[] | null;
  met?: boolean | null;
};

type PageCriterionEntry = {
  code: string;
  decision: "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR";
  rationale: string;
  context: string;
};

export type MarkedPageNote = {
  page: number;
  lines: string[];
};

type PageNoteTone = "supportive" | "professional" | "strict";

type PageNoteStyleProfile = {
  focusLabel: string;
  handwritingTip: string;
  maxActionLines: number;
  softenStrengthLine: boolean;
  softenGapLine: boolean;
  softenActionLines: boolean;
  softenCriterionLink: boolean;
};

// House style for student-facing page notes: short, warm, moderation-friendly.
const PAGE_NOTE_STYLES: Record<PageNoteTone, PageNoteStyleProfile> = {
  supportive: {
    focusLabel: "",
    handwritingTip:
      "If handwriting is used, keep the write-up typed and add clear scans/photos so your working is easy to follow.",
    maxActionLines: 1,
    softenStrengthLine: true,
    softenGapLine: true,
    softenActionLines: true,
    softenCriterionLink: true,
  },
  professional: {
    focusLabel: "Criterion",
    handwritingTip:
      "Presentation tip: Type the write-up in a word-processed document and insert clear scans/photos of handwritten maths.",
    maxActionLines: 2,
    softenStrengthLine: false,
    softenGapLine: false,
    softenActionLines: false,
    softenCriterionLink: false,
  },
  strict: {
    focusLabel: "Criterion",
    handwritingTip: "Presentation: ensure handwriting scans are clear, readable, and placed next to the relevant explanation.",
    maxActionLines: 2,
    softenStrengthLine: false,
    softenGapLine: false,
    softenActionLines: false,
    softenCriterionLink: false,
  },
};

function resolvePageNoteStyle(tone: unknown): PageNoteStyleProfile {
  const key = String(tone || "").trim().toLowerCase();
  if (key === "professional" || key === "strict" || key === "supportive") return PAGE_NOTE_STYLES[key];
  return PAGE_NOTE_STYLES.supportive;
}

function normalizeText(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function sanitizeStudentNoteText(v: string) {
  return normalizeText(v)
    .replace(/\bguard adjusted\b[^.?!]*[.?!]?/gi, "")
    .replace(/\bdecision guard applied\b[^.?!]*[.?!]?/gi, "")
    .replace(/\brationale indicates evidence gaps\b[^.?!]*[.?!]?/gi, "")
    .replace(/\btype\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\benter\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\badd\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\binsert\s+text\b/gi, "")
    .replace(/\bclick\s+to\s+add\s+text\b/gi, "")
    .replace(/\(\s*\.{2,}\s*\)/g, "")
    .replace(/\.{3,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function compactLine(v: string, maxLen = 170) {
  const s = sanitizeStudentNoteText(v);
  if (!s) return "";
  if (s.length <= maxLen) return s;
  const clippedRaw = s.slice(0, Math.max(24, maxLen));
  const sentenceStop = Math.max(clippedRaw.lastIndexOf(". "), clippedRaw.lastIndexOf("! "), clippedRaw.lastIndexOf("? "));
  if (sentenceStop > Math.floor(maxLen * 0.55)) {
    return clippedRaw.slice(0, sentenceStop + 1).trim();
  }
  return clippedRaw.replace(/\s+\S*$/, "").replace(/[,(;:\s-]+$/, "").trim();
}

function toSentence(v: string) {
  const s = sanitizeStudentNoteText(v);
  if (!s) return "";
  if (/[.!?]$/.test(s)) return s;
  return `${s}.`;
}

function normalizeDecisionLabel(value: unknown, metFallback: unknown): "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR" {
  const up = String(value || "").trim().toUpperCase();
  if (up === "ACHIEVED" || up === "NOT_ACHIEVED" || up === "UNCLEAR") return up;
  if (typeof metFallback === "boolean") return metFallback ? "ACHIEVED" : "NOT_ACHIEVED";
  return "UNCLEAR";
}

function normalizeCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  if (/^[PMD]\d{1,2}$/.test(code)) return code;
  return "CRITERION";
}

function evidenceContext(row: CriterionCheckLike) {
  const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
  const source = evidence
    .map((e) => `${String(e?.quote || "")} ${String(e?.visualDescription || "")}`)
    .join(" ");
  return sanitizeStudentNoteText(source);
}

function summarizeReason(v: string) {
  const src = sanitizeStudentNoteText(v)
    .replace(/\b(the\s+)?criterion\b/gi, "requirement")
    .replace(/\bthis\s+criterion\b/gi, "this requirement")
    .replace(/\bclear(er)?\s+evidence\b/gi, "specific evidence")
    .replace(/\bthe\s+(submission|report|work)\b/gi, "your work");
  if (!src) return "";
  const firstSentence = src.split(/[.!?]/)[0] || src;
  return compactLine(firstSentence, 130);
}

function decisionPriority(decision: string) {
  if (decision === "NOT_ACHIEVED") return 0;
  if (decision === "UNCLEAR") return 1;
  return 2;
}

function strengthLine(entry: PageCriterionEntry) {
  const code = entry.code;
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();

  if (code === "P6") {
    if (/\bphasor|rl|triangle\b/i.test(corpus)) return "Strength: Correct phasor triangle method is shown.";
    if (/\bsin|cos|current|time|wave\b/i.test(corpus)) return "Strength: Your sinusoidal rearrangement steps are clear.";
    return "Strength: Your pass-level sinusoidal method is clear.";
  }
  if (code === "P7") {
    if (/\bdeterminant|cross product\b/i.test(corpus)) return "Strength: Good determinant setup for vector method.";
    if (/\bcomponent|horizontal|vertical|cos|sin\b/i.test(corpus))
      return "Strength: Correct method is shown for resolving vector components.";
    return "Strength: Your vector method is presented clearly.";
  }
  if (code === "M3") {
    if (/\bgraph|plot|waveform|overlay|figure\b/i.test(corpus))
      return "Strength: You show the combine-wave method with graphical evidence.";
    return "Strength: Your compound-angle/single-wave method is clear.";
  }
  if (code === "D2") {
    if (/\bsoftware|geogebra|desmos|graph|plot|screenshot\b/i.test(corpus))
      return "Good start here: you included software output alongside your calculations.";
    return "Good start here: you attempted software-based confirmation.";
  }
  if (code === "D1") {
    if (/\bcompare|evaluation|efficien|performance|cost|reliab|trade[- ]off\b/i.test(corpus)) {
      return "Strength: Your evidence is clear for this requirement.";
    }
    return "Strength: Your evidence is clear for this requirement.";
  }
  return entry.decision === "ACHIEVED"
    ? "Strength: Your evidence is clear for this requirement."
    : "Strength: Your evidence is clear for this requirement.";
}

function gapLine(entry: PageCriterionEntry) {
  const code = entry.code;
  const rationale = summarizeReason(entry.rationale);
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();

  if (code === "D2" && entry.decision !== "ACHIEVED") {
    return "Next step: make the software-to-calculation confirmation explicit across at least three distinct problems.";
  }
  if (code === "D1" && entry.decision !== "ACHIEVED") {
    return "Next step: move from description to critical evaluation by judging one specific renewable energy system using clear performance criteria.";
  }
  if (code === "P7" && /\bmagnitude|component|horizontal|vertical\b/i.test(corpus)) {
    return "Next step: present magnitudes as positive values and note direction separately.";
  }
  if (code === "M3" && entry.decision !== "ACHIEVED") {
    return "Next step: make the link between the graph and your analytical combined-wave result more explicit.";
  }
  if (entry.decision === "ACHIEVED") {
    return "Improvement: Add one short verification line right after your final result (e.g. quick units/sense-check) so it is easy to confirm.";
  }
  if (rationale) {
    return `Improvement: ${rationale}`;
  }
  return "Improvement: Add one sentence that explicitly connects your evidence to the criterion.";
}

function visualPresentationLine(entry: PageCriterionEntry) {
  const corpus = `${entry.context} ${entry.rationale}`;
  const hasVisualEvidence =
    /\b(image|figure|diagram|chart|graph|plot|waveform|screenshot|photo|table|sketch)\b/i.test(corpus);
  if (!hasVisualEvidence) return "";

  const hasLabels =
    /\b(label|labelled|caption|axis|axes|marker|cursor|annotation|annotated|legend|key|title)\b/i.test(corpus);
  if (!hasLabels) {
    return "If you use images or charts here, add labels/captions so the evidence is quick to verify.";
  }
  return "Your visual evidence helps here; keep labels/captions clear and reference the exact figure or page in your explanation.";
}

function visualDevelopmentSuggestionLine(entry: PageCriterionEntry) {
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();
  const hasVisualEvidence =
    /\b(image|figure|diagram|chart|graph|plot|waveform|screenshot|photo|table|sketch)\b/i.test(corpus);
  if (hasVisualEvidence) return "";

  const likelyBenefitsFromVisual =
    entry.decision !== "ACHIEVED" ||
    /\b(compare|explain|process|method|system|layout|design|flow|performance|evaluation|analysis|relationship)\b/i.test(corpus);
  if (!likelyBenefitsFromVisual) return "";

  return "A simple labelled sketch/diagram/table could help you develop the idea further and make your explanation easier to follow.";
}

function actionLines(entry: PageCriterionEntry): string[] {
  const code = entry.code;
  if (code === "D1") {
    return [
      "Choose one system (for example wind or solar PV) and evaluate it using criteria such as efficiency, reliability, cost, output variability, and maintenance.",
      "Add one sentence that states your judgement clearly and explains why the evidence supports D1.",
      "A comparison table or labelled diagram could strengthen the evaluation and make your reasoning easier to follow.",
    ];
  }
  if (code === "D2") {
    return [
      "Add a one-line confirmation linking software output to your analytical value.",
      "Add label/cursor/marker values and reference the exact graph/figure/page used as evidence.",
      "Show this confirmation across at least three distinct problems.",
    ];
  }
  if (code === "M3") {
    return [
      "Overlay or compare plots so equivalence is visible.",
      "Label axes/markers and point to the exact figure/page used in your explanation.",
      "Add one sentence explaining how the graph supports your analytical form.",
    ];
  }
  if (code === "P7") {
    return [
      "State magnitudes explicitly using absolute values.",
      "Show direction separately and label final components clearly.",
      "State units and use consistent rounding in your final line.",
    ];
  }
  if (code === "P6") {
    return [
      "Show your branch/selection logic clearly before the final answer.",
      "Add one quick substitution check against the original expression.",
      "State units and use consistent rounding in your final line.",
    ];
  }
  return [
    "Link: Add one sentence that explicitly connects your evidence to the criterion.",
    "Presentation: Label your final result so the method used is easy to verify.",
    "Presentation: Label your final result so the method used is easy to verify.",
  ];
}

function bandImpactLine(entry: PageCriterionEntry) {
  if (entry.code === "D2" && entry.decision !== "ACHIEVED") {
    return "This is why D2 is not fully evidenced yet.";
  }
  return `This supports: ${entry.code}.`;
}

function softenSupportiveStrengthLine(value: string) {
  const src = String(value || "").trim();
  if (!src) return "";
  let s = src.replace(/^Strength:\s*/i, "");
  s = s
    .replace(/^Good start here:\s*you included\b/i, "You have done well here by including")
    .replace(/^Good start here:\s*you attempted\b/i, "You have made a good start here by attempting")
    .replace(/^Good start here:\s*/i, "You have done well here. ")
    .replace(/^Correct\b/i, "You have used the correct")
    .replace(/^Good\b/i, "You have shown good")
    .replace(/^Your\b/i, "Your");
  return s;
}

function softenSupportiveGapLine(value: string) {
  const src = String(value || "").trim();
  if (!src) return "";
  const s = src
    .replace(/^Next step:\s*/i, "")
    .replace(/^For moderation,\s*/i, "For moderation, ")
    .replace(/^To improve:\s*/i, "")
    .replace(/^To improve for moderation:\s*/i, "For moderation, ");
  if (/^For moderation,/i.test(s)) return s;
  if (/^move from description to critical evaluation\b/i.test(s)) {
    return `To push this further, ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  }
  if (/^make the\b/i.test(s) || /^link the\b/i.test(s) || /^present\b/i.test(s) || /^add\b/i.test(s)) {
    return `To improve this, ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  }
  return `To strengthen this, ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

function softenSupportiveActionLine(value: string) {
  const src = String(value || "").trim();
  if (!src) return "";
  const s = src
    .replace(/^Action:\s*/i, "")
    .replace(/^Moderation:\s*/i, "For moderation, ")
    .replace(/^Presentation:\s*/i, "Presentation-wise, ")
    .replace(/^Check:\s*/i, "As a quick check, ")
    .replace(/^Coverage:\s*/i, "To fully evidence this, ");
  if (/^For moderation,/i.test(s) || /^Presentation-wise,/i.test(s) || /^As a quick check,/i.test(s)) return s;
  if (/^Add\b/i.test(s)) return s;
  if (/^Show\b/i.test(s) || /^Label\b/i.test(s) || /^Choose\b/i.test(s) || /^Point\b/i.test(s)) return s;
  return s;
}

function buildStructuredNoteLines(input: {
  entry: PageCriterionEntry;
  includeCode: boolean;
  handwritingLikely: boolean;
  tone: PageNoteTone;
}) {
  const { entry, includeCode, handwritingLikely, tone } = input;
  const style = resolvePageNoteStyle(tone);
  const lines: string[] = [];
  if (includeCode && entry.code !== "CRITERION" && style.focusLabel) {
    lines.push(compactLine(`${style.focusLabel}: ${entry.code}`, 80));
  }
  let strength = strengthLine(entry);
  if (style.softenStrengthLine) {
    strength = softenSupportiveStrengthLine(strength);
  }
  lines.push(compactLine(toSentence(strength), 185));
  let gap = gapLine(entry);
  if (style.softenGapLine) {
    gap = softenSupportiveGapLine(gap);
  }
  lines.push(compactLine(toSentence(gap), 195));
  const actions = actionLines(entry).slice(0, style.maxActionLines);
  for (const action of actions) {
    const line = style.softenActionLines ? softenSupportiveActionLine(action) : action;
    lines.push(compactLine(toSentence(line), 195));
  }
  const visualLine = visualPresentationLine(entry) || visualDevelopmentSuggestionLine(entry);
  if (visualLine) {
    lines.push(compactLine(toSentence(visualLine), 195));
  }
  if (handwritingLikely) {
    lines.push(compactLine(style.handwritingTip, 195));
  }
  let criterionLink = bandImpactLine(entry);
  if (style.softenCriterionLink) {
    criterionLink = criterionLink
      .replace(/^This supports\s+/i, "This helps evidence ")
      .replace(/^This is why\s+/i, "This is why ")
      .replace(/\.$/, "");
  }
  lines.push(compactLine(toSentence(criterionLink), 165));
  return lines.filter(Boolean);
}

function collectPageEntries(rows: CriterionCheckLike[], minPage: number) {
  const byPage = new Map<number, Map<string, PageCriterionEntry>>();
  for (const row of rows) {
    const evidenceRows = Array.isArray(row?.evidence) ? row.evidence : [];
    const code = normalizeCode(row?.code);
    const decision = normalizeDecisionLabel(row?.decision, row?.met);
    const rationale = sanitizeStudentNoteText(String(row?.rationale || row?.comment || ""));
    const context = evidenceContext(row);
    for (const ev of evidenceRows) {
      const page = Number(ev?.page || 0);
      if (!Number.isInteger(page) || page < minPage) continue;
      if (!byPage.has(page)) byPage.set(page, new Map<string, PageCriterionEntry>());
      const pageMap = byPage.get(page)!;
      const existing = pageMap.get(code);
      if (!existing) {
        pageMap.set(code, { code, decision, rationale, context });
        continue;
      }
      // Keep the strictest decision for this page/code and enrich rationale/context.
      if (decisionPriority(decision) < decisionPriority(existing.decision)) {
        existing.decision = decision;
      }
      if (!existing.rationale && rationale) existing.rationale = rationale;
      if (!existing.context && context) existing.context = context;
      pageMap.set(code, existing);
    }
  }
  return byPage;
}

function selectPrimaryEntry(entries: PageCriterionEntry[]) {
  const sorted = [...entries].sort((a, b) => {
    const diff = decisionPriority(a.decision) - decisionPriority(b.decision);
    if (diff !== 0) return diff;
    return a.code.localeCompare(b.code);
  });
  return sorted[0] || null;
}

export function extractCriterionChecksFromResultJson(resultJson: any): CriterionCheckLike[] {
  const r = resultJson && typeof resultJson === "object" ? resultJson : {};
  const fromResponse = Array.isArray(r?.response?.criterionChecks) ? r.response.criterionChecks : null;
  const fromStructured = Array.isArray(r?.structuredGradingV2?.criterionChecks) ? r.structuredGradingV2.criterionChecks : null;
  const rows = fromResponse || fromStructured || [];
  return Array.isArray(rows) ? rows : [];
}

export function buildPageNotesFromCriterionChecks(
  rows: CriterionCheckLike[],
  options?: {
    maxPages?: number;
    maxLinesPerPage?: number;
    tone?: "supportive" | "professional" | "strict";
    includeCriterionCode?: boolean;
    minPage?: number;
    totalPages?: number;
    handwritingLikely?: boolean;
  }
): MarkedPageNote[] {
  const configuredMaxPages = Math.max(1, Math.min(20, Number(options?.maxPages || 6)));
  const totalPages = Math.max(0, Math.min(500, Number(options?.totalPages || 0)));
  const adaptiveMaxPages =
    totalPages >= 45
      ? Math.max(configuredMaxPages, 12)
      : totalPages >= 30
        ? Math.max(configuredMaxPages, 9)
        : totalPages >= 20
          ? Math.max(configuredMaxPages, 7)
          : configuredMaxPages;
  const maxPages = Math.max(1, Math.min(20, adaptiveMaxPages));
  const minPage = Math.max(1, Math.min(20, Number(options?.minPage || 1)));
  const includeCode = options?.includeCriterionCode !== false;
  const tone = (String(options?.tone || "supportive").toLowerCase() as PageNoteTone);
  const handwritingLikely = Boolean(options?.handwritingLikely);
  const rowsNormalized = Array.isArray(rows) ? rows : [];
  const sourceRows = rowsNormalized.filter((row) =>
    (Array.isArray(row?.evidence) ? row.evidence : []).some((e) => Number(e?.page || 0) > 0)
  );
  const byPage = collectPageEntries(sourceRows, minPage);
  const allPages = Array.from(byPage.keys()).sort((a, b) => a - b);
  if (!allPages.length) return [];

  const criticalPages = allPages.filter((page) =>
    Array.from(byPage.get(page)?.values() || []).some((entry) => entry.decision !== "ACHIEVED")
  );
  const selected = new Set<number>();
  for (const page of criticalPages) {
    selected.add(page);
    if (selected.size >= maxPages) break;
  }
  if (selected.size < maxPages) {
    const remaining = allPages.filter((p) => !selected.has(p));
    const needed = maxPages - selected.size;
    if (remaining.length <= needed) {
      for (const page of remaining) selected.add(page);
    } else if (needed === 1) {
      selected.add(remaining[Math.floor(remaining.length / 2)]);
    } else {
      for (let i = 0; i < needed; i += 1) {
        const idx = Math.round((i * (remaining.length - 1)) / (needed - 1));
        selected.add(remaining[idx]);
      }
    }
  }

  const maxLinesPerPage = Math.max(6, Math.min(12, Number(options?.maxLinesPerPage || 8)));

  return Array.from(selected.values())
    .sort((a, b) => a - b)
    .map((page) => {
      const entries = Array.from(byPage.get(page)?.values() || []);
      const primary = selectPrimaryEntry(entries);
      if (!primary) return { page, lines: [] };
      const lines = buildStructuredNoteLines({
        entry: primary,
        includeCode,
        handwritingLikely,
        tone: tone === "professional" || tone === "strict" ? tone : "supportive",
      }).slice(0, maxLinesPerPage);
      return { page, lines };
    })
    .filter((note) => note.lines.length > 0);
}
