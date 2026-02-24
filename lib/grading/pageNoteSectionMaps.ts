export type PageNoteItemKind = "praise" | "gap" | "action" | "verification";
export type PageNoteSeverity = "info" | "action";

export type PageNoteGenerationContext = {
  unitCode?: string | null;
  assignmentCode?: string | null;
  assignmentTitle?: string | null;
  assignmentType?: string | null;
  criteriaSet?: string[] | null;
  allowedKeywords?: string[] | null;
  bannedKeywords?: string[] | null;
};

export type PageNoteSectionMatch = {
  id: string;
  label: string;
};

type SectionRule = {
  id: string;
  label: string;
  keywords: string[];
};

type CriteriaSectionRule = {
  assignmentType: string;
  criteriaToSections: Record<string, string[]>;
  sectionsToCriteria: Record<string, string[]>;
  sections: SectionRule[];
  bannedKeywords: string[];
};

function invertSectionCriteriaMap(sectionsToCriteria: Record<string, string[]>) {
  const criteriaToSections: Record<string, string[]> = {};
  for (const [sectionId, codes] of Object.entries(sectionsToCriteria || {})) {
    for (const rawCode of Array.isArray(codes) ? codes : []) {
      const code = String(rawCode || "").trim().toUpperCase();
      if (!code) continue;
      if (!criteriaToSections[code]) criteriaToSections[code] = [];
      if (!criteriaToSections[code].includes(sectionId)) criteriaToSections[code].push(sectionId);
    }
  }
  return criteriaToSections;
}

function createCriteriaSectionRule(input: {
  assignmentType: string;
  sectionsToCriteria: Record<string, string[]>;
  sections: SectionRule[];
  bannedKeywords: string[];
}): CriteriaSectionRule {
  return {
    assignmentType: input.assignmentType,
    sectionsToCriteria: input.sectionsToCriteria,
    criteriaToSections: invertSectionCriteriaMap(input.sectionsToCriteria),
    sections: input.sections,
    bannedKeywords: input.bannedKeywords,
  };
}

const PROJECT_REPORT_SECTION_TO_CRITERIA: Record<string, string[]> = {
  project_scope: ["P1", "P2", "D1"],
  financial_planning: ["P3", "M1"],
  schedule_planning: ["P3", "P4", "M1"],
  risk_management: ["P5", "M2"],
  monitoring_control: ["P4", "M2", "D2"],
  evaluation_reflection: ["D1", "D2"],
};

const UNIT4_PROJECT_MANAGEMENT_RULES: CriteriaSectionRule = createCriteriaSectionRule({
  assignmentType: "project_report",
  sectionsToCriteria: PROJECT_REPORT_SECTION_TO_CRITERIA,
  sections: [
    { id: "project_scope", label: "Project Planning", keywords: ["scope", "objective", "aim", "deliverable", "stakeholder", "requirements", "proposal"] },
    { id: "financial_planning", label: "Financial Planning", keywords: ["budget", "cost", "financial", "finance", "cash flow", "costing", "cost breakdown"] },
    { id: "schedule_planning", label: "Scheduling", keywords: ["schedule", "gantt", "timeline", "milestone", "dependency", "critical path", "wbs"] },
    { id: "risk_management", label: "Risk", keywords: ["risk", "mitigation", "probability", "impact", "contingency", "risk register"] },
    { id: "monitoring_control", label: "Monitoring and Control", keywords: ["monitor", "tracking", "progress", "variance", "control", "change log", "review"] },
    { id: "evaluation_reflection", label: "Evaluation", keywords: ["evaluate", "evaluation", "reflection", "lessons learned", "recommendation", "justify", "outcome"] },
  ],
  bannedKeywords: [
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
    "energy efficiency",
    "matlab/simulink",
    "simulink",
  ],
});

const ASSIGNMENT_TYPE_RULES: Record<string, CriteriaSectionRule> = {
  project_report: UNIT4_PROJECT_MANAGEMENT_RULES,
};

function normalizeUnitCode(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(/\b(\d{1,4})\b/);
  return match?.[1] || raw;
}

export function resolvePageNoteRules(context?: PageNoteGenerationContext | null): CriteriaSectionRule | null {
  const assignmentType = String(context?.assignmentType || "").trim().toLowerCase();
  if (assignmentType && ASSIGNMENT_TYPE_RULES[assignmentType]) {
    return ASSIGNMENT_TYPE_RULES[assignmentType];
  }
  const unitCode = normalizeUnitCode(context?.unitCode);
  const title = String(context?.assignmentTitle || "").toLowerCase();
  const isUnit4Project =
    unitCode === "4" ||
    unitCode === "4004" ||
    (title.includes("project") && (title.includes("planning") || title.includes("engineering")));
  if (isUnit4Project) return UNIT4_PROJECT_MANAGEMENT_RULES;
  return null;
}

export function resolvePageNoteSectionCriteriaMap(context?: PageNoteGenerationContext | null) {
  return resolvePageNoteRules(context)?.sectionsToCriteria || null;
}

export function resolvePageNoteBannedKeywords(context?: PageNoteGenerationContext | null): string[] {
  const rules = resolvePageNoteRules(context);
  const extra = Array.isArray(context?.bannedKeywords)
    ? context!.bannedKeywords!.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const merged = [...(rules?.bannedKeywords || []), ...extra];
  return Array.from(new Set(merged));
}

export function resolvePageNoteSectionForCriterion(input: {
  code?: string | null;
  evidenceText?: string | null;
  rationaleText?: string | null;
  context?: PageNoteGenerationContext | null;
}): PageNoteSectionMatch | null {
  const rules = resolvePageNoteRules(input.context);
  if (!rules) return null;

  const code = String(input.code || "").trim().toUpperCase();
  const allowedSectionIds = Array.isArray(rules.criteriaToSections[code]) ? rules.criteriaToSections[code] : [];
  const corpus = `${String(input.evidenceText || "")} ${String(input.rationaleText || "")}`.toLowerCase();

  let best: { id: string; label: string; score: number } | null = null;
  for (const section of rules.sections) {
    if (allowedSectionIds.length && !allowedSectionIds.includes(section.id)) continue;
    let score = 0;
    for (const keyword of section.keywords) {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(corpus)) score += 1;
    }
    if (score <= 0) continue;
    if (!best || score > best.score) best = { id: section.id, label: section.label, score };
  }

  if (best) return { id: best.id, label: best.label };
  if (allowedSectionIds.length === 1) {
    const section = rules.sections.find((s) => s.id === allowedSectionIds[0]);
    if (section) return { id: section.id, label: section.label };
  }
  return null;
}

export function criterionAllowedInResolvedSection(input: {
  code?: string | null;
  sectionId?: string | null;
  context?: PageNoteGenerationContext | null;
}) {
  const rules = resolvePageNoteRules(input.context);
  if (!rules) return true;
  const code = String(input.code || "").trim().toUpperCase();
  const sectionId = String(input.sectionId || "").trim();
  if (!code || !sectionId) return true;
  const allowed = rules.criteriaToSections[code];
  if (!Array.isArray(allowed) || !allowed.length) return true;
  return allowed.includes(sectionId);
}
