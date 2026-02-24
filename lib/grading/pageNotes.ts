import {
  criterionAllowedInResolvedSection,
  resolvePageNoteBannedKeywords,
  resolvePageNoteSectionForCriterion,
  type PageNoteGenerationContext,
  type PageNoteItemKind,
  type PageNoteSeverity,
} from "@/lib/grading/pageNoteSectionMaps";

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
  page: number;
};

export type MarkedPageNote = {
  page: number;
  lines: string[];
  items?: Array<{ kind: PageNoteItemKind; text: string }>;
  criterionCode?: string;
  showCriterionCodeInTitle?: boolean;
  sectionId?: string | null;
  sectionLabel?: string | null;
  severity?: PageNoteSeverity;
};

type PageNoteItem = { kind: PageNoteItemKind; text: string };
const NOTE_WORD_BUDGET_MAX = 95;

const GLOBAL_TEMPLATE_LEAK_TERMS = [
  "solar",
  "pv",
  "wind",
  "hydro",
  "geothermal",
  "renewable",
  "lcoe",
  "converter",
  "power converter",
  "smart grid",
  "simulink",
  "matlab",
  "energy efficiency",
];

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

function stripLegacyPageNotePrefixes(value: string) {
  return String(value || "")
    .replace(/^\s*(Strength|Improvement|Link|Presentation)\s*:\s*/i, "")
    .replace(/^\s*This supports\s*:\s*/i, "")
    .trim();
}

function hasIncompleteAdviceCue(value: string) {
  const s = sanitizeStudentNoteText(value).toLowerCase();
  if (!s) return false;
  if (!/\b(add (?:one )?(?:short )?(?:line|sentence)|link to (?:the )?(?:criterion|requirement)|map criteria|connect.*criterion)\b/i.test(s)) {
    return false;
  }
  const hasWhat = /\b(what|evidence|method|result|output|figure|table|calculation|judgement|comparison|prove|shows?)\b/i.test(s);
  const hasWhere = /\b(where|end of|finish the section|final paragraph|under the result|under the figure|in this section|in-text)\b/i.test(s);
  const hasHow = /\b(for example|e\.g\.|state|include|say|using|format|structure)\b/i.test(s);
  return !(hasWhat && hasWhere && hasHow);
}

function expandIncompleteAdvice(value: string) {
  const s = sanitizeStudentNoteText(value);
  if (!s) return "";
  if (!hasIncompleteAdviceCue(s)) return s;
  return "Finish this section with one short sentence that states what evidence you used, what you did, and why it meets the requirement (place it at the end of the paragraph or directly under the result/figure).";
}

export function pageNoteTextHasIncompleteAdvice(value: string) {
  return hasIncompleteAdviceCue(value);
}

export function repairPageNoteTextAdvice(value: string) {
  return expandIncompleteAdvice(value);
}

