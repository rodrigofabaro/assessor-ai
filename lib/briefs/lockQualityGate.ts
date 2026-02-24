import type { GradeBand } from "@/lib/referenceParser";
import { evaluateBriefSpecAudit, type BriefSpecAuditResult } from "@/lib/briefs/briefSpecAudit";

type UnitCriterionLite = {
  acCode: string;
  gradeBand: GradeBand;
  loCode: string;
  description?: string | null;
  loDescription?: string | null;
};

type BriefGateInput = {
  assignmentCode: string;
  title: string;
  hasUnitSignal: boolean;
  selectedCodes: string[];
  rawText: string;
  unitCriteria: UnitCriterionLite[];
  selectedUnitCode?: string | null;
  selectedUnitTitle?: string | null;
  briefDraft?: any;
};

export type BriefGateResult = {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  metrics: {
    selectedCount: number;
    matchedCount: number;
    passCount: number;
    meritCount: number;
    distinctionCount: number;
  };
  audit?: BriefSpecAuditResult;
};

export function evaluateBriefLockQuality(input: BriefGateInput): BriefGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const assignmentCode = String(input.assignmentCode || "").trim().toUpperCase();
  const title = String(input.title || "").trim();
  const selectedCodes = Array.from(
    new Set((Array.isArray(input.selectedCodes) ? input.selectedCodes : []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))
  );
  const rawText = String(input.rawText || "");
  const unitCriteria = Array.isArray(input.unitCriteria) ? input.unitCriteria : [];

  if (!assignmentCode) blockers.push("Missing assignment code.");
  if (!title) blockers.push("Missing assignment title.");
  if (!input.hasUnitSignal) blockers.push("Missing unit signal (unit guess or selected unit).");
  if (!selectedCodes.length) blockers.push("No criteria codes extracted for this brief.");
  if (rawText.trim().length < 400) blockers.push("Brief text extraction is too short for reliable mapping.");

  const unitByCode = new Map<string, UnitCriterionLite>();
  for (const c of unitCriteria) {
    const code = String(c.acCode || "").trim().toUpperCase();
    if (!code) continue;
    unitByCode.set(code, {
      acCode: code,
      gradeBand: c.gradeBand,
      loCode: String(c.loCode || "").trim().toUpperCase(),
    });
  }

  const matched = selectedCodes.map((code) => unitByCode.get(code)).filter(Boolean) as UnitCriterionLite[];
  if (matched.length !== selectedCodes.length) {
    const unknown = selectedCodes.filter((code) => !unitByCode.has(code));
    if (unknown.length) blockers.push(`Criteria not found in selected unit: ${unknown.join(", ")}.`);
  }

  const passCount = matched.filter((m) => m.gradeBand === "PASS").length;
  const meritCount = matched.filter((m) => m.gradeBand === "MERIT").length;
  const distinctionCount = matched.filter((m) => m.gradeBand === "DISTINCTION").length;

  if (passCount === 0) warnings.push("No PASS criteria detected in mapping.");
  if (meritCount > 0 && distinctionCount === 0) {
    blockers.push("MERIT criteria detected without any DISTINCTION criteria. Extraction may be incomplete.");
  }

  const selectedLos = new Set(matched.map((m) => m.loCode).filter(Boolean));
  for (const loCode of selectedLos) {
    const loSelected = matched.filter((m) => m.loCode === loCode);
    const loUnit = unitCriteria.filter((c) => String(c.loCode || "").trim().toUpperCase() === loCode);
    const loHasUnitDistinction = loUnit.some((c) => c.gradeBand === "DISTINCTION");
    const loHasSelectedMerit = loSelected.some((c) => c.gradeBand === "MERIT");
    const loHasSelectedDistinction = loSelected.some((c) => c.gradeBand === "DISTINCTION");
    if (loHasUnitDistinction && loHasSelectedMerit && !loHasSelectedDistinction) {
      blockers.push(`Potential incomplete LO progression for ${loCode}: MERIT present without DISTINCTION.`);
    }
  }

  const audit = evaluateBriefSpecAudit({
    briefDraft: input.briefDraft || null,
    selectedUnitCode: input.selectedUnitCode || null,
    selectedUnitTitle: input.selectedUnitTitle || null,
    unitCriteria,
    selectedCodes,
  });
  if (audit.blockerCount > 0) {
    blockers.push(`Brief vs spec audit failed (${audit.blockerCount} blocker${audit.blockerCount === 1 ? "" : "s"}).`);
  }
  if (audit.warningCount > 0) {
    warnings.push(`Brief vs spec audit found ${audit.warningCount} warning${audit.warningCount === 1 ? "" : "s"}.`);
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    metrics: {
      selectedCount: selectedCodes.length,
      matchedCount: matched.length,
      passCount,
      meritCount,
      distinctionCount,
    },
    audit,
  };
}
