export type GradeBand = "PASS" | "MERIT" | "DISTINCTION";

export type AssessmentCriterion = {
  acCode: string;
  gradeBand: GradeBand;
  description: string;
};

export type LearningOutcome = {
  loCode: string;
  description: string;
  essentialContent: string | null;
  criteria: AssessmentCriterion[];
};

export type ParsedSpec = {
  kind: "SPEC";
  parserVersion: string;
  unit: {
    unitCode: string;
    unitTitle: string;
    pearsonUnitCode: string | null;
    unitCodeQualifier: string | null;
    level: number | null;
    credits: number | null;
    specIssue: string | null;
    specVersionLabel: string | null;
  };
  learningOutcomes: LearningOutcome[];
};