function applyNoteWordBudget(items: PageNoteItem[], maxWords = NOTE_WORD_BUDGET_MAX) {
  const out: PageNoteItem[] = [];
  let used = 0;
  for (const item of items) {
    const text = sanitizeStudentNoteText(item.text);
    if (!text) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (used + words.length <= maxWords) {
      out.push({ ...item, text });
      used += words.length;
      continue;
    }
    const remaining = maxWords - used;
    if (remaining < 10) break;
    const clipped = compactLine(words.slice(0, remaining).join(" "), 320);
    if (clipped) {
      out.push({ ...item, text: clipped });
      used = maxWords;
    }
    break;
  }
  return out;
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

function hasSpecificEvidenceSignal(entry: PageCriterionEntry) {
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();
  if (!corpus.trim()) return false;
  return (
    /\b(gantt|milestone|critical path|cpm|risk register|decision matrix|budget|cash flow|timeline|tracking|progress)\b/i.test(corpus) ||
    /\b(graph|plot|waveform|figure|chart|table|diagram|screenshot|photo|overlay|axis|marker|cursor)\b/i.test(corpus) ||
    /\b(legislation|legal|ethic|gdpr|health and safety|copyright|regulation)\b/i.test(corpus) ||
    /\b(evaluate|evaluation|recommendation|reflection|trade[- ]off|judgement|conclusion|compare)\b/i.test(corpus) ||
    /\b(equation|formula|calculation|working|units|substitution|magnitude|component|vector|phasor)\b/i.test(corpus)
  );
}

function hasProjectMonitoringSignals(corpus: string) {
  return /\b(gantt|milestone|critical path|cpm|rag(?:\s+status)?|tracker|tracking|project plan|project planning|schedule|scheduling)\b/i.test(
    corpus || ""
  );
}

function hasProjectSelectionSignals(corpus: string) {
  return /\b(aim|objective|rationale|project selection|scope)\b/i.test(corpus || "");
}

function hasEvaluationSignals(corpus: string) {
  return /\b(compare|comparison|evaluation|evaluate|efficien|performance|cost|reliab|trade[- ]off|judgement|recommendation)\b/i.test(
    corpus || ""
  );
}

function hasMathsMethodSignals(corpus: string) {
  return /\b(sin|cos|tan|phasor|vector|determinant|equation|formula|magnitude|component|current|voltage|frequency|wave(?:form)?|rl)\b/i.test(
    corpus || ""
  );
}

function hasSoftwareConfirmationSignals(corpus: string) {
  return /\b(software|geogebra|desmos|graph|plot|screenshot|cursor|marker|overlay)\b/i.test(corpus || "") &&
    /\b(calculation|analytical|equation|value|result|confirmation|compare|comparison)\b/i.test(corpus || "");
}

function extractObservedEvidenceLine(entry: PageCriterionEntry) {
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();
  if (!corpus.trim()) return "";
  const code = String(entry.code || "").toUpperCase();
  if (/\bgantt\b/i.test(corpus)) return "You have shown milestone scheduling using a Gantt chart on this page.";
  if (/\bcritical path|cpm\b/i.test(corpus)) return "You have included critical path / CPM evidence here.";
  if (/\brisk register\b/i.test(corpus)) return "You have included a risk register / risk tracking evidence here.";
  if (/\bdecision matrix\b/i.test(corpus)) return "You have included a decision matrix to support your choice here.";
  if (
    /\blegislation|legal|ethic|gdpr|health and safety|regulation\b/i.test(corpus) &&
    (code === "D1" ||
      !/\b(gantt|milestone|critical path|cpm|tracking|monitor|pugh|matrix|timeline|project plan|project planning|schedule)\b/i.test(corpus))
  )
    return "You have included relevant legislation/ethical considerations here.";
  if (/\bgraph|plot|waveform|overlay\b/i.test(corpus)) return "You have included graphical evidence here to support your explanation.";
  if (/\btable\b/i.test(corpus)) return "You have included a table that supports this part of the evidence.";
  if (/\bdiagram|figure|screenshot|photo\b/i.test(corpus)) return "You have included visual evidence here to support the point.";
  if (/\bevaluate|evaluation|recommendation|reflection|trade[- ]off|judgement\b/i.test(corpus))
    return "You have started to evaluate your work here, rather than only describing it.";
  if (/\bequation|formula|calculation|working\b/i.test(corpus)) return "You have shown the method/working clearly on this page.";
  if (/\bvector|phasor|magnitude|component\b/i.test(corpus)) return "You have shown the correct method steps clearly here.";
  return "";
}

function isGenericStrengthText(value: string) {
  const s = sanitizeStudentNoteText(value).toLowerCase();
  return (
    s === "you have clear evidence here for this requirement." ||
    s === "you have relevant evidence here for this requirement." ||
    s === "you have started to evidence this requirement on this page." ||
    s === "you have relevant evaluative evidence here for this requirement."
  );
}

function isLowValueImprovementText(value: string) {
  const s = sanitizeStudentNoteText(value).toLowerCase();
  return (
    !s ||
    s === "add one sentence that explains exactly how this evidence meets the requirement." ||
    s.includes("a short verification line after the final result would make this even easier to confirm")
  );
}

function isLowValuePageNoteText(value: string) {
  const s = sanitizeStudentNoteText(value).toLowerCase();
  if (!s) return true;
  if (s.length < 30) return true;
  if (
    /^you have (?:clear|relevant) evidence here for this requirement\./i.test(s) ||
    /^clarify how this page evidence meets the requirement/i.test(s)
  ) {
    return true;
  }
  if (
    /^you have relevant evidence here for this requirement\.\s*a short verification line after the final result/i.test(s)
  ) {
    return true;
  }
  return false;
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
    if (/\bphasor|rl|triangle\b/i.test(corpus)) return "You show the correct phasor triangle method here.";
    if (/\bsin|cos|current|time|wave\b/i.test(corpus)) return "Your sinusoidal rearrangement steps are clear here.";
    if (hasMathsMethodSignals(corpus)) return "Your pass-level sinusoidal method is clear on this page.";
    return extractObservedEvidenceLine(entry) || "";
  }
  if (code === "P7") {
    if (/\bdeterminant|cross product\b/i.test(corpus)) return "You set up the determinant method clearly here.";
    if (/\bcomponent|horizontal|vertical|cos|sin\b/i.test(corpus))
      return "You use the correct method for resolving vector components here.";
    if (hasMathsMethodSignals(corpus)) return "Your vector method is presented clearly on this page.";
    return extractObservedEvidenceLine(entry) || "";
  }
  if (code === "M3") {
    if (/\bgraph|plot|waveform|overlay|figure\b/i.test(corpus))
      return "You show the combined-wave method with useful graphical evidence here.";
    if (hasMathsMethodSignals(corpus)) return "Your compound-angle/single-wave method is clear here.";
    return extractObservedEvidenceLine(entry) || "";
  }
  if (code === "D2") {
    if (/\bsoftware|geogebra|desmos|graph|plot|screenshot\b/i.test(corpus))
      return "Good start here: you included software output alongside your calculations.";
    if (hasSoftwareConfirmationSignals(corpus) || hasMathsMethodSignals(corpus))
      return "Good start here: you attempted software-based confirmation.";
    return extractObservedEvidenceLine(entry) || "";
  }
  if (code === "D1") {
    if (hasEvaluationSignals(corpus)) {
      return "You have started to evaluate the evidence here rather than only describing it.";
    }
    return extractObservedEvidenceLine(entry) || "";
  }
  if (code === "M1") {
    if (/\b(pugh|decision matrix|compare|comparison|monitor|monitoring|method|justif|selection)\b/i.test(corpus)) {
      return "You have compared and justified your approach clearly here.";
    }
    const observed = extractObservedEvidenceLine(entry);
    if (/legislation\/ethical considerations/i.test(observed)) return "";
    return observed;
  }
  if (code === "P1") {
    if (hasProjectSelectionSignals(corpus)) {
      return "Your project selection and aims are clearly stated here.";
    }
    return "";
  }
  const observed = extractObservedEvidenceLine(entry);
  if (observed) return observed;
  return "";
}

function gapLine(entry: PageCriterionEntry) {
  const code = entry.code;
  const rationale = summarizeReason(entry.rationale);
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();

  if (code === "M2" && entry.decision !== "ACHIEVED" && hasProjectMonitoringSignals(corpus)) {
    if (/\bgantt\b/i.test(corpus) && /\b(milestone|monitor|tracking|progress|critical path|cpm)\b/i.test(corpus)) {
      return "To meet M2, add one alternative milestone monitoring method beyond the Gantt chart and show how you would use it to check progress and respond to delays.";
    }
    return "To meet M2, show one alternative milestone monitoring method and explain clearly why it is suitable for tracking progress.";
  }

  if (code === "D2" && entry.decision !== "ACHIEVED" && (hasSoftwareConfirmationSignals(corpus) || hasMathsMethodSignals(corpus))) {
    return "To evidence D2, make the software-to-calculation confirmation explicit across at least three distinct problems.";
  }
  if (code === "D1" && entry.decision !== "ACHIEVED" && hasEvaluationSignals(corpus)) {
    return "To strengthen D1, move from description to critical evaluation by judging one clear example against performance criteria.";
  }
  if (code === "P7" && /\bmagnitude|component|horizontal|vertical\b/i.test(corpus)) {
    return "Present magnitudes as positive values, then note direction separately.";
  }
  if (code === "M3" && entry.decision !== "ACHIEVED" && hasMathsMethodSignals(corpus)) {
    return "Make the link between the graph and your analytical combined-wave result more explicit.";
  }
  if (entry.decision === "ACHIEVED") {
    const codeSupportsVerificationPrompt = new Set(["P6", "P7", "M3", "D2"]).has(code);
    const mathLike =
      /\b(sin|cos|tan|phasor|vector|determinant|equation|formula|magnitude|component|current|voltage|frequency|units?)\b/i.test(
        corpus
      ) || (/\d/.test(corpus) && /[=+\-/*]/.test(corpus));
    const hasFinalAnswerCue = /\b(final|answer|result|therefore|hence)\b/i.test(corpus);
    const alreadyChecked = /\b(check|verify|verified|substitut|sense[- ]check|unit[s]?)\b/i.test(corpus);
    if (codeSupportsVerificationPrompt && mathLike && hasFinalAnswerCue && !alreadyChecked) {
      return "Add a one-line check under the answer (for example units or substitution) so the result can be confirmed quickly.";
    }
    return "";
  }
  if (rationale) {
    const cleanedRationale = rationale.replace(/\b(with|which|that)\s*$/i, "").trim();
    const safeRationale = cleanedRationale || rationale;
    if (/^(?:m\d|d\d|p\d)\s+not achieved\b/i.test(safeRationale)) {
      return `To improve this page, ${safeRationale.charAt(0).toLowerCase()}${safeRationale.slice(1)}`;
    }
    if (/^(?:evidence|method|working|explanation|link|comparison|confirmation)\b/i.test(safeRationale)) {
      return `To improve this page, ${safeRationale.charAt(0).toLowerCase()}${safeRationale.slice(1)}`;
    }
    return `To improve this page, ${safeRationale.charAt(0).toLowerCase()}${safeRationale.slice(1)}`;
  }
  return "Add one sentence that explains exactly how this evidence meets the requirement.";
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
  if (entry.decision === "ACHIEVED") return "";
  if (String(entry.code || "").toUpperCase() === "P1") return "";
  const hasVisualEvidence =
    /\b(image|figure|diagram|chart|graph|plot|waveform|screenshot|photo|table|sketch)\b/i.test(corpus);
  if (hasVisualEvidence) return "";

  const likelyBenefitsFromVisual =
    hasSpecificEvidenceSignal(entry) ||
    /\b(compare|process|method|system|layout|flow|performance|evaluation|analysis|relationship|milestone|tracking|critical path|software)\b/i.test(
      corpus
    );
  if (!likelyBenefitsFromVisual) return "";

  return "A simple labelled sketch/diagram/table could help you develop the idea further and make your explanation easier to follow.";
}

function actionLines(entry: PageCriterionEntry): string[] {
  const code = entry.code;
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();
  if (code === "M2" && hasProjectMonitoringSignals(corpus)) {
    return [
      "Show one method beyond Gantt (for example a milestone checklist with RAG status, CPM/critical path output, or a milestone tracker).",
      "Add a short explanation of what the method shows and how it helps you manage delays or slippage.",
      "Label any chart/table/image clearly so the evidence is quick to verify.",
    ];
  }
  if (code === "D1" && hasEvaluationSignals(corpus)) {
    return [
      "Choose one clear focus example and evaluate it using relevant performance criteria and trade-offs.",
      "Add one sentence that states your judgement clearly and explains why the evidence supports D1.",
      "A comparison table or labelled diagram could strengthen the evaluation and make your reasoning easier to follow.",
    ];
  }
  if (code === "D2" && (hasSoftwareConfirmationSignals(corpus) || hasMathsMethodSignals(corpus))) {
    return [
      "Add a one-line confirmation linking software output to your analytical value.",
      "Add label/cursor/marker values and reference the exact graph/figure/page used as evidence.",
      "Show this confirmation across at least three distinct problems.",
    ];
  }
  if (code === "M3" && hasMathsMethodSignals(corpus)) {
    return [
      "Overlay or compare plots so equivalence is visible.",
      "Label axes/markers and point to the exact figure/page used in your explanation.",
      "Add one sentence explaining how the graph supports your analytical form.",
    ];
  }
  if (code === "P7" && hasMathsMethodSignals(corpus)) {
    return [
      "State magnitudes explicitly using absolute values.",
      "Show direction separately and label final components clearly.",
      "State units and use consistent rounding in your final line.",
    ];
  }
  if (code === "P6" && hasMathsMethodSignals(corpus)) {
    return [
      "Show your branch/selection logic clearly before the final answer.",
      "Add one quick substitution check against the original expression.",
      "State units and use consistent rounding in your final line.",
    ];
  }
  return [
    "Add one sentence that explains exactly how this evidence meets the requirement.",
    "Label the final result, table, or figure you are relying on so it is quick to verify.",
  ];
}

function buildSupportiveFluentNoteItems(input: {
  entry: PageCriterionEntry;
  items: PageNoteItem[];
  includeCode: boolean;
}) {
  const { entry, items, includeCode } = input;
  const code = String(entry.code || "").toUpperCase();
  const byKind = new Map<PageNoteItemKind, string[]>();
  for (const item of items) {
    const list = byKind.get(item.kind) || [];
    const txt = stripLegacyPageNotePrefixes(String(item.text || "").trim());
    if (txt) list.push(txt);
    byKind.set(item.kind, list);
  }

  const praise = (byKind.get("praise") || [])[0] || "";
  const gaps = (byKind.get("gap") || []).slice(0, 2);
  const actions = (byKind.get("action") || []).slice(0, 2);
  const verification = (byKind.get("verification") || []).slice(0, 2);

  const joinSentence = (parts: string[]) =>
    parts
      .map((p) => sanitizeStudentNoteText(p))
      .filter(Boolean)
      .map((p) => toSentence(p))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const hasUsefulContent = (v: string) =>
    /\b(gantt|graph|plot|table|diagram|software|comparison|milestone|tracking|method|result|equation|vector|phasor|analysis|evaluation|judgement|delay|critical path|rag|units?|magnitude|component)\b/i.test(
      v || ""
    );
  const looksGeneric = (v: string) =>
    /^(?:you have (?:clear|relevant) evidence here for this requirement|you have started to evidence this requirement on this page)\.?$/i.test(
      sanitizeStudentNoteText(v)
    );

  // Project-planning M2 pattern: use only when the page evidence is clearly milestone-monitoring related.
  if (code === "M2" && entry.decision !== "ACHIEVED" && hasProjectMonitoringSignals(`${entry.context} ${entry.rationale}`)) {
    const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();
    const hasGantt = /\bgantt\b/i.test(corpus);
    const lead = hasGantt
      ? "You have tracked your milestones clearly using a Gantt chart."
      : praise || "You have made a good start with your milestone tracking evidence.";
    const coreGapRaw =
      gaps.find((v) => /\bTo meet M2\b/i.test(v)) ||
      "To meet M2, you also need to show one other milestone monitoring method beyond the Gantt chart and demonstrate how you would use it to check progress and take action.";
    const coreGap = coreGapRaw
      .replace(/^To (?:strengthen|improve) this,\s*/i, "")
      .replace(/^to meet\b/i, "To meet");
    const methodExamples =
      "A simple milestone checklist with RAG status, a CPM/critical path output, or a short milestone tracker would all be suitable.";
    const explainLine =
      actions.find((v) => /\bexplain|what the method shows|manage delays|slippage\b/i.test(v)) ||
      "Add a brief explanation of what the method shows and how it helps you manage delays.";
    const labelLine = verification[0] ? verification[0] : "";
    const body = joinSentence([lead, coreGap, methodExamples, explainLine, labelLine]);
    return [{ kind: "action" as PageNoteItemKind, text: body }];
  }

  const orderedParts: string[] = [];
  const primaryGap = gaps[0] || "";
  const secondaryGap = actions[0] || gaps[1] || "";
  const verificationLine = verification[0] || actions[1] || "";
  const leadStrength =
    praise && (!looksGeneric(praise) || entry.decision === "ACHIEVED" || hasUsefulContent(praise)) ? praise : "";

  if (entry.decision === "ACHIEVED") {
    if (leadStrength) orderedParts.push(leadStrength);
    if (primaryGap) orderedParts.push(primaryGap);
    if (verificationLine && !/^\s*if you use images or charts here/i.test(verificationLine)) orderedParts.push(verificationLine);
  } else {
    if (leadStrength) orderedParts.push(leadStrength);
    if (primaryGap) {
      orderedParts.push(primaryGap);
    } else if (includeCode && code && code !== "CRITERION") {
      orderedParts.push(`For ${code}, add clearer evidence and explanation so the requirement is fully met.`);
    }

    if (secondaryGap) orderedParts.push(secondaryGap);
    if (verificationLine) orderedParts.push(verificationLine);
  }

  if (!orderedParts.length && praise) orderedParts.push(praise);
  const paragraph = joinSentence(orderedParts);
  if (!paragraph) return items;
  return [{ kind: (entry.decision === "ACHIEVED" ? "praise" : "action") as PageNoteItemKind, text: paragraph }];
}

function bandImpactLine() {
  return "";
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
  if (/^To (?:strengthen|improve|meet|evidence)\b/i.test(s)) return s;
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

function shouldIncludeLinkItem(entry: PageCriterionEntry) {
  const corpus = `${entry.context} ${entry.rationale}`.toLowerCase();
  if (!corpus) return true;
  if (/\bbecause\b|\btherefore\b|\bthis (shows|demonstrates|supports|meets)\b/i.test(corpus)) return false;
  if (/\bcriterion\b|\brequirement\b|\bmeets?\s+[pmd]\d{1,2}\b/i.test(corpus)) return false;
  return true;
}

function formatItemTextForTone(kind: PageNoteItemKind, value: string, style: PageNoteStyleProfile) {
  let text = stripLegacyPageNotePrefixes(String(value || "").trim());
  if (!text) return "";
  if (kind === "praise" && style.softenStrengthLine) text = softenSupportiveStrengthLine(text);
  if (kind === "gap" && style.softenGapLine) text = softenSupportiveGapLine(text);
  if ((kind === "action" || kind === "verification") && style.softenActionLines) text = softenSupportiveActionLine(text);
  return text;
}

function safeFallbackNoteItem(input: { kind: PageNoteItemKind; code: string }) {
  const code = String(input.code || "CRITERION").toUpperCase();
  if (input.kind === "praise") return "You have relevant evidence here for this requirement.";
  if (input.kind === "gap") {
    return `To improve this page for ${code}, add clearer evidence showing what you did and what result or output proves the requirement.`;
  }
  if (input.kind === "action") {
    return "Finish this section with one short sentence that states what evidence you used, what you did, and why it meets the requirement (place it at the end of the paragraph or directly under the result/figure).";
  }
  return "Label the figure/table/result and refer to it in the paragraph so the evidence is quick to verify.";
}

function applyTemplateGuardToNoteItems(
  items: PageNoteItem[],
  entry: PageCriterionEntry,
  context?: PageNoteGenerationContext
) {
  const explicitBanned = resolvePageNoteBannedKeywords(context);
  const sourceCorpus = sanitizeStudentNoteText(
    `${entry.context} ${entry.rationale} ${String(context?.assignmentTitle || "")} ${String(context?.unitCode || "")} ${String(context?.assignmentCode || "")}`
  ).toLowerCase();
  const allBanned = Array.from(new Set([...explicitBanned, ...GLOBAL_TEMPLATE_LEAK_TERMS]));
  if (!allBanned.length) return items;
  const warned: string[] = [];

  const next = items.map((item) => {
    const text = String(item?.text || "");
    if (!text) return item;
    const textLower = text.toLowerCase();
    const hit = allBanned.find((kw) => {
      const k = String(kw || "").toLowerCase();
      if (!k || !textLower.includes(k)) return false;
      // Allow domain terms only when the student's own evidence/rationale/context uses them.
      return !sourceCorpus.includes(k);
    });
    if (!hit) return item;
    warned.push(`${item.kind}:${hit}`);
    return {
      ...item,
      text: safeFallbackNoteItem({ kind: item.kind, code: entry.code }),
    };
  });

  if (warned.length && process.env.NODE_ENV !== "production") {
    console.warn(
      `[pageNotes] template guard replaced contaminated note text for ${entry.code} on page ${entry.page}: ${warned.join(", ")}`
    );
  }
  return next;
}

function buildStructuredNoteItems(input: {
  entry: PageCriterionEntry;
  includeCode: boolean;
  handwritingLikely: boolean;
  tone: PageNoteTone;
  maxLinesPerPage: number;
  context?: PageNoteGenerationContext;
}) {
  const { entry, includeCode, handwritingLikely, tone, maxLinesPerPage, context } = input;
  const style = resolvePageNoteStyle(tone);
  const items: PageNoteItem[] = [];

  const strength = strengthLine(entry);
  const improvement = gapLine(entry);
  const actions = actionLines(entry);
  const visualLine = visualPresentationLine(entry) || visualDevelopmentSuggestionLine(entry);
  const criterionLink = bandImpactLine();
  const linkAction =
    actions.find((line) => /\b(connect|explains?|show[s]?|demonstrates?|supports?)\b.*\b(requirement|criterion|evidence)\b/i.test(line)) ||
    "";
  const presentationAction =
    actions.find((line) => /\b(label|caption|axis|axes|marker|cursor|figure|table|presentation)\b/i.test(line)) || "";
  const genericAction = actions.find((line) => line && line !== linkAction && line !== presentationAction) || "";
  const allowGenericPresentationPrompt =
    entry.decision !== "ACHIEVED" &&
    (/\b(image|figure|diagram|chart|graph|plot|waveform|screenshot|photo|table|sketch)\b/i.test(`${entry.context} ${entry.rationale}`) ||
      hasSpecificEvidenceSignal(entry));

  // Flexible structure: include only relevant items; do not force a fixed 5-line template.
  if (entry.decision === "ACHIEVED") {
    if (strength && !isGenericStrengthText(strength)) items.push({ kind: "praise", text: strength });
    if (improvement && !isLowValueImprovementText(improvement)) {
      items.push({
        kind: /\b(check|verify|units?|substitut|label|caption|figure|table)\b/i.test(improvement) ? "verification" : "action",
        text: improvement,
      });
    }
  } else {
    if (/good start here/i.test(strength) || entry.decision === "UNCLEAR") {
      items.unshift({ kind: "praise", text: strength });
    }
    if (improvement) items.push({ kind: "gap", text: improvement });
    if (genericAction && !isLowValueImprovementText(genericAction)) {
      items.push({ kind: "action", text: genericAction });
    }
  }

  if (entry.decision !== "ACHIEVED" && shouldIncludeLinkItem(entry)) {
    const explicitLinkAction =
      linkAction ||
      "Add one sentence that explicitly connects your evidence to the criterion.";
    if (!isLowValueImprovementText(explicitLinkAction)) {
      items.push({ kind: "action", text: explicitLinkAction });
    }
  }

  if (visualLine) {
    items.push({ kind: "verification", text: visualLine });
  } else if (handwritingLikely && entry.decision !== "ACHIEVED" && /\b(handwrit|scan|photo|image)\b/i.test(`${entry.context} ${entry.rationale}`)) {
    items.push({ kind: "verification", text: style.handwritingTip });
  } else if (allowGenericPresentationPrompt) {
    const fallbackPresentation = presentationAction || "Label the final result so the method used is easy to verify.";
    items.push({ kind: "verification", text: fallbackPresentation });
  }

  const addSupports =
    includeCode &&
    entry.code !== "CRITERION" &&
    tone !== "supportive" &&
    (entry.decision !== "ACHIEVED" || shouldIncludeLinkItem(entry));
  if (addSupports && criterionLink && entry.decision !== "ACHIEVED") {
    items.push({ kind: "verification", text: criterionLink });
  }

  const guarded = applyTemplateGuardToNoteItems(items, entry, context);
  const deduped: PageNoteItem[] = [];
  const seen = new Set<string>();
  for (const item of guarded) {
    const key = `${item.kind}:${sanitizeStudentNoteText(item.text).toLowerCase()}`;
    if (!item.text || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= Math.max(1, Math.min(8, maxLinesPerPage))) break;
  }
  if (!deduped.length) {
    deduped.push({ kind: "action", text: safeFallbackNoteItem({ kind: "action", code: entry.code }) });
  }

  let formatted = deduped.map((item) => ({
    ...item,
    text: formatItemTextForTone(item.kind, item.text, style),
  }));
  if (tone === "supportive") {
    formatted = buildSupportiveFluentNoteItems({ entry, items: formatted, includeCode });
  }
  formatted = formatted
    .map((item) => ({ ...item, text: expandIncompleteAdvice(item.text) }))
    .filter((item) => !isLowValuePageNoteText(item.text));
  formatted = applyNoteWordBudget(formatted);
  if (!formatted.length) {
    if (entry.decision === "ACHIEVED") {
      return [];
    }
    formatted = [
      {
        kind: "action",
        text: safeFallbackNoteItem({ kind: "action", code: entry.code }),
      },
    ];
  }
  return formatted;
}

function formatStructuredNoteLines(input: {
  entry: PageCriterionEntry;
  items: PageNoteItem[];
  includeCode: boolean;
  tone: PageNoteTone;
}) {
  const { entry, items, includeCode, tone } = input;
  const style = resolvePageNoteStyle(tone);
  const lines: string[] = [];
  if (includeCode && entry.code !== "CRITERION" && style.focusLabel) {
    lines.push(compactLine(`${style.focusLabel}: ${entry.code}`, 80));
  }
  for (const item of items) {
    lines.push(toSentence(item.text));
  }
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
        pageMap.set(code, { code, decision, rationale, context, page });
        continue;
      }
      // Keep the strictest decision for this page/code and enrich rationale/context.
      if (decisionPriority(decision) < decisionPriority(existing.decision)) {
        existing.decision = decision;
      }
      if (!existing.rationale && rationale) existing.rationale = rationale;
      if (!existing.context && context) existing.context = context;
      existing.page = page;
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
    context?: PageNoteGenerationContext;
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
  const generationContext = options?.context || null;
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
      const sectionMatch = resolvePageNoteSectionForCriterion({
        code: primary.code,
        evidenceText: primary.context,
        rationaleText: primary.rationale,
        context: generationContext,
      });
      const sectionId = sectionMatch?.id || null;
      const sectionLabel = sectionMatch?.label || null;
      if (!criterionAllowedInResolvedSection({ code: primary.code, sectionId, context: generationContext })) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[pageNotes] skipped note for ${primary.code} on page ${page} because resolved section ${String(sectionId || "unknown")} is not allowed`
          );
        }
        return { page, lines: [] };
      }
      const items = buildStructuredNoteItems({
        entry: primary,
        includeCode,
        handwritingLikely,
        tone: tone === "professional" || tone === "strict" ? tone : "supportive",
        maxLinesPerPage,
        context: generationContext || undefined,
      });
      const lines = formatStructuredNoteLines({
        entry: primary,
        items,
        includeCode,
        tone: tone === "professional" || tone === "strict" ? tone : "supportive",
      }).slice(0, maxLinesPerPage);
      return {
        page,
        lines,
        items,
        criterionCode: primary.code,
        showCriterionCodeInTitle: includeCode,
        sectionId,
        sectionLabel,
        severity: (primary.decision === "ACHIEVED" ? "info" : "action") as PageNoteSeverity,
      };
    })
    .filter((note) => note.lines.length > 0);
}
