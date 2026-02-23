"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { jsonFetch } from "@/lib/http";
import { notifyToast } from "@/lib/ui/toast";
import { summarizeFeedbackText } from "@/lib/grading/feedbackDocument";
import { buildPageNotesFromCriterionChecks } from "@/lib/grading/pageNotes";
import { buildMarkedPdfUrl } from "@/lib/submissions/markedPdfUrl";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";

type ExtractedPage = {
  id: string;
  pageNumber: number;
  text: string;
  confidence: number;
};

type ExtractionRun = {
  id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "NEEDS_OCR" | "FAILED";
  isScanned: boolean;
  overallConfidence: number | null;
  engineVersion: string;
  startedAt: string;
  finishedAt?: string | null;
  warnings?: any[] | null;
  error?: string | null;
  sourceMeta?: any;
  pages: ExtractedPage[];
};

type Submission = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  student?: { id: string; fullName: string; email?: string | null; externalRef?: string | null } | null;
  assignment?: {
    id: string;
    unitCode: string;
    assignmentRef?: string | null;
    title: string;
  } | null;
  studentLinkedAt?: string | null;
  studentLinkedBy?: string | null;
  extractionRuns: ExtractionRun[];
  assessments?: Array<{
    id: string;
    createdAt: string;
    overallGrade: string | null;
    feedbackText?: string | null;
    annotatedPdfPath: string | null;
    resultJson?: any;
  }>;
};

type TriageInfo = {
  unitCode?: string | null;
  assignmentRef?: string | null;
  studentName?: string | null;
  email?: string | null;
  sampleLines?: string[];
  warnings?: string[];
  studentDetection?: {
    detected: boolean;
    linked: boolean;
    source: "text" | "cover" | "filename" | "email" | null;
  };
  coverage?: {
    hasUnitSpec: boolean;
    hasAssignmentBrief: boolean;
    missing: string[];
  };
};

type GradingConfig = {
  model: string;
  tone: "supportive" | "professional" | "strict";
  strictness: "lenient" | "balanced" | "strict";
  useRubricIfAvailable: boolean;
  studentSafeMarkedPdf?: boolean;
  maxFeedbackBullets: number;
  feedbackTemplate?: string;
};

type GradePreview = {
  overallGrade?: string;
  rawOverallGrade?: string;
  confidence?: number;
  response?: any;
  checklist?: Record<string, boolean>;
  gradePolicy?: {
    rawOverallGrade?: string;
    finalOverallGrade?: string;
    resubmissionRequired?: boolean;
    wasCapped?: boolean;
    capReason?: string | null;
    criteriaBandCap?: {
      wasCapped?: boolean;
      capReason?: string | null;
    } | null;
  };
  evidenceDensitySummary?: {
    criteriaCount?: number;
    totalCitations?: number;
    totalWordsCited?: number;
    criteriaWithoutEvidence?: number;
  };
  referenceContextSnapshot?: any;
};

type AppConfigPayload = {
  activeAuditUser?: { fullName?: string | null } | null;
};

type StudentSearchResult = {
  id: string;
  fullName: string;
  email?: string | null;
  externalRef?: string | null;
};

type AssignmentOption = {
  id: string;
  unitCode: string;
  assignmentRef?: string | null;
  title: string;
};

type AssessmentRequirement = {
  task?: string;
  section?: string;
  needsTable?: boolean;
  needsPercentage?: boolean;
  charts?: string[];
  needsEquation?: boolean;
  needsImage?: boolean;
};

type CriterionDecision = "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR";
type OverrideReasonCode =
  | "INSUFFICIENT_EVIDENCE"
  | "RUBRIC_MISALIGNMENT"
  | "CRITERION_INTERPRETATION"
  | "POLICY_ALIGNMENT"
  | "ASSESSOR_JUDGEMENT"
  | "OTHER";

type CriterionOverrideDraft = {
  finalDecision: CriterionDecision;
  reasonCode: OverrideReasonCode;
  note: string;
};

const OVERRIDE_REASON_OPTIONS: Array<{ value: OverrideReasonCode; label: string }> = [
  { value: "INSUFFICIENT_EVIDENCE", label: "Insufficient evidence" },
  { value: "RUBRIC_MISALIGNMENT", label: "Rubric misalignment" },
  { value: "CRITERION_INTERPRETATION", label: "Criterion interpretation" },
  { value: "POLICY_ALIGNMENT", label: "Policy alignment" },
  { value: "ASSESSOR_JUDGEMENT", label: "Assessor judgement" },
  { value: "OTHER", label: "Other" },
];

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function normalizeUnitCodeForMatch(value?: string | null) {
  const raw = String(value || "").trim();
  const m = raw.match(/\b(\d{1,4})\b/);
  return m?.[1] || "";
}

function normalizeAssignmentRefForMatch(value?: string | null) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const a = raw.match(/\bA\s*([1-9]\d?)\b/i);
  if (a) return `A${a[1]}`;
  const n = raw.match(/\b([1-9]\d?)\b/);
  return n ? `A${n[1]}` : raw.replace(/\s+/g, "");
}

function normalizeRequirementSection(section?: string) {
  const s = String(section || "").trim();
  if (!s || s.toLowerCase() === "task") return "Task";
  return `Part ${s.toUpperCase()}`;
}

function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700">
      {children}
    </span>
  );
}

export default function SubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = String(params?.submissionId || "");

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [triageInfo, setTriageInfo] = useState<TriageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [gradingBusy, setGradingBusy] = useState(false);
  const [gradingPreview, setGradingPreview] = useState<GradePreview | null>(null);
  const [gradingCfg, setGradingCfg] = useState<GradingConfig | null>(null);
  const [tone, setTone] = useState<GradingConfig["tone"]>("professional");
  const [strictness, setStrictness] = useState<GradingConfig["strictness"]>("balanced");
  const [useRubric, setUseRubric] = useState(true);

  // Auto-run extraction once for freshly uploaded submissions.
  const autoStartedRef = useRef(false);
  const studentSearchInputRef = useRef<HTMLInputElement | null>(null);
  const quickActionsPanelRef = useRef<HTMLDetailsElement | null>(null);
  const studentPanelRef = useRef<HTMLDetailsElement | null>(null);
  const workflowPanelRef = useRef<HTMLElement | null>(null);
  const assignmentPanelRef = useRef<HTMLDetailsElement | null>(null);
  const extractionPanelRef = useRef<HTMLDetailsElement | null>(null);
  const gradingPanelRef = useRef<HTMLDivElement | null>(null);
  const outputsPanelRef = useRef<HTMLDetailsElement | null>(null);
  const outputsAccordionRef = useRef<HTMLDivElement | null>(null);
  const sidePanelsInitializedForSubmission = useRef<string | null>(null);
  const coverEditorRef = useRef<HTMLDetailsElement | null>(null);
  const coverStudentNameRef = useRef<HTMLInputElement | null>(null);
  const coverStudentIdRef = useRef<HTMLInputElement | null>(null);
  const coverUnitCodeRef = useRef<HTMLInputElement | null>(null);
  const coverAssignmentCodeRef = useRef<HTMLInputElement | null>(null);
  const coverSubmissionDateRef = useRef<HTMLInputElement | null>(null);

  /* ---------- Student linking state ---------- */
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOption[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [coverEditBusy, setCoverEditBusy] = useState(false);
  const [coverSaveState, setCoverSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [pdfView, setPdfView] = useState<"original" | "marked">("original");
  const [gradingConfigOpen, setGradingConfigOpen] = useState(false);
  const [runGradeWhenReady, setRunGradeWhenReady] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pdfViewport, setPdfViewport] = useState<"compact" | "comfort" | "full">("comfort");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [expandedFeedbackHistory, setExpandedFeedbackHistory] = useState<Record<string, boolean>>({});
  const [criterionOverrideDrafts, setCriterionOverrideDrafts] = useState<Record<string, CriterionOverrideDraft>>({});
  const [criterionOverrideBusyCode, setCriterionOverrideBusyCode] = useState<string | null>(null);
  const [feedbackEditorBusy, setFeedbackEditorBusy] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackStudentName, setFeedbackStudentName] = useState("");
  const [feedbackMarkedDate, setFeedbackMarkedDate] = useState("");
  const [feedbackBaseline, setFeedbackBaseline] = useState({ text: "", studentName: "", date: "" });
  const [activeAuditActorName, setActiveAuditActorName] = useState("system");
  const [lastActionNote, setLastActionNote] = useState("");
  const [pdfJumpPage, setPdfJumpPage] = useState<number | null>(null);
  const [coverStudentName, setCoverStudentName] = useState("");
  const [coverStudentId, setCoverStudentId] = useState("");
  const [coverUnitCode, setCoverUnitCode] = useState("");
  const [coverAssignmentCode, setCoverAssignmentCode] = useState("");
  const [coverSubmissionDate, setCoverSubmissionDate] = useState("");

  /* ---------- Extraction view state ---------- */
  const [activePage, setActivePage] = useState(0);
  const refreshSeq = useRef(0);

  const latestRun = useMemo(() => {
    const runs = submission?.extractionRuns ?? [];
    if (!runs.length) return null;
    return [...runs].sort((a, b) => {
      const at = new Date(a.finishedAt ?? a.startedAt).getTime();
      const bt = new Date(b.finishedAt ?? b.startedAt).getTime();
      return bt - at;
    })[0];
  }, [submission]);

  const pagesSorted = useMemo(
    () => [...(latestRun?.pages ?? [])].sort((a, b) => a.pageNumber - b.pageNumber),
    [latestRun]
  );

  const active = pagesSorted[Math.min(Math.max(activePage, 0), Math.max(pagesSorted.length - 1, 0))];
  const coverMeta = useMemo(() => {
    const c = latestRun?.sourceMeta?.coverMetadata;
    return c && typeof c === "object" ? c : null;
  }, [latestRun]);
  const extractionMode = useMemo(() => {
    const m = String(latestRun?.sourceMeta?.extractionMode || "").toUpperCase();
    return m === "COVER_ONLY" ? "COVER_ONLY" : m === "FULL" ? "FULL" : "";
  }, [latestRun]);
  const coverReady = useMemo(() => Boolean(latestRun?.sourceMeta?.coverReady), [latestRun]);

  useEffect(() => {
    setCoverStudentName(String(coverMeta?.studentName?.value || ""));
    setCoverStudentId(String(coverMeta?.studentId?.value || ""));
    setCoverUnitCode(String(coverMeta?.unitCode?.value || ""));
    setCoverAssignmentCode(String(coverMeta?.assignmentCode?.value || ""));
    setCoverSubmissionDate(String(coverMeta?.submissionDate?.value || ""));
  }, [coverMeta]);

  const latestAssessment = useMemo(() => {
    const a = submission?.assessments ?? [];
    if (!a.length) return null;
    return a[0];
  }, [submission]);
  const previousAssessment = useMemo(() => {
    const a = submission?.assessments ?? [];
    return a.length > 1 ? a[1] : null;
  }, [submission]);
  const gradingHistory = useMemo(() => submission?.assessments ?? [], [submission]);
  const selectedAssessment = useMemo(() => {
    if (!selectedAssessmentId) return latestAssessment;
    return gradingHistory.find((a) => a.id === selectedAssessmentId) || latestAssessment;
  }, [selectedAssessmentId, gradingHistory, latestAssessment]);
  const feedbackHistory = useMemo(
    () =>
      gradingHistory.map((a, idx) => ({
        id: a.id,
        index: idx,
        grade: a.overallGrade || "—",
        when: safeDate(a.createdAt),
        summary: summarizeFeedbackText(String(a.feedbackText || ""), 150) || "No feedback text.",
        fullText: String(a.feedbackText || "").trim(),
      })),
    [gradingHistory]
  );
  const selectedRunLabel = useMemo(() => {
    const idx = gradingHistory.findIndex((a) => a.id === selectedAssessmentId);
    if (idx < 0) return "—";
    if (idx === 0) return "Latest";
    return `#${Math.max(1, gradingHistory.length - idx)}`;
  }, [gradingHistory, selectedAssessmentId]);
  const feedbackDirty =
    feedbackDraft !== feedbackBaseline.text ||
    feedbackStudentName !== feedbackBaseline.studentName ||
    feedbackMarkedDate !== feedbackBaseline.date;
  const studentFeedbackPreview = useMemo(() => sanitizeStudentFeedbackText(feedbackDraft), [feedbackDraft]);
  const studentFeedbackChanged = useMemo(
    () => studentFeedbackPreview.trim() !== String(feedbackDraft || "").trim(),
    [studentFeedbackPreview, feedbackDraft]
  );
  const changeChips = useMemo(() => {
    const out: string[] = [];
    if ((submission?.assessments?.length || 0) > 1) out.push(`Regraded ${Math.max(0, (submission?.assessments?.length || 1) - 1)}x`);
    const coverUpdatedAfterGrade =
      !!latestAssessment?.createdAt &&
      !!submission?.studentLinkedAt &&
      new Date(submission.studentLinkedAt).getTime() > new Date(latestAssessment.createdAt).getTime();
    if (coverUpdatedAfterGrade) out.push("Student link changed after last grade");
    if (extractionMode === "COVER_ONLY") out.push("Cover-only mode");
    if (coverSaveState === "saved") out.push("Cover metadata saved");
    return out;
  }, [submission, latestAssessment, extractionMode, coverSaveState]);

  const structuredGrading = useMemo(() => {
    const rj: any = selectedAssessment?.resultJson || {};
    const v2 = rj?.structuredGradingV2;
    if (v2 && typeof v2 === "object") return v2;
    const fallback = rj?.response;
    if (fallback && typeof fallback === "object") return fallback;
    return null;
  }, [selectedAssessment]);
  const pageFeedbackMap = useMemo(() => {
    const rows = Array.isArray(structuredGrading?.criterionChecks) ? structuredGrading.criterionChecks : [];
    return buildPageNotesFromCriterionChecks(rows, {
      maxPages: 20,
      maxLinesPerPage: 8,
      context: {
        unitCode: submission?.assignment?.unitCode || (selectedAssessment as any)?.resultJson?.referenceContextSnapshot?.unit?.unitCode || "",
        assignmentCode:
          submission?.assignment?.assignmentRef ||
          (selectedAssessment as any)?.resultJson?.referenceContextSnapshot?.assignmentBrief?.assignmentCode ||
          "",
        assignmentTitle:
          submission?.assignment?.title || (selectedAssessment as any)?.resultJson?.referenceContextSnapshot?.assignmentBrief?.title || "",
        criteriaSet: rows.map((r: any) => String(r?.code || "").trim().toUpperCase()).filter(Boolean),
      },
    });
  }, [structuredGrading, submission, selectedAssessment]);
  const pageFeedbackBySection = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; notes: typeof pageFeedbackMap }>();
    for (const note of pageFeedbackMap) {
      const label = String(note.sectionLabel || "General");
      const key = String(note.sectionId || "general");
      if (!groups.has(key)) groups.set(key, { key, label, notes: [] as any });
      groups.get(key)!.notes.push(note);
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pageFeedbackMap]);
  const notePages = useMemo(() => pageFeedbackMap.map((p) => p.page).filter((n) => Number.isInteger(n) && n > 0), [pageFeedbackMap]);
  const selectedAssessmentDiff = useMemo(() => {
    const idx = gradingHistory.findIndex((a) => a.id === selectedAssessment?.id);
    if (idx < 0 || idx >= gradingHistory.length - 1) return null;
    const older = gradingHistory[idx + 1];
    const newer = selectedAssessment;
    const diff: string[] = [];
    if (String(newer?.overallGrade || "") !== String(older?.overallGrade || "")) {
      diff.push(`Grade changed: ${older?.overallGrade || "—"} -> ${newer?.overallGrade || "—"}`);
    }
    if (String(newer?.feedbackText || "").trim() !== String(older?.feedbackText || "").trim()) {
      diff.push("Feedback text changed");
    }
    const newerNotes = buildPageNotesFromCriterionChecks(
      Array.isArray((newer as any)?.resultJson?.response?.criterionChecks)
        ? (newer as any).resultJson.response.criterionChecks
        : [],
      { maxPages: 20, maxLinesPerPage: 8 }
    );
    const olderNotes = buildPageNotesFromCriterionChecks(
      Array.isArray((older as any)?.resultJson?.response?.criterionChecks)
        ? (older as any).resultJson.response.criterionChecks
        : [],
      { maxPages: 20, maxLinesPerPage: 8 }
    );
    if (JSON.stringify(newerNotes) !== JSON.stringify(olderNotes)) {
      diff.push("Page notes changed");
    }
    return diff.length ? diff : null;
  }, [gradingHistory, selectedAssessment]);
  const selectedResultJson = useMemo(() => {
    const rj = selectedAssessment?.resultJson;
    return rj && typeof rj === "object" ? (rj as Record<string, any>) : ({} as Record<string, any>);
  }, [selectedAssessment]);
  const criterionOverrideMap = useMemo(() => {
    const arr = Array.isArray(selectedResultJson?.assessorCriterionOverrides)
      ? selectedResultJson.assessorCriterionOverrides
      : [];
    const map = new Map<string, any>();
    for (const row of arr) {
      const code = String(row?.code || "").trim().toUpperCase();
      if (!/^[PMD]\d{1,2}$/.test(code)) continue;
      map.set(code, row);
    }
    return map;
  }, [selectedResultJson]);
  const gradeRunConfidenceSignals = useMemo(() => {
    const signals = selectedResultJson?.confidenceSignals || {};
    const extraction = Number(signals?.extractionConfidence);
    const grading = Number(signals?.gradingConfidence);
    return {
      extraction: Number.isFinite(extraction) ? extraction : null,
      grading: Number.isFinite(grading) ? grading : null,
    };
  }, [selectedResultJson]);
  const gradeRunPolicy = useMemo(() => {
    const gp = selectedResultJson?.gradePolicy || null;
    return gp && typeof gp === "object" ? gp : null;
  }, [selectedResultJson]);
  const gradeRunConfidencePolicy = useMemo(() => {
    const cp = selectedResultJson?.confidencePolicy || null;
    return cp && typeof cp === "object" ? cp : null;
  }, [selectedResultJson]);
  const gradeRunCriteriaSnapshot = useMemo(() => {
    const snap = selectedResultJson?.criteriaSnapshot || null;
    return snap && typeof snap === "object" ? snap : null;
  }, [selectedResultJson]);
  const gradeRunExcludedCriteriaCodes = useMemo(() => {
    const arr = Array.isArray(gradeRunCriteriaSnapshot?.excludedCriteriaCodes)
      ? gradeRunCriteriaSnapshot.excludedCriteriaCodes
      : [];
    const normalized = Array.from(
      new Set(
        arr
          .map((v: unknown) => String(v || "").trim().toUpperCase())
          .filter((v: string) => /^[PMD]\d{1,2}$/.test(v))
      )
    ) as string[];
    return normalized.sort((a, b) => a.localeCompare(b));
  }, [gradeRunCriteriaSnapshot]);
  const gradeCapDetailTooltip = useMemo(() => {
    const missing = gradeRunPolicy?.criteriaBandCap?.missing || {};
    const pass = Array.isArray(missing?.pass) ? missing.pass.filter(Boolean) : [];
    const merit = Array.isArray(missing?.merit) ? missing.merit.filter(Boolean) : [];
    const dist = Array.isArray(missing?.distinction) ? missing.distinction.filter(Boolean) : [];
    const lines: string[] = [];
    if (pass.length) lines.push(`Missing Pass: ${pass.join(", ")}`);
    if (merit.length) lines.push(`Missing Merit: ${merit.join(", ")}`);
    if (dist.length) lines.push(`Missing Distinction: ${dist.join(", ")}`);
    return lines.join("\n");
  }, [gradeRunPolicy]);
  const gradeCapReasonLabel = useMemo(() => {
    const criteriaCapReason = String(gradeRunPolicy?.criteriaBandCap?.capReason || "").trim().toUpperCase();
    const resubCapReason = String(gradeRunPolicy?.capReason || "").trim().toUpperCase();
    const reason = criteriaCapReason || resubCapReason;
    if (!reason) return "";
    const map: Record<string, string> = {
      CAPPED_DUE_TO_MISSING_PASS: "Cap: missing Pass criteria",
      CAPPED_DUE_TO_MISSING_MERIT: "Cap: missing Merit criteria",
      CAPPED_DUE_TO_MISSING_DISTINCTION: "Cap: missing Distinction criteria",
      CAPPED_DUE_TO_RESUBMISSION: "Cap: resubmission policy",
    };
    return map[reason] || `Cap: ${reason}`;
  }, [gradeRunPolicy]);
  const gradeRunReferenceSnapshot = useMemo(() => {
    const snapshot = selectedResultJson?.referenceContextSnapshot || null;
    return snapshot && typeof snapshot === "object" ? snapshot : null;
  }, [selectedResultJson]);
  const gradeRunEvidenceDensityRows = useMemo(() => {
    const rows = selectedResultJson?.evidenceDensityByCriterion;
    return Array.isArray(rows) ? rows : [];
  }, [selectedResultJson]);
  const gradeRunEvidenceDensitySummary = useMemo(() => {
    const summary = selectedResultJson?.evidenceDensitySummary || {};
    return {
      criteriaCount: Number(summary?.criteriaCount || 0),
      totalCitations: Number(summary?.totalCitations || 0),
      totalWordsCited: Number(summary?.totalWordsCited || 0),
      criteriaWithoutEvidence: Number(summary?.criteriaWithoutEvidence || 0),
    };
  }, [selectedResultJson]);
  const gradeRunRerunIntegrity = useMemo(() => {
    const v = selectedResultJson?.rerunIntegrity || null;
    return v && typeof v === "object" ? v : null;
  }, [selectedResultJson]);
  const gradeRunReadinessChecklist = useMemo(() => {
    const v = selectedResultJson?.readinessChecklist || null;
    return v && typeof v === "object" ? v : null;
  }, [selectedResultJson]);
  const auditPressure = useMemo(() => {
    const issues: string[] = [];
    let score = 0;

    if (feedbackDirty) {
      issues.push("Unsaved feedback edits");
      score += 2;
    }
    if (gradeRunPolicy?.wasCapped) {
      issues.push(`Policy cap applied (${String(gradeRunPolicy.capReason || "rule")})`);
      score += 2;
    }
    if (gradeRunExcludedCriteriaCodes.length > 0) {
      issues.push(`Brief has excluded grading criteria (${gradeRunExcludedCriteriaCodes.join(", ")})`);
      score += 1;
    }
    if (gradeRunConfidenceSignals.extraction !== null) {
      if (gradeRunConfidenceSignals.extraction < 0.65) {
        issues.push(`Low extraction confidence (${gradeRunConfidenceSignals.extraction.toFixed(2)})`);
        score += 2;
      } else if (gradeRunConfidenceSignals.extraction < 0.8) {
        issues.push(`Borderline extraction confidence (${gradeRunConfidenceSignals.extraction.toFixed(2)})`);
        score += 1;
      }
    }
    if (gradeRunConfidenceSignals.grading !== null) {
      if (gradeRunConfidenceSignals.grading < 0.65) {
        issues.push(`Low grading confidence (${gradeRunConfidenceSignals.grading.toFixed(2)})`);
        score += 2;
      } else if (gradeRunConfidenceSignals.grading < 0.8) {
        issues.push(`Borderline grading confidence (${gradeRunConfidenceSignals.grading.toFixed(2)})`);
        score += 1;
      }
    }
    if (gradeRunEvidenceDensitySummary.criteriaWithoutEvidence > 0) {
      issues.push(`Criteria missing evidence (${gradeRunEvidenceDensitySummary.criteriaWithoutEvidence})`);
      score += Math.min(2, gradeRunEvidenceDensitySummary.criteriaWithoutEvidence);
    }
    const readinessFailures = gradeRunReadinessChecklist
      ? Object.entries(gradeRunReadinessChecklist).filter(([, ok]) => !Boolean(ok)).map(([key]) => key)
      : [];
    if (readinessFailures.length > 0) {
      issues.push(`Readiness checks failed (${readinessFailures.length})`);
      score += 2;
    }
    if (!selectedAssessment?.annotatedPdfPath) {
      issues.push("Marked PDF not generated");
      score += 1;
    }

    const severity = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
    return { score, severity, issues, readinessFailures };
  }, [
    feedbackDirty,
    gradeRunPolicy,
    gradeRunExcludedCriteriaCodes,
    gradeRunConfidenceSignals,
    gradeRunEvidenceDensitySummary,
    gradeRunReadinessChecklist,
    selectedAssessment?.annotatedPdfPath,
  ]);

  const checklist = useMemo(() => {
    const studentLinked = !!submission?.student;
    const assignmentLinked = !!submission?.assignment;
    const extractionComplete = latestRun?.status === "DONE" || latestRun?.status === "NEEDS_OCR";
    const gradeGenerated = !!latestAssessment?.overallGrade;
    const feedbackGenerated = !!String(latestAssessment?.feedbackText || "").trim();
    const markedPdfGenerated = !!latestAssessment?.annotatedPdfPath;

    const readyToUpload =
      studentLinked &&
      assignmentLinked &&
      extractionComplete &&
      gradeGenerated &&
      feedbackGenerated &&
      markedPdfGenerated;

    const items = [
      { key: "student", label: "Student linked", ok: studentLinked, hint: "Link or create student profile." },
      { key: "assignment", label: "Assignment linked", ok: assignmentLinked, hint: "Confirm brief/spec binding." },
      { key: "extraction", label: "Extraction complete", ok: extractionComplete, hint: "Run extraction and review warnings." },
      { key: "grade", label: "Grade generated", ok: gradeGenerated, hint: "Preview grade, then save grade to audit." },
      { key: "feedback", label: "Feedback generated", ok: feedbackGenerated, hint: "Ensure feedback text is present." },
      { key: "marked", label: "Marked PDF", ok: markedPdfGenerated, hint: "Generate marked PDF from grading run." },
    ];
    const firstPending = items.find((i) => !i.ok);

    return {
      studentLinked,
      assignmentLinked,
      extractionComplete,
      gradeGenerated,
      feedbackGenerated,
      markedPdfGenerated,
      readyToUpload,
      items,
      pendingCount: items.filter((i) => !i.ok).length,
      nextBlockingAction: firstPending ? `${firstPending.label}: ${firstPending.hint}` : "Ready to upload to Totara.",
    };
  }, [submission, latestRun, latestAssessment]);

  const modalityCompliance = useMemo(() => {
    const reqsRaw = Array.isArray(selectedAssessment?.resultJson?.assessmentRequirements)
      ? (selectedAssessment?.resultJson?.assessmentRequirements as AssessmentRequirement[])
      : [];
    const evidence = (selectedAssessment?.resultJson?.submissionAssessmentEvidence || {}) as Record<string, any>;

    const found = {
      table: Boolean(evidence.hasTableWords) || Number(evidence.dataRowLikeCount || 0) >= 2,
      bar: Boolean(evidence.hasBarWords),
      pie: Boolean(evidence.hasPieWords),
      graph: Boolean(evidence.hasFigureWords),
      image: Boolean(evidence.hasImageWords) || Boolean(evidence.hasFigureWords),
      equation:
        Boolean(evidence.hasEqMarker) ||
        Boolean(evidence.hasEquationTokenWords) ||
        Number(evidence.equationLikeLineCount || 0) > 0,
      percentage: Number(evidence.percentageCount || 0) > 0,
    };

    const rows = reqsRaw.map((r, idx) => {
      const charts = Array.isArray(r.charts) ? r.charts.map((c) => String(c || "").toLowerCase()) : [];
      const chartRequired = charts.length > 0;
      const chartFound = !chartRequired
        ? true
        : charts.every((c) => (c === "bar" ? found.bar : c === "pie" ? found.pie : found.graph));
      const tableRequired = !!r.needsTable;
      const tableFound = !tableRequired || found.table;
      const equationRequired = !!r.needsEquation;
      const equationFound = !equationRequired || found.equation;
      const imageRequired = !!r.needsImage;
      const imageFound = !imageRequired || found.image;
      const percentageRequired = !!r.needsPercentage;
      const percentageFound = !percentageRequired || found.percentage;
      const ok = chartFound && tableFound && equationFound && imageFound && percentageFound;
      return {
        id: `${String(r.task || "Task")}-${String(r.section || "task")}-${idx}`,
        task: String(r.task || "Task"),
        section: normalizeRequirementSection(r.section),
        required: {
          chart: chartRequired ? charts.join(", ") : "—",
          table: tableRequired ? "Yes" : "—",
          equation: equationRequired ? "Yes" : "—",
          image: imageRequired ? "Yes" : "—",
          percentage: percentageRequired ? "Yes" : "—",
        },
        found: {
          chart: chartRequired ? (chartFound ? "Yes" : "No") : "—",
          table: tableRequired ? (tableFound ? "Yes" : "No") : "—",
          equation: equationRequired ? (equationFound ? "Yes" : "No") : "—",
          image: imageRequired ? (imageFound ? "Yes" : "No") : "—",
          percentage: percentageRequired ? (percentageFound ? "Yes" : "No") : "—",
        },
        ok,
      };
    });

    return {
      rows,
      foundSignals: found,
      hasData: rows.length > 0,
      passCount: rows.filter((r) => r.ok).length,
      failCount: rows.filter((r) => !r.ok).length,
    };
  }, [selectedAssessment]);

  /* =========================
     Data loading
  ========================= */

  async function refresh() {
    if (!submissionId) return;
    const seq = ++refreshSeq.current;
    const data = await jsonFetch<{ submission: Submission }>(
      `/api/submissions/${submissionId}?t=${Date.now()}`,
      { cache: "no-store" }
    );
    if (seq !== refreshSeq.current) return;
    setSubmission(data.submission);
  }

  useEffect(() => {
    if (!submissionId) return;
    refresh().catch((e) => setErr(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  useEffect(() => {
    if (!submissionId) return;
    if (sidePanelsInitializedForSubmission.current === submissionId) return;
    sidePanelsInitializedForSubmission.current = submissionId;
      const closeAll = () => {
      const panels = [
        quickActionsPanelRef.current,
        studentPanelRef.current,
        assignmentPanelRef.current,
        extractionPanelRef.current,
        outputsPanelRef.current,
      ];
      for (const panel of panels) {
        if (panel) panel.open = false;
      }
      if (quickActionsPanelRef.current) quickActionsPanelRef.current.open = true;
    };
    const timer = window.setTimeout(closeAll, 0);
    return () => window.clearTimeout(timer);
  }, [submissionId]);

  useEffect(() => {
    let cancelled = false;
    async function loadCfg() {
      try {
        const res = await jsonFetch<GradingConfig>("/api/admin/grading-config", { cache: "no-store" });
        if (cancelled) return;
        let nextCfg = res;
        try {
          const modelCfg = await jsonFetch<{ model?: string }>("/api/admin/openai-model", { cache: "no-store" });
          const activeModel = String(modelCfg?.model || "").trim();
          if (activeModel) nextCfg = { ...res, model: activeModel };
        } catch {
          // Keep grading config model when OpenAI model endpoint is unavailable.
        }
        setGradingCfg(nextCfg);
        setTone(res.tone);
        setStrictness(res.strictness);
        setUseRubric(!!res.useRubricIfAvailable);
      } catch {
        // keep defaults
      }
      try {
        const cfg = await jsonFetch<AppConfigPayload>("/api/admin/app-config", { cache: "no-store" });
        const name = String(cfg?.activeAuditUser?.fullName || "").trim();
        if (!cancelled) setActiveAuditActorName(name || "system");
      } catch {
        if (!cancelled) setActiveAuditActorName("system");
      }
    }
    loadCfg();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadAssignments() {
      try {
        const list = await jsonFetch<AssignmentOption[]>("/api/assignments", { cache: "no-store" });
        if (alive) setAssignmentOptions(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setAssignmentOptions([]);
      }
    }
    loadAssignments();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setSelectedAssignmentId(String(submission?.assignment?.id || ""));
  }, [submission?.assignment?.id]);

  useEffect(() => {
    if (submission?.assignment?.id) return;
    if (!assignmentOptions.length) return;

    // Keep explicit user selection if it's still a valid option.
    if (selectedAssignmentId && assignmentOptions.some((opt) => opt.id === selectedAssignmentId)) return;

    const unitCandidate =
      normalizeUnitCodeForMatch(coverUnitCode) ||
      normalizeUnitCodeForMatch(triageInfo?.unitCode) ||
      normalizeUnitCodeForMatch(coverMeta?.unitCode?.value);
    const assignmentCandidate =
      normalizeAssignmentRefForMatch(coverAssignmentCode) ||
      normalizeAssignmentRefForMatch(triageInfo?.assignmentRef) ||
      normalizeAssignmentRefForMatch(coverMeta?.assignmentCode?.value);

    if (!unitCandidate || !assignmentCandidate) return;

    const match = assignmentOptions.find(
      (opt) =>
        normalizeUnitCodeForMatch(opt.unitCode) === unitCandidate &&
        normalizeAssignmentRefForMatch(opt.assignmentRef) === assignmentCandidate
    );
    if (match) setSelectedAssignmentId(match.id);
  }, [
    submission?.assignment?.id,
    assignmentOptions,
    selectedAssignmentId,
    coverUnitCode,
    coverAssignmentCode,
    triageInfo?.unitCode,
    triageInfo?.assignmentRef,
    coverMeta,
  ]);

  useEffect(() => {
    if (!submissionId) return;
    if (!submission) return;
    const hasRun = (submission.extractionRuns?.length ?? 0) > 0;
    const isFresh = submission.status === "UPLOADED" && !hasRun;
    if (!isFresh) return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    runExtraction().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, submission]);

  /* =========================
     Extraction + Triage
  ========================= */

  async function runExtraction() {
    if (!submissionId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setTriageInfo(null);
    try {
      await jsonFetch(`/api/submissions/${submissionId}/extract`, { method: "POST" });
      const triage = await jsonFetch<{ triage?: TriageInfo; submission?: Submission }>(
        `/api/submissions/${submissionId}/triage`,
        { method: "POST" }
      );
      if (triage.triage) setTriageInfo(triage.triage);
      if (triage.submission) setSubmission(triage.submission);
      await refresh();
      setMsg("Extraction complete.");
      notifyToast("success", "Submission extracted.");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runGrading(options?: { dryRun?: boolean }) {
    if (!submissionId) return;
    const dryRun = !!options?.dryRun;
    setGradingBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<any>(`/api/submissions/${submissionId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone,
          strictness,
          useRubricIfAvailable: useRubric,
          dryRun,
        }),
      });
      if (dryRun) {
        setGradingPreview((res?.preview || null) as GradePreview | null);
        setMsg(
          `Preview only (not saved): ${String(res?.preview?.overallGrade || "unknown")} · confidence ${Number(res?.preview?.confidence || 0).toFixed(2)}`
        );
        notifyToast("success", "Preview generated. Not saved to audit.");
        setLastActionNote(`Preview generated at ${new Date().toLocaleString()} (not committed)`);
      } else {
        setGradingPreview(null);
        // Always switch editor/view back to latest run after commit.
        setSelectedAssessmentId("");
        await refresh();
        setMsg(`Grading complete: ${String(res?.assessment?.overallGrade || "done")}`);
        notifyToast("success", "Grading complete.");
        setPdfView("marked");
        openAndScroll("outputs");
        setLastActionNote(`Grading committed to audit at ${new Date().toLocaleString()}`);
      }
    } catch (e: any) {
      const message = e?.message || "Grading failed.";
      setErr(message);
      notifyToast("error", message);
    } finally {
      setGradingBusy(false);
    }
  }

  async function saveCoverMetadata(options?: { silent?: boolean }) {
    if (!submissionId || !latestRun) return;
    setCoverEditBusy(true);
    setCoverSaveState("saving");
    if (!options?.silent) {
      setErr("");
      setMsg("");
    }
    try {
      const mkField = (value: string) => {
        const v = String(value || "").trim();
        if (!v) return undefined;
        return { value: v, confidence: 1, page: 1, snippet: "manual override" };
      };
      const nextCover = {
        ...(coverMeta && typeof coverMeta === "object" ? coverMeta : {}),
        studentName: mkField(coverStudentName),
        studentId: mkField(coverStudentId),
        unitCode: mkField(coverUnitCode),
        assignmentCode: mkField(coverAssignmentCode),
        submissionDate: mkField(coverSubmissionDate),
      };
      await jsonFetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverMetadata: nextCover }),
      });
      await jsonFetch(`/api/submissions/${submissionId}/triage`, { method: "POST" }).catch(() => null);
      await refresh();
      setCoverSaveState("saved");
      window.setTimeout(() => setCoverSaveState("idle"), 1200);
      if (!options?.silent) {
        setMsg("Cover metadata updated.");
        notifyToast("success", "Cover metadata saved.");
      }
    } catch (e: any) {
      const message = e?.message || "Failed to save cover metadata.";
      setCoverSaveState("idle");
      if (!options?.silent) {
        setErr(message);
        notifyToast("error", message);
      }
    } finally {
      setCoverEditBusy(false);
    }
  }

  /* =========================
     Student search
  ========================= */

  useEffect(() => {
    let alive = true;
    const q = studentQuery.trim();
    if (q.length < 2) {
      setStudentResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await jsonFetch<any>(`/api/students?query=${encodeURIComponent(q)}`);
        const list = (Array.isArray(res) ? res : res?.students) as StudentSearchResult[] | undefined;
        if (alive) setStudentResults(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setStudentResults([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [studentQuery]);

  async function linkAssignment(assignmentId: string | null) {
    if (!submissionId) return;
    setAssignmentBusy(true);
    setErr("");
    setMsg("");
    try {
      const nextAssignmentId = String(assignmentId || "").trim();
      await jsonFetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: nextAssignmentId || null }),
      });
      await jsonFetch(`/api/submissions/${submissionId}/triage`, { method: "POST" }).catch(() => null);
      await refresh();
      setMsg(nextAssignmentId ? "Assignment linked." : "Assignment cleared.");
    } catch (e: any) {
      setErr(e?.message || "Assignment update failed.");
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function linkStudent(studentId: string) {
    if (!studentId) return;
    setStudentBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<{ submission: Submission }>(
        `/api/submissions/${submissionId}/link-student`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId }),
        }
      );
      setSubmission(res.submission);
      await refresh();
      setMsg("Student linked.");
    } catch (e: any) {
      setErr(e?.message || "Link failed");
    } finally {
      setStudentBusy(false);
    }
  }

  async function unlinkStudent() {
    setStudentBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<{ submission: Submission }>(
        `/api/submissions/${submissionId}/unlink-student`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      setSubmission(res.submission);
      await refresh();
      setMsg("Student unlinked.");
    } catch (e: any) {
      setErr(e?.message || "Unlink failed");
    } finally {
      setStudentBusy(false);
    }
  }

  async function createStudentAndLink() {
    const fullName = newStudentName.trim();
    if (!fullName) return;
    setStudentBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<any>(`/api/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email: newStudentEmail.trim() || null }),
      });
      const student = (res?.student ?? res) as StudentSearchResult;
      if (student?.id) await linkStudent(student.id);
      setNewStudentName("");
      setNewStudentEmail("");
    } finally {
      setStudentBusy(false);
    }
  }

  const pdfUrl = submissionId ? `/api/submissions/${submissionId}/file?t=${Date.now()}` : "";
  const markedPdfUrl = submissionId ? buildMarkedPdfUrl(submissionId, selectedAssessmentId, Date.now()) : "";
  const hasMarkedPdf = !!selectedAssessment?.annotatedPdfPath;
  const activePdfBaseUrl = pdfView === "marked" && hasMarkedPdf ? markedPdfUrl : pdfUrl;
  const activePdfUrl = `${activePdfBaseUrl}${pdfJumpPage ? `#page=${pdfJumpPage}` : ""}`;
  const toggleStudentPanel = () => {
    const panel = studentPanelRef.current;
    if (!panel) return;
    const nextOpen = !panel.open;
    if (nextOpen) {
      openSidePanel("student");
    } else {
      panel.open = false;
    }
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    if (nextOpen) {
      window.setTimeout(() => studentSearchInputRef.current?.focus(), 180);
    }
  };
  const scrollToPanel = (panel: HTMLElement | null) => {
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openAndScroll = (target: "student" | "assignment" | "extraction" | "outputs") => {
    openSidePanel(target);
    const map: Record<string, HTMLElement | null> = {
      student: studentPanelRef.current,
      assignment: assignmentPanelRef.current,
      extraction: extractionPanelRef.current,
      outputs: outputsPanelRef.current,
    };
    scrollToPanel(map[target]);
  };
  const openSidePanel = (target: "student" | "assignment" | "extraction" | "outputs") => {
    const panels: Record<string, HTMLDetailsElement | null> = {
      student: studentPanelRef.current,
      assignment: assignmentPanelRef.current,
      extraction: extractionPanelRef.current,
      outputs: outputsPanelRef.current,
    };
    Object.entries(panels).forEach(([key, panel]) => {
      if (!panel) return;
      panel.open = key === target;
    });
  };
  const openSingleOutputSection = (panel: HTMLDetailsElement) => {
    if (!panel.open) return;
    const container = outputsAccordionRef.current;
    if (!container) return;
    const sections = container.querySelectorAll<HTMLDetailsElement>('details[data-output-section="true"]');
    sections.forEach((section) => {
      if (section !== panel) section.open = false;
    });
  };
  const openCoverEditorAndFocus = (
    field: "studentName" | "studentId" | "unitCode" | "assignmentCode" | "submissionDate"
  ) => {
    const panel = coverEditorRef.current;
    if (panel) {
      openSidePanel("extraction");
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const focusMap = {
      studentName: coverStudentNameRef,
      studentId: coverStudentIdRef,
      unitCode: coverUnitCodeRef,
      assignmentCode: coverAssignmentCodeRef,
      submissionDate: coverSubmissionDateRef,
    } as const;
    window.setTimeout(() => focusMap[field].current?.focus(), 180);
  };
  const extractionComplete = latestRun?.status === "DONE" || latestRun?.status === "NEEDS_OCR";
  const extractionRunning = busy || submission?.status === "EXTRACTING";
  const canPreviewGrading =
    !!submission?.assignment &&
    extractionComplete &&
    !gradingBusy;
  const canCommitPreview =
    !!submission?.student &&
    !!submission?.assignment &&
    extractionComplete &&
    !gradingBusy;
  const gradingDisabledReason = gradingBusy
    ? "Grading is already running."
    : !submission?.assignment
        ? "Link assignment/brief first."
        : !extractionComplete
          ? "Run extraction before grading."
          : "";
  const commitDisabledReason = !gradingPreview
    ? !submission?.student
      ? "Link student to save grade to audit."
      : !submission?.assignment
        ? "Link assignment/brief first."
        : !extractionComplete
          ? "Run extraction before grading."
          : "Preview recommended first. You can still save directly to audit."
    : !submission?.student
      ? "Link student to save grade to audit."
      : "Save preview as an audited grade";
  const primaryActionLabel = gradingBusy
    ? "Grading…"
    : canPreviewGrading
      ? "Preview grade (no save)"
      : !extractionComplete
        ? extractionRunning
          ? "Extracting…"
          : "Run extraction"
        : "Review blockers";
  const primaryActionDisabled = gradingBusy || extractionRunning;
  const runPrimaryAction = () => {
    if (canPreviewGrading) return void runGrading({ dryRun: true });
    if (!extractionComplete) return void runExtraction();
    scrollToPanel(workflowPanelRef.current);
  };
  const quickActionHint = canCommitPreview
    ? "Preview and save are available."
    : canPreviewGrading
      ? "Preview is available. Link student to save grade to audit."
      : gradingDisabledReason || checklist.nextBlockingAction || "Complete the next blocker to continue.";
  const jumpToNextBlocker = () => {
    const item = checklist.items.find((i) => !i.ok);
    if (!item) return;
    if (item.key === "student") return toggleStudentPanel();
    if (item.key === "assignment") return openAndScroll("assignment");
    if (item.key === "extraction") return void runExtraction();
    if (item.key === "grade") {
      if (canPreviewGrading) return void runGrading({ dryRun: true });
      return scrollToPanel(gradingPanelRef.current);
    }
    if (item.key === "feedback" || item.key === "marked") return openAndScroll("outputs");
  };
  const pdfViewportClass =
    pdfViewport === "compact"
      ? "h-[52vh] min-h-[420px] md:h-[62vh] xl:h-[68vh]"
      : pdfViewport === "full"
        ? "h-[72vh] min-h-[620px] md:h-[82vh] xl:h-[90vh]"
        : "h-[62vh] min-h-[540px] md:h-[72vh] xl:h-[82vh]";

  useEffect(() => {
    if (pdfView === "marked" && !hasMarkedPdf) {
      setPdfView("original");
    }
  }, [pdfView, hasMarkedPdf]);

  useEffect(() => {
    if (!gradingHistory.length) {
      if (selectedAssessmentId) setSelectedAssessmentId("");
      return;
    }
    if (!selectedAssessmentId || !gradingHistory.some((a) => a.id === selectedAssessmentId)) {
      setSelectedAssessmentId(gradingHistory[0].id);
    }
  }, [gradingHistory, selectedAssessmentId]);

  useEffect(() => {
    const a = selectedAssessment;
    if (!a) {
      setFeedbackDraft("");
      setFeedbackStudentName("");
      setFeedbackMarkedDate("");
      return;
    }
    const rj: any = a.resultJson || {};
    const override = rj?.feedbackOverride || {};
    const studentName = String(override?.studentName || rj?.studentFirstNameUsed || submission?.student?.fullName || coverStudentName || "").trim();
    const dateCandidate = String(override?.markedDate || "").trim();
    const iso = dateCandidate || String(a.createdAt || "");
    const d = new Date(iso);
    const dateInput = Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    setFeedbackDraft(String(a.feedbackText || ""));
    setFeedbackStudentName(studentName);
    setFeedbackMarkedDate(dateInput);
    setFeedbackBaseline({ text: String(a.feedbackText || ""), studentName, date: dateInput });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssessment?.id, selectedAssessment?.feedbackText, selectedAssessment?.resultJson, selectedAssessment?.createdAt]);

  useEffect(() => {
    const rows = Array.isArray(structuredGrading?.criterionChecks) ? structuredGrading.criterionChecks : [];
    const next: Record<string, CriterionOverrideDraft> = {};
    for (const row of rows) {
      const code = String(row?.code || "").trim().toUpperCase();
      if (!/^[PMD]\d{1,2}$/.test(code)) continue;
      const existing = criterionOverrideMap.get(code);
      const baseDecision = String(row?.decision || (row?.met === true ? "ACHIEVED" : row?.met === false ? "NOT_ACHIEVED" : "UNCLEAR")).toUpperCase();
      next[code] = {
        finalDecision: (existing?.finalDecision || baseDecision || "UNCLEAR") as CriterionDecision,
        reasonCode: (existing?.reasonCode || "ASSESSOR_JUDGEMENT") as OverrideReasonCode,
        note: String(existing?.note || ""),
      };
    }
    setCriterionOverrideDrafts(next);
  }, [selectedAssessment?.id, structuredGrading, criterionOverrideMap]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!feedbackDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [feedbackDirty]);

  async function saveAssessmentFeedback() {
    if (!submissionId || !selectedAssessment?.id) return;
    if (!feedbackDraft.trim()) {
      setErr("Feedback text cannot be empty.");
      return;
    }
    setFeedbackEditorBusy(true);
    setErr("");
    setMsg("");
    try {
      await jsonFetch(`/api/submissions/${submissionId}/assessments/${selectedAssessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackText: feedbackDraft,
          studentName: feedbackStudentName,
          markedDate: feedbackMarkedDate || null,
        }),
      });
      await refresh();
      setMsg("Audit feedback updated and marked PDF regenerated.");
      notifyToast("success", "Feedback applied to marked PDF.");
      setLastActionNote(`Feedback updated at ${new Date().toLocaleString()} by ${activeAuditActorName}`);
    } catch (e: any) {
      const message = e?.message || "Failed to update feedback.";
      setErr(message);
      notifyToast("error", message);
    } finally {
      setFeedbackEditorBusy(false);
    }
  }

  async function rebuildMarkedPdf() {
    await saveAssessmentFeedback();
  }

  async function regenerateMarkedFromCurrentRun() {
    if (!submissionId || !selectedAssessment?.id) return;
    const rj: any = selectedAssessment.resultJson || {};
    const override = rj?.feedbackOverride || {};
    const currentFeedback = String(selectedAssessment.feedbackText || "").trim();
    if (!currentFeedback) {
      notifyToast("error", "No feedback text available to regenerate marked PDF.");
      return;
    }
    setFeedbackEditorBusy(true);
    setErr("");
    setMsg("");
    try {
      await jsonFetch(`/api/submissions/${submissionId}/assessments/${selectedAssessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackText: currentFeedback,
          studentName: String(override?.studentName || feedbackStudentName || "").trim() || "Student",
          markedDate: String(override?.markedDate || feedbackMarkedDate || "").trim() || null,
        }),
      });
      await refresh();
      setMsg("Marked PDF regenerated with current note settings.");
      notifyToast("success", "Marked PDF regenerated.");
      setLastActionNote(`Marked PDF regenerated at ${new Date().toLocaleString()} by ${activeAuditActorName}`);
    } catch (e: any) {
      const message = e?.message || "Failed to regenerate marked PDF.";
      setErr(message);
      notifyToast("error", message);
    } finally {
      setFeedbackEditorBusy(false);
    }
  }

  async function applyCriterionOverride(code: string) {
    if (!submissionId || !selectedAssessment?.id) return;
    const key = String(code || "").trim().toUpperCase();
    if (!/^[PMD]\d{1,2}$/.test(key)) return;
    const draft = criterionOverrideDrafts[key];
    if (!draft) return;
    setCriterionOverrideBusyCode(key);
    setErr("");
    setMsg("");
    try {
      await jsonFetch(`/api/submissions/${submissionId}/assessments/${selectedAssessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: feedbackStudentName,
          markedDate: feedbackMarkedDate || null,
          criterionOverrides: [
            {
              code: key,
              finalDecision: draft.finalDecision,
              reasonCode: draft.reasonCode,
              note: draft.note || "",
            },
          ],
        }),
      });
      await refresh();
      setMsg(`Override applied for ${key}.`);
      notifyToast("success", `Override applied for ${key}.`);
      setLastActionNote(`Criterion override applied (${key}) at ${new Date().toLocaleString()} by ${activeAuditActorName}`);
    } catch (e: any) {
      const message = e?.message || "Failed to apply criterion override.";
      setErr(message);
      notifyToast("error", message);
    } finally {
      setCriterionOverrideBusyCode(null);
    }
  }

  async function clearCriterionOverride(code: string) {
    if (!submissionId || !selectedAssessment?.id) return;
    const key = String(code || "").trim().toUpperCase();
    if (!/^[PMD]\d{1,2}$/.test(key)) return;
    setCriterionOverrideBusyCode(key);
    setErr("");
    setMsg("");
    try {
      await jsonFetch(`/api/submissions/${submissionId}/assessments/${selectedAssessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: feedbackStudentName,
          markedDate: feedbackMarkedDate || null,
          criterionOverrides: [{ code: key, remove: true }],
        }),
      });
      await refresh();
      setMsg(`Override cleared for ${key}.`);
      notifyToast("success", `Override cleared for ${key}.`);
      setLastActionNote(`Criterion override cleared (${key}) at ${new Date().toLocaleString()} by ${activeAuditActorName}`);
    } catch (e: any) {
      const message = e?.message || "Failed to clear criterion override.";
      setErr(message);
      notifyToast("error", message);
    } finally {
      setCriterionOverrideBusyCode(null);
    }
  }

  async function copyText(label: string, text: string) {
    const payload = String(text || "").trim();
    if (!payload) {
      notifyToast("error", `Nothing to copy for ${label}.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      notifyToast("success", `${label} copied.`);
    } catch {
      notifyToast("error", `Failed to copy ${label}.`);
    }
  }

  function toAbsoluteUrl(url: string) {
    const src = String(url || "").trim();
    if (!src) return "";
    if (/^https?:\/\//i.test(src)) return src;
    if (typeof window === "undefined") return src;
    try {
      return new URL(src, window.location.origin).toString();
    } catch {
      return src;
    }
  }

  async function copyOverallFeedbackPack() {
    const feedback = String(studentFeedbackPreview || "").trim();
    if (!feedback) {
      notifyToast("error", "Nothing to copy for overall feedback.");
      return;
    }
    const markedLink = selectedAssessment?.annotatedPdfPath ? toAbsoluteUrl(markedPdfUrl) : "";
    const payload = markedLink ? `${feedback}\n\nMarked version link: ${markedLink}` : feedback;
    await copyText("Overall feedback", payload);
  }

  function buildCriterionDecisionsText() {
    const rows = Array.isArray(structuredGrading?.criterionChecks) ? structuredGrading.criterionChecks : [];
    if (!rows.length) return "";
    return rows
      .map((row: any) => {
        const code = String(row?.code || "—");
        const decision = String(row?.decision || (row?.met === true ? "ACHIEVED" : row?.met === false ? "NOT_ACHIEVED" : "UNCLEAR")).toUpperCase();
        const rationale = String(row?.rationale || row?.comment || "").trim();
        return `${code}: ${decision}${rationale ? ` - ${rationale}` : ""}`;
      })
      .join("\n");
  }

  useEffect(() => {
    if (!latestRun) return;
    if (!coverEditorRef.current?.open) return;
    const t = setTimeout(() => {
      void saveCoverMetadata({ silent: true });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverStudentName, coverStudentId, coverUnitCode, coverAssignmentCode, coverSubmissionDate, latestRun?.id]);

  useEffect(() => {
    if (!runGradeWhenReady) return;
    if (!canPreviewGrading) return;
    void runGrading({ dryRun: true });
    setRunGradeWhenReady(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runGradeWhenReady, canPreviewGrading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = String(target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const k = e.key.toLowerCase();
      if (k === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (k === "e") {
        e.preventDefault();
        void runExtraction();
      } else if (k === "g") {
        e.preventDefault();
        if (canPreviewGrading) void runGrading({ dryRun: true });
      } else if (k === "s") {
        e.preventDefault();
        toggleStudentPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreviewGrading]);

  return (
    <main className="py-2">
      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-300 bg-gradient-to-r from-slate-100 via-white to-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-900">
              Workflow Operations
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-900">
              Submission Review Workspace
            </h1>
            <p className="mt-1 text-[11px] text-zinc-600">
              {submission?.student?.fullName || triageInfo?.studentName || "Unlinked student"} · {submission?.filename || "Submission"}
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <div className="flex flex-col items-start">
              <Link
                href="/submissions"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-semibold hover:bg-zinc-50"
              >
                ← Back
              </Link>
              <span className="mt-1 text-xs opacity-0">placeholder</span>
            </div>
            <div ref={gradingPanelRef} className="flex flex-col items-start">
              <button
                type="button"
                onClick={runPrimaryAction}
                disabled={primaryActionDisabled}
                className={cx(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[11px] font-semibold shadow-sm",
                  !primaryActionDisabled
                    ? "bg-sky-700 text-white hover:bg-sky-800"
                    : "cursor-not-allowed bg-zinc-300 text-zinc-700"
                )}
              >
                {primaryActionLabel}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 text-[11px]">
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-800">
            Unit <span className="font-semibold text-zinc-900">{submission?.assignment?.unitCode || triageInfo?.unitCode || "—"}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-800">
            Assignment <span className="font-semibold text-zinc-900">{submission?.assignment?.assignmentRef || triageInfo?.assignmentRef || "—"}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-900">
            Status <span className="font-semibold">{submission?.status || "—"}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-800">
            Uploaded <span className="font-semibold text-zinc-900">{safeDate(submission?.uploadedAt)}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-800">
            Extraction <span className="font-semibold text-zinc-900">{latestRun?.status || "—"}</span>
          </div>
        </div>
      </div>

      <section ref={workflowPanelRef} className="mb-3 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cx(
              "inline-flex h-5 items-center rounded-full border px-2.5 text-xs font-semibold",
              checklist.readyToUpload ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
            )}
          >
            {checklist.readyToUpload ? "Ready to upload" : `${checklist.pendingCount} pending`}
          </span>
          <div className="min-w-[240px] flex-1 text-xs text-zinc-600">{checklist.nextBlockingAction}</div>
          {!checklist.readyToUpload ? (
            <button
              type="button"
              onClick={jumpToNextBlocker}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Fix next blocker
            </button>
          ) : null}
          {!canPreviewGrading && gradingDisabledReason ? (
            <span className="text-xs font-semibold text-amber-800">Grading blocked: {gradingDisabledReason}</span>
          ) : null}
          {canPreviewGrading && !submission?.student ? (
            <span className="text-xs font-semibold text-amber-800">Preview available. Link student to save grade to audit.</span>
          ) : null}
          <span className="ml-auto inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
            Assessor source: {activeAuditActorName}
          </span>
        </div>
      </section>

      {(err || msg) && (
        <div
          className={cx(
            "mb-4 rounded-xl border p-3 text-sm",
            err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {err || msg}
        </div>
      )}
      {gradingConfigOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Grading config</div>
                <div className="mt-1 text-sm text-zinc-700">Configure settings used when you run grading.</div>
              </div>
              <button
                type="button"
                onClick={() => setGradingConfigOpen(false)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm text-zinc-700">
                Tone
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                >
                  <option value="supportive">Supportive</option>
                  <option value="professional">Professional</option>
                  <option value="strict">Strict</option>
                </select>
              </label>
              <label className="text-sm text-zinc-700">
                Strictness
                <select
                  value={strictness}
                  onChange={(e) => setStrictness(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                >
                  <option value="lenient">Lenient</option>
                  <option value="balanced">Balanced</option>
                  <option value="strict">Strict</option>
                </select>
              </label>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300"
                checked={useRubric}
                onChange={(e) => setUseRubric(e.target.checked)}
              />
              Use rubric when linked to this brief
            </label>
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
              Model: {gradingCfg?.model || "default"} · Feedback bullets: {gradingCfg?.maxFeedbackBullets ?? 6}
            </div>
          </div>
        </div>
      ) : null}
      {shortcutsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Keyboard shortcuts</div>
                <div className="mt-1 text-sm text-zinc-700">Quick actions for this submission page.</div>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
              <div><span className="font-semibold text-zinc-900">?</span> Toggle this shortcuts panel</div>
              <div><span className="font-semibold text-zinc-900">E</span> Run extraction</div>
              <div><span className="font-semibold text-zinc-900">G</span> Run grading preview (no save)</div>
              <div><span className="font-semibold text-zinc-900">S</span> Toggle student panel</div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-3 flex flex-wrap items-center gap-2">
        {[
          { key: "checklist", label: "Checklist", ok: checklist.readyToUpload, onClick: () => scrollToPanel(workflowPanelRef.current) },
          { key: "student", label: "Student", ok: checklist.studentLinked, onClick: () => openAndScroll("student") },
          { key: "assignment", label: "Assignment", ok: checklist.assignmentLinked, onClick: () => openAndScroll("assignment") },
          { key: "extraction", label: "Extraction", ok: checklist.extractionComplete, onClick: () => openAndScroll("extraction") },
          { key: "grading", label: "Grading", ok: checklist.gradeGenerated, onClick: () => scrollToPanel(gradingPanelRef.current) },
          { key: "outputs", label: "Outputs", ok: checklist.feedbackGenerated && checklist.markedPdfGenerated, onClick: () => openAndScroll("outputs") },
        ].map((nav) => (
          <button key={nav.key} type="button" onClick={nav.onClick} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <span className={cx("h-1.5 w-1.5 rounded-full", nav.ok ? "bg-emerald-500" : "bg-amber-500")} />
            {nav.label}
          </button>
        ))}
      </section>

      <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-9">
          {[
            {
              key: "student",
              label: "Student",
              value: submission?.student?.fullName || triageInfo?.studentName || "Unlinked",
              actionable: true,
              actionLabel: !String(coverMeta?.studentName?.value || "").trim() ? "Add cover name" : "Toggle student panel",
              onAction: !String(coverMeta?.studentName?.value || "").trim()
                ? () => openCoverEditorAndFocus("studentName")
                : toggleStudentPanel,
            },
            {
              key: "unit",
              label: "Unit",
              value:
                submission?.assignment?.unitCode ||
                triageInfo?.unitCode ||
                String(coverMeta?.unitCode?.value || "—"),
              actionable: !String(coverMeta?.unitCode?.value || "").trim(),
              actionLabel: "Add",
              onAction: () => openCoverEditorAndFocus("unitCode"),
            },
            {
              key: "assignment",
              label: "Assignment",
              value:
                submission?.assignment?.assignmentRef ||
                triageInfo?.assignmentRef ||
                String(coverMeta?.assignmentCode?.value || "—"),
              actionable: true,
              actionLabel: submission?.assignment ? "Open assignment panel" : "Add",
              onAction: submission?.assignment
                ? () => openAndScroll("assignment")
                : () => openCoverEditorAndFocus("assignmentCode"),
            },
            {
              key: "submissionDate",
              label: "Submission Date",
              value: String(coverMeta?.submissionDate?.value || "Missing"),
              actionable: !String(coverMeta?.submissionDate?.value || "").trim(),
              actionLabel: "Add",
              onAction: () => openCoverEditorAndFocus("submissionDate"),
            },
            {
              key: "grade",
              label: "Grade",
              value: latestAssessment?.overallGrade || "Pending",
              actionable: true,
              actionLabel: canPreviewGrading ? "Preview grade" : "Open checklist",
              onAction: canPreviewGrading ? () => void runGrading({ dryRun: true }) : () => scrollToPanel(workflowPanelRef.current),
            },
            { key: "gradedBy", label: "Graded by", value: String(latestAssessment?.resultJson?.gradedBy || "—"), actionable: false },
            { key: "uploaded", label: "Uploaded", value: safeDate(submission?.uploadedAt), actionable: false },
            { key: "gradedWhen", label: "Graded when", value: safeDate(latestAssessment?.createdAt), actionable: false },
            {
              key: "status",
              label: "Status",
              value: submission?.status || "—",
              actionable: true,
              actionLabel: "Open checklist",
              onAction: () => scrollToPanel(workflowPanelRef.current),
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.actionable ? item.onAction : undefined}
              className={cx(
                "min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left",
                item.actionable ? "cursor-pointer hover:border-sky-300 hover:bg-sky-50" : "cursor-default"
              )}
              title={item.actionable ? item.actionLabel : undefined}
            >
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="truncate">{item.label}</span>
                {item.actionable ? <span className="text-sky-700">•</span> : null}
              </div>
              <div className="truncate text-[12px] font-semibold text-zinc-900">{item.value}</div>
              {item.key === "assignment" && !submission?.assignment ? (
                <div className="mt-1.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={selectedAssignmentId}
                    onChange={(e) => setSelectedAssignmentId(e.target.value)}
                    disabled={assignmentBusy || !assignmentOptions.length}
                    className="h-7 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-1.5 text-[11px] text-zinc-900"
                    title="Select assignment"
                  >
                    <option value="">
                      {assignmentOptions.length ? "Select assignment..." : "No assignments available"}
                    </option>
                    {assignmentOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {`${opt.unitCode} ${opt.assignmentRef || ""}`.trim()} - {opt.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void linkAssignment(selectedAssignmentId || null);
                    }}
                    disabled={!selectedAssignmentId || assignmentBusy}
                    className={cx(
                      "h-7 shrink-0 rounded-md px-2 text-[11px] font-semibold",
                      !selectedAssignmentId || assignmentBusy
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-500"
                        : "bg-sky-700 text-white hover:bg-sky-800"
                    )}
                    title="Link selected assignment"
                  >
                    {assignmentBusy ? "Linking..." : "Link"}
                  </button>
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      {changeChips.length ? (
        <section className="mb-3 flex flex-wrap items-center gap-1.5">
          {changeChips.map((chip) => (
            <span key={chip} className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
              {chip}
            </span>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        {/* RIGHT: PDF */}
        <div className="order-2 lg:order-2 lg:col-span-2">
          <div className="sticky top-2 z-10 mb-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex h-5 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 font-semibold text-zinc-700">
                Run: {selectedRunLabel}
              </span>
              <span className="inline-flex h-5 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 font-semibold text-zinc-700">
                Grade: {selectedAssessment?.overallGrade || "Pending"}
              </span>
              {gradeCapReasonLabel ? (
                <span
                  className="inline-flex h-5 items-center rounded-full border border-amber-200 bg-amber-50 px-2 font-semibold text-amber-900"
                  title={gradeCapDetailTooltip || "Grade capped by policy"}
                >
                  {gradeCapReasonLabel}
                </span>
              ) : null}
              <span className={cx("inline-flex h-5 items-center rounded-full border px-2 font-semibold", feedbackDirty ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
                {feedbackDirty ? "Unsaved feedback" : "Feedback saved"}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
              <div className="flex items-center gap-3">
                <StatusPill>{submission?.status || "—"}</StatusPill>
                <div className="text-sm text-zinc-600">Submission document preview</div>
                <div className="ml-2 inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPdfView("original")}
                    className={cx(
                      "rounded-md px-2 py-1 text-xs font-semibold",
                      pdfView === "original" ? "bg-sky-700 text-white" : "text-zinc-700 hover:bg-white"
                    )}
                  >
                    Student submission
                  </button>
                  <button
                    type="button"
                    onClick={() => hasMarkedPdf && setPdfView("marked")}
                    disabled={!hasMarkedPdf}
                    className={cx(
                      "rounded-md px-2 py-1 text-xs font-semibold",
                      !hasMarkedPdf
                        ? "cursor-not-allowed text-zinc-400"
                        : pdfView === "marked"
                          ? "bg-sky-700 text-white"
                          : "text-zinc-700 hover:bg-white"
                    )}
                    title={!hasMarkedPdf ? "Run grading to generate a marked PDF." : "View graded PDF with feedback overlays."}
                  >
                    Marked version
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">
                  Viewport
                  <select
                    value={pdfViewport}
                    onChange={(e) => setPdfViewport(e.target.value as any)}
                    className="ml-1 rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs"
                  >
                    <option value="compact">Compact</option>
                    <option value="comfort">Comfort</option>
                    <option value="full">Full</option>
                  </select>
                </label>
                <div className="text-xs text-zinc-500">
                  {pdfView === "marked" && hasMarkedPdf ? "Marked PDF" : "Source PDF"}
                </div>
              </div>
            </div>

            <div className={`${pdfViewportClass} relative w-full bg-zinc-50`}>
              {/* PDF render (works for scanned + digital PDFs) */}
              {submissionId ? (
                <iframe
                  title="Submission PDF"
                  src={activePdfUrl}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-600">Loading…</div>
              )}
              <div className="pointer-events-none absolute bottom-2 right-2 z-20">
                <div className="pointer-events-auto rounded-lg border border-zinc-200 bg-white/95 p-1 shadow-sm backdrop-blur">
                  <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Notes</div>
                  {notePages.length ? (
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {notePages.slice(0, 8).map((p) => (
                        <button
                          key={`np-${p}`}
                          type="button"
                          onClick={() => setPdfJumpPage(p)}
                          className={cx(
                            "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold",
                            pdfJumpPage === p
                              ? "border-sky-300 bg-sky-50 text-sky-900"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-1 pb-0.5 text-[10px] text-zinc-500">No page notes yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* LEFT: Metadata + extraction */}
        <div className="order-1 lg:order-1 lg:sticky lg:top-3 lg:max-h-[86vh] lg:overflow-y-auto">
          <div className="grid gap-2">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <details
            ref={quickActionsPanelRef}
            className="group order-1 bg-white"
            open
          >
            <summary className="cursor-pointer list-none px-2 py-0.5 [&::-webkit-details-marker]:hidden">
              <div className="flex h-[28px] items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">▸</span>
                  <span className="truncate">Quick actions</span>
                </span>
                <span className="truncate rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] normal-case text-zinc-700">Action center</span>
              </div>
            </summary>
            <div className="border-t border-zinc-200 p-2">
            <div className="text-[11px] text-zinc-600">{quickActionHint}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void runGrading({ dryRun: true })}
                disabled={!canPreviewGrading}
                className={cx(
                  "h-8 rounded-md px-3 text-[12px] font-semibold",
                  canPreviewGrading ? "bg-sky-700 text-white hover:bg-sky-800" : "cursor-not-allowed bg-zinc-200 text-zinc-500"
                )}
                title={gradingDisabledReason || "Run grading preview (no save)"}
              >
                Preview grade (no save)
              </button>
              <button
                type="button"
                onClick={() => void runGrading({ dryRun: false })}
                disabled={!canCommitPreview}
                className={cx(
                  "h-8 rounded-md px-3 text-[12px] font-semibold",
                  canCommitPreview ? "bg-emerald-700 text-white hover:bg-emerald-800" : "cursor-not-allowed bg-zinc-200 text-zinc-500"
                )}
                title={commitDisabledReason}
              >
                Save grade to audit
              </button>
            </div>
            <details className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5">
              <summary className="cursor-pointer text-[11px] font-semibold text-zinc-700">More tools</summary>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={runExtraction}
                  disabled={busy}
                  className={cx(
                    "h-7 rounded-md border px-2.5 text-[11px] font-semibold",
                    busy
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                  )}
                >
                  {extractionRunning ? "Extracting…" : "Re-run extraction"}
                </button>
                <button
                  type="button"
                  onClick={jumpToNextBlocker}
                  disabled={checklist.readyToUpload}
                  className={cx(
                    "h-7 rounded-md border px-2.5 text-[11px] font-semibold",
                    checklist.readyToUpload
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                  )}
                >
                  Fix next blocker
                </button>
                <button
                  type="button"
                  onClick={() => setGradingConfigOpen(true)}
                  className="h-7 rounded-md border border-zinc-200 bg-white px-2.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Grading config
                </button>
                <button
                  type="button"
                  onClick={() => void regenerateMarkedFromCurrentRun()}
                  disabled={!selectedAssessment?.id || feedbackEditorBusy}
                  className={cx(
                    "h-7 rounded-md border px-2.5 text-[11px] font-semibold",
                    !selectedAssessment?.id || feedbackEditorBusy
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                  )}
                  title={!selectedAssessment?.id ? "No assessment run selected yet." : "Regenerate marked PDF for selected run"}
                >
                  Regenerate marked PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(true)}
                  className="h-7 rounded-md border border-zinc-200 bg-white px-2.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Shortcuts (?)
                </button>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                Preview does not create an assessment record. Save to audit persists grade and feedback.
              </div>
              <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-zinc-700">
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded border-zinc-300"
                  checked={runGradeWhenReady}
                  onChange={(e) => setRunGradeWhenReady(e.target.checked)}
                />
                Auto-run preview when ready (no save)
              </label>
            </details>
            {gradingPreview ? (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-900">
                <div className="font-semibold">
                  Preview: {String(gradingPreview.overallGrade || "—")}{" "}
                  {typeof gradingPreview.confidence === "number" ? `· confidence ${gradingPreview.confidence.toFixed(2)}` : ""}
                </div>
                {gradingPreview.gradePolicy?.wasCapped ? (
                  <div className="mt-0.5">Capped by policy: {String(gradingPreview.gradePolicy.capReason || "yes")}</div>
                ) : null}
                <div className="mt-0.5">
                  Citations: {Number(gradingPreview.evidenceDensitySummary?.totalCitations || 0)} · Criteria without evidence:{" "}
                  {Number(gradingPreview.evidenceDensitySummary?.criteriaWithoutEvidence || 0)}
                </div>
              </div>
            ) : null}
            </div>
          </details>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">

          <details
            ref={studentPanelRef}
            id="student-link-panel"
            className="group order-3 border-b border-zinc-200 bg-white"
            onToggle={(e) => {
              const el = e.currentTarget;
              if (el.open) openSidePanel("student");
            }}
          >
            <summary className="cursor-pointer list-none px-2 py-0.5 [&::-webkit-details-marker]:hidden">
              <div className="flex h-[24px] items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">▸</span>
                  <span className="truncate">Student</span>
                </span>
                <span className={cx("inline-flex h-[16px] items-center rounded-full px-1.5 text-[8px]", checklist.studentLinked ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                  {checklist.studentLinked ? "Linked" : "Pending"}
                </span>
              </div>
            </summary>
            <div className="flex items-start justify-between gap-3 border-t border-zinc-200 px-3 pb-3 pt-2">
              <div>
                <div className="text-base font-semibold text-zinc-900">
                  {submission?.student?.fullName || "Unlinked"}
                </div>
                <div className="mt-0.5 text-sm text-zinc-600">
                  {[submission?.student?.email, submission?.student?.externalRef].filter(Boolean).join(" · ") || "—"}
                </div>
                {triageInfo?.studentName && !submission?.student?.fullName ? (
                  <div className="mt-2 text-xs text-zinc-500">
                    Detected on cover page: <span className="font-semibold text-zinc-900">{triageInfo.studentName}</span>
                  </div>
                ) : null}
              </div>
              {submission?.student ? (
                <button
                  type="button"
                  onClick={unlinkStudent}
                  disabled={studentBusy}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    studentBusy
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                      : "border-zinc-200 bg-white hover:bg-zinc-50"
                  )}
                >
                  Unlink
                </button>
              ) : null}
            </div>

            <div className="px-3 pb-3">
              {!submission?.student ? (
                <div className="mt-3 grid gap-3">
                  <div>
                    <div className="text-sm font-semibold">Find existing student</div>
                    <input
                      ref={studentSearchInputRef}
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      placeholder="Search by name, email, AB number…"
                      className="mt-2 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                    />
                    <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-zinc-200">
                      {studentResults.length === 0 ? (
                        <div className="p-3 text-sm text-zinc-600">No results yet.</div>
                      ) : (
                        <div className="divide-y divide-zinc-100">
                          {studentResults.slice(0, 10).map((st) => (
                            <label key={st.id} className="flex cursor-pointer items-start gap-3 p-3">
                              <input
                                type="radio"
                                name="student"
                                className="mt-1"
                                checked={selectedStudentId === st.id}
                                onChange={() => setSelectedStudentId(st.id)}
                              />
                              <div>
                                <div className="text-sm font-semibold text-zinc-900">{st.fullName}</div>
                                <div className="mt-0.5 text-xs text-zinc-600">{[st.email, st.externalRef].filter(Boolean).join(" · ") || "—"}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => linkStudent(selectedStudentId)}
                      disabled={!selectedStudentId || studentBusy}
                      className={cx(
                        "mt-2 inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold",
                        !selectedStudentId || studentBusy
                          ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                          : "bg-sky-700 text-white hover:bg-sky-800"
                      )}
                    >
                      Link selected
                    </button>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-sm font-semibold text-zinc-900">Quick create</div>
                    <div className="mt-2 grid gap-2">
                      <input
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        placeholder="New student full name"
                        className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                      />
                      <input
                        value={newStudentEmail}
                        onChange={(e) => setNewStudentEmail(e.target.value)}
                        placeholder="Email (optional)"
                        className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={createStudentAndLink}
                        disabled={!newStudentName.trim() || studentBusy}
                        className={cx(
                          "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold",
                          !newStudentName.trim() || studentBusy
                            ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                            : "bg-white text-zinc-900 hover:bg-zinc-100 border border-zinc-200"
                        )}
                      >
                        Create & link
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {submission?.studentLinkedAt ? (
                <div className="mt-3 text-xs text-zinc-500">
                  Linked: {safeDate(submission.studentLinkedAt)}{submission.studentLinkedBy ? ` · by ${submission.studentLinkedBy}` : ""}
                </div>
              ) : null}
            </div>
          </details>

          <details
            ref={assignmentPanelRef}
            className="group order-2 border-b border-zinc-200 bg-white"
            onToggle={(e) => {
              const el = e.currentTarget;
              if (el.open) openSidePanel("assignment");
            }}
          >
            <summary className="cursor-pointer list-none px-2 py-0.5 [&::-webkit-details-marker]:hidden">
              <div className="flex h-[24px] items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">▸</span>
                  <span className="truncate">Assignment</span>
                </span>
                <span className={cx("inline-flex h-[16px] items-center rounded-full px-1.5 text-[8px]", checklist.assignmentLinked ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                  {checklist.assignmentLinked ? "Linked" : "Pending"}
                </span>
              </div>
            </summary>
            <div className="border-t border-zinc-200 px-3 pb-3 pt-2 text-base font-semibold text-zinc-900">
              {submission?.assignment ? `${submission.assignment.unitCode} ${submission.assignment.assignmentRef || ""}`.trim() : "Unassigned"}
            </div>
            <div className="px-3 text-sm text-zinc-600">{submission?.assignment?.title || "—"}</div>

            {triageInfo?.coverage?.missing?.length ? (
              <div className="mx-3 mb-3 mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="text-xs font-semibold uppercase tracking-wide">Reference coverage</div>
                <div className="mt-2">Missing: {triageInfo.coverage.missing.join(", ")}</div>
              </div>
            ) : null}
          </details>

          <details
            ref={extractionPanelRef}
            className="group order-4 border-b border-zinc-200 bg-white"
            onToggle={(e) => {
              const el = e.currentTarget;
              if (el.open) openSidePanel("extraction");
            }}
          >
            <summary className="cursor-pointer list-none border-b border-transparent px-2 py-0.5 group-open:border-zinc-200 [&::-webkit-details-marker]:hidden">
              <div className="flex h-[24px] items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">▸</span>
                  <span className="truncate">Cover extraction</span>
                </span>
                <span className="truncate rounded-full bg-zinc-100 px-1.5 py-0.5 text-[8px] normal-case text-zinc-700">
                  {latestRun
                    ? `${latestRun.status} · ${Math.round((latestRun.overallConfidence || 0) * 100)}%`
                    : "Not run"}
                </span>
              </div>
            </summary>

            <div className="p-4">
              {!latestRun ? (
                <div className="text-sm text-zinc-600">
                  No extraction yet. Click <span className="font-semibold">Run extraction</span> to collect cover metadata and page samples for grading.
                </div>
              ) : (
                <div className="grid gap-3">
                  {latestRun.error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                      {latestRun.error}
                    </div>
                  ) : null}

                  {!!triageInfo?.warnings?.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="text-xs font-semibold uppercase tracking-wide">Warnings</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {triageInfo.warnings.slice(0, 5).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {extractionMode === "COVER_ONLY" && !coverReady ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="text-xs font-semibold uppercase tracking-wide">Cover metadata incomplete</div>
                      <div className="mt-1">
                        Grading can continue. Add or correct cover details in this page if needed for record quality.
                      </div>
                    </div>
                  ) : null}

                  {latestRun ? (
                    <details ref={coverEditorRef} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide">Cover Metadata Editor</summary>
                      <div className="mt-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide">Cover Metadata</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="text-xs">
                          <span className="font-semibold">Student</span>
                          <input
                            ref={coverStudentNameRef}
                            value={coverStudentName}
                            onChange={(e) => setCoverStudentName(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Student ID</span>
                          <input
                            ref={coverStudentIdRef}
                            value={coverStudentId}
                            onChange={(e) => setCoverStudentId(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Unit</span>
                          <input
                            ref={coverUnitCodeRef}
                            value={coverUnitCode}
                            onChange={(e) => setCoverUnitCode(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Assignment</span>
                          <input
                            ref={coverAssignmentCodeRef}
                            value={coverAssignmentCode}
                            onChange={(e) => setCoverAssignmentCode(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="font-semibold">Submission Date</span>
                          <input
                            ref={coverSubmissionDateRef}
                            value={coverSubmissionDate}
                            onChange={(e) => setCoverSubmissionDate(e.target.value)}
                            className="mt-1 h-8 w-full rounded-lg border border-emerald-200 bg-white px-2 text-xs text-zinc-900"
                          />
                        </label>
                        <div className="text-xs">
                          <span className="font-semibold">Extracted confidence:</span>{" "}
                          {Number(coverMeta?.confidence || 0).toFixed(2)}
                        </div>
                      </div>
                  <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => void saveCoverMetadata()}
                          disabled={coverEditBusy}
                          className={cx(
                            "inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold",
                            coverEditBusy
                              ? "cursor-not-allowed bg-emerald-200 text-emerald-800"
                              : "bg-emerald-700 text-white hover:bg-emerald-800"
                          )}
                        >
                          {coverEditBusy ? "Saving..." : "Save cover metadata"}
                        </button>
                        <span className="ml-2 text-[11px] text-emerald-900/80">
                          {coverSaveState === "saving"
                            ? "Autosaving…"
                            : coverSaveState === "saved"
                              ? "Saved"
                              : "Autosave idle"}
                        </span>
                      </div>
                      </div>
                    </details>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-semibold text-zinc-500">Page</div>
                    <select
                      value={activePage}
                      onChange={(e) => setActivePage(Number(e.target.value))}
                      className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                    >
                      {pagesSorted.map((p, idx) => (
                        <option key={p.id} value={idx}>
                          {p.pageNumber} (conf {Math.round((p.confidence || 0) * 100)}%)
                        </option>
                      ))}
                    </select>
                    <div className="ml-auto text-xs text-zinc-500">Started: {safeDate(latestRun.startedAt)}</div>
                  </div>

                  {pagesSorted.length ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {pagesSorted.map((p, idx) => (
                        <button
                          key={`thumb-${p.id}`}
                          type="button"
                          onClick={() => setActivePage(idx)}
                          className={cx(
                            "min-w-[120px] rounded-lg border px-2 py-1.5 text-left",
                            idx === activePage ? "border-sky-300 bg-sky-50" : "border-zinc-200 bg-white hover:bg-zinc-50"
                          )}
                        >
                          <div className="text-[11px] font-semibold text-zinc-800">Page {p.pageNumber}</div>
                          <div className="text-[10px] text-zinc-500">Conf {Math.round((p.confidence || 0) * 100)}%</div>
                          <div className="mt-1 line-clamp-2 text-[10px] text-zinc-600">
                            {String(p.text || "").trim() || "(No text preview)"}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                    <summary className="cursor-pointer text-xs font-semibold text-zinc-700">Page text preview</summary>
                    <div className="mt-2 max-h-[32vh] overflow-auto rounded-lg border border-zinc-200 bg-white p-2">
                      <div className="whitespace-pre-wrap font-mono text-xs text-zinc-800">
                        {active?.text?.trim() ? active.text : "(No meaningful text on this page yet)"}
                      </div>
                    </div>
                  </details>

                  <div className="text-xs text-zinc-500">
                    Tip: scanned/low-text pages can still proceed in cover-ready mode when identity metadata is extracted.
                  </div>
                </div>
              )}
            </div>
          </details>

          <details
            ref={outputsPanelRef}
            className="group order-5 bg-white"
            onToggle={(e) => {
              const el = e.currentTarget;
              if (el.open) openSidePanel("outputs");
            }}
          >
            <summary className="cursor-pointer list-none px-2 py-0.5 [&::-webkit-details-marker]:hidden">
              <div className="flex h-[24px] items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">▸</span>
                  <span className="truncate">Audit & outputs</span>
                </span>
                <span
                  className={cx(
                    "inline-flex h-[16px] items-center rounded-full px-1.5 text-[8px]",
                    feedbackDirty ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-700"
                  )}
                >
                  {feedbackDirty ? "Unsaved edits" : "Saved"}
                </span>
              </div>
            </summary>
            <div ref={outputsAccordionRef} className="grid gap-1 border-t border-zinc-200 px-2 pb-2 pt-1.5 text-sm">
              {gradingHistory.length ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  <span className="text-xs font-semibold text-zinc-700">Assessment run</span>
                  <select
                    value={selectedAssessmentId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (feedbackDirty) {
                        const ok = window.confirm("You have unsaved feedback changes. Switch assessment anyway?");
                        if (!ok) return;
                      }
                      setSelectedAssessmentId(nextId);
                    }}
                    className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs"
                  >
                    {gradingHistory.map((g, idx) => (
                      <option key={g.id} value={g.id}>
                        {idx === 0 ? "Latest" : `Run ${gradingHistory.length - idx}`} · {safeDate(g.createdAt)} · {g.overallGrade || "—"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void (checklist.readyToUpload ? copyOverallFeedbackPack() : copyText("Feedback", studentFeedbackPreview))
                  }
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  {checklist.readyToUpload ? "Copy overall feedback" : "Copy feedback"}
                </button>
                {checklist.readyToUpload ? (
                  <button
                    type="button"
                    onClick={() => void copyText("Marked version link", toAbsoluteUrl(markedPdfUrl))}
                    disabled={!selectedAssessment?.annotatedPdfPath}
                    className={cx(
                      "rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
                      !selectedAssessment?.annotatedPdfPath
                        ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    )}
                  >
                    Copy marked link
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copyText("Criterion decisions", buildCriterionDecisionsText())}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Copy criterion decisions
                </button>
                <button
                  type="button"
                  onClick={() => void regenerateMarkedFromCurrentRun()}
                  disabled={!selectedAssessment?.id || feedbackEditorBusy}
                  className={cx(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
                    !selectedAssessment?.id || feedbackEditorBusy
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  Regenerate with current settings
                </button>
              </div>
              <div
                className={cx(
                  "rounded-xl border p-2 text-[11px]",
                  auditPressure.severity === "high"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : auditPressure.severity === "medium"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">Audit pressure</div>
                  <span className="rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {auditPressure.severity}
                  </span>
                </div>
                {auditPressure.issues.length ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {auditPressure.issues.map((issue, idx) => (
                      <li key={`pressure-${idx}`}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1">No active pressure signals.</div>
                )}
              </div>
              {previousAssessment && selectedAssessment?.id === latestAssessment?.id ? (
                <div className="text-[11px] text-zinc-500">
                  Previous run: {previousAssessment.overallGrade || "—"} at {safeDate(previousAssessment.createdAt)}
                </div>
              ) : null}
              {lastActionNote ? <div className="text-[11px] text-zinc-500">{lastActionNote}</div> : null}
              {selectedAssessmentDiff?.length ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-700">
                  <div className="font-semibold text-zinc-800">Diff vs previous run</div>
                  <ul className="mt-1 list-disc pl-4">
                    {selectedAssessmentDiff.map((d, i) => (
                      <li key={`diff-${i}`}>{d}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {(gradeRunConfidenceSignals.extraction !== null ||
                gradeRunConfidenceSignals.grading !== null ||
                gradeRunPolicy ||
                gradeRunExcludedCriteriaCodes.length > 0) ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-700">
                  <div className="font-semibold text-zinc-800">GradeRun v2 signals</div>
                  <div className="mt-1 grid gap-1 md:grid-cols-2">
                    <div>
                      Extraction confidence:{" "}
                      <span className="font-semibold text-zinc-900">
                        {gradeRunConfidenceSignals.extraction === null ? "—" : gradeRunConfidenceSignals.extraction.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      Grading confidence:{" "}
                      <span className="font-semibold text-zinc-900">
                        {gradeRunConfidenceSignals.grading === null ? "—" : gradeRunConfidenceSignals.grading.toFixed(2)}
                      </span>
                    </div>
                    {gradeRunPolicy ? (
                      <>
                        <div>
                          Raw grade: <span className="font-semibold text-zinc-900">{String(gradeRunPolicy.rawOverallGrade || "—")}</span>
                        </div>
                        <div>
                          Final grade: <span className="font-semibold text-zinc-900">{String(gradeRunPolicy.finalOverallGrade || "—")}</span>
                        </div>
                        {gradeRunPolicy.wasCapped ? (
                          <div className="md:col-span-2 text-amber-800">
                            Policy cap applied: {String(gradeRunPolicy.capReason || "CAPPED_DUE_TO_RESUBMISSION")}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {gradeRunExcludedCriteriaCodes.length > 0 ? (
                      <div className="md:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-900">
                        Excluded criteria in this run: {gradeRunExcludedCriteriaCodes.join(", ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {gradeRunConfidencePolicy ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Confidence Decomposition
                  </summary>
                  <div className="mt-2 grid gap-1 text-xs text-zinc-700 md:grid-cols-2">
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Final confidence:{" "}
                      <span className="font-semibold text-zinc-900">
                        {Number(gradeRunConfidencePolicy?.finalConfidence || 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Weighted base:{" "}
                      <span className="font-semibold text-zinc-900">
                        {Number(gradeRunConfidencePolicy?.weightedBaseConfidence || 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Raw before caps:{" "}
                      <span className="font-semibold text-zinc-900">
                        {Number(gradeRunConfidencePolicy?.rawConfidenceBeforeCaps || 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Capped:{" "}
                      <span className={cx("font-semibold", gradeRunConfidencePolicy?.wasCapped ? "text-amber-800" : "text-emerald-800")}>
                        {gradeRunConfidencePolicy?.wasCapped ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Model confidence:{" "}
                      <span className="font-semibold text-zinc-900">{Number(gradeRunConfidencePolicy?.modelConfidence || 0).toFixed(3)}</span>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Criterion avg confidence:{" "}
                      <span className="font-semibold text-zinc-900">
                        {Number(gradeRunConfidencePolicy?.criterionAverageConfidence || 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Evidence score:{" "}
                      <span className="font-semibold text-zinc-900">{Number(gradeRunConfidencePolicy?.evidenceScore || 0).toFixed(3)}</span>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Extraction confidence used:{" "}
                      <span className="font-semibold text-zinc-900">
                        {Number(gradeRunConfidencePolicy?.extractionConfidence || 0).toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Bonuses</div>
                      <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[11px] text-zinc-700">
                        {JSON.stringify(gradeRunConfidencePolicy?.bonuses || {}, null, 2)}
                      </pre>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Penalties</div>
                      <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[11px] text-zinc-700">
                        {JSON.stringify(gradeRunConfidencePolicy?.penalties || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                  {Array.isArray(gradeRunConfidencePolicy?.capsApplied) && gradeRunConfidencePolicy.capsApplied.length > 0 ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <div className="font-semibold">Applied caps</div>
                      <ul className="mt-1 list-disc pl-4">
                        {gradeRunConfidencePolicy.capsApplied.map((cap: any, i: number) => (
                          <li key={`cap-${i}`}>
                            {String(cap?.name || "cap")} @ {String(cap?.value ?? "—")} · {String(cap?.reason || "No reason")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </details>
              ) : null}
              {gradeRunReadinessChecklist ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Grade Readiness Checklist
                  </summary>
                  <div className="mt-2 grid gap-1 text-xs text-zinc-700">
                    {Object.entries(gradeRunReadinessChecklist).map(([key, ok]) => (
                      <div key={`rr-${key}`} className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                        <span className="capitalize text-zinc-800">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                        <span className={cx("font-semibold", Boolean(ok) ? "text-emerald-700" : "text-amber-700")}>
                          {Boolean(ok) ? "Yes" : "No"}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {gradeRunReferenceSnapshot ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Reference Context Snapshot
                  </summary>
                  <div className="mt-2 grid gap-1 text-xs text-zinc-700">
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Unit: {String(gradeRunReferenceSnapshot?.unit?.unitCode || "—")} · Spec doc:{" "}
                      {String(gradeRunReferenceSnapshot?.specDocument?.id || "—")} · Version:{" "}
                      {String(gradeRunReferenceSnapshot?.specDocument?.version || "—")}
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Brief: {String(gradeRunReferenceSnapshot?.assignmentBrief?.assignmentCode || "—")} · Doc:{" "}
                      {String(gradeRunReferenceSnapshot?.assignmentBrief?.briefDocument?.id || "—")} · Version:{" "}
                      {String(gradeRunReferenceSnapshot?.assignmentBrief?.briefDocument?.version || "—")}
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      Criteria captured: {Array.isArray(gradeRunReferenceSnapshot?.criteriaUsed) ? gradeRunReferenceSnapshot.criteriaUsed.length : 0}
                    </div>
                  </div>
                </details>
              ) : null}
              {(gradeRunEvidenceDensityRows.length > 0 || gradeRunEvidenceDensitySummary.totalCitations > 0) ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Evidence Density · Citations {gradeRunEvidenceDensitySummary.totalCitations} · Missing {gradeRunEvidenceDensitySummary.criteriaWithoutEvidence}
                  </summary>
                  <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                    Criteria: {gradeRunEvidenceDensitySummary.criteriaCount} · Words cited: {gradeRunEvidenceDensitySummary.totalWordsCited}
                  </div>
                  {gradeRunEvidenceDensityRows.length ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-zinc-50 text-zinc-600">
                          <tr>
                            <th className="border border-zinc-200 px-2 py-1 text-left">Criterion</th>
                            <th className="border border-zinc-200 px-2 py-1 text-left">Citations</th>
                            <th className="border border-zinc-200 px-2 py-1 text-left">Words</th>
                            <th className="border border-zinc-200 px-2 py-1 text-left">Pages</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gradeRunEvidenceDensityRows.slice(0, 40).map((row: any, i: number) => (
                            <tr key={`ed-${i}`}>
                              <td className="border border-zinc-200 px-2 py-1">{String(row?.code || "—")}</td>
                              <td className="border border-zinc-200 px-2 py-1">{Number(row?.citationCount || 0)}</td>
                              <td className="border border-zinc-200 px-2 py-1">{Number(row?.totalWordsCited || 0)}</td>
                              <td className="border border-zinc-200 px-2 py-1">
                                {Array.isArray(row?.pageDistribution) ? row.pageDistribution.join(", ") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </details>
              ) : null}
              {gradeRunRerunIntegrity ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Re-run Integrity
                  </summary>
                  <div className="mt-2 text-xs text-zinc-700">
                    Previous run: {String(gradeRunRerunIntegrity?.previousAssessmentId || "None")} · Drift:{" "}
                    <span className={cx("font-semibold", gradeRunRerunIntegrity?.snapshotDiff?.changed ? "text-amber-800" : "text-emerald-800")}>
                      {gradeRunRerunIntegrity?.snapshotDiff?.changed ? "Detected" : "No drift"}
                    </span>
                  </div>
                  {gradeRunRerunIntegrity?.snapshotDiff?.changed && gradeRunRerunIntegrity?.snapshotDiff?.deltas ? (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-700">
                      {JSON.stringify(gradeRunRerunIntegrity.snapshotDiff.deltas, null, 2)}
                    </pre>
                  ) : null}
                </details>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-zinc-700">Selected grade</span>
                <span className="font-semibold text-zinc-900">{selectedAssessment?.overallGrade || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-700">Graded by</span>
                <span className="font-semibold text-zinc-900">{String(selectedAssessment?.resultJson?.gradedBy || "—")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Original PDF
                </a>
                <a
                  href={markedPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cx(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                    selectedAssessment?.annotatedPdfPath
                      ? "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                      : "pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-400"
                  )}
                >
                  Marked PDF
                </a>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Feedback editor</div>
                  <span
                    className={cx(
                      "inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
                      studentFeedbackChanged
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900"
                    )}
                  >
                    {studentFeedbackChanged ? "Student-safe filter applied" : "Student-safe output"}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-zinc-700">
                    Student name
                    <input
                      value={feedbackStudentName}
                      onChange={(e) => setFeedbackStudentName(e.target.value)}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900"
                    />
                  </label>
                  <label className="text-xs text-zinc-700">
                    Date
                    <input
                      type="date"
                      value={feedbackMarkedDate}
                      onChange={(e) => setFeedbackMarkedDate(e.target.value)}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900"
                    />
                  </label>
                </div>
                <textarea
                  value={feedbackDraft}
                  onChange={(e) => setFeedbackDraft(e.target.value)}
                  rows={10}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900"
                  placeholder="Edit the feedback text shown in audit and marked PDF."
                />
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <div className="text-[11px] font-semibold text-emerald-900">Student view preview</div>
                  <div className="mt-1 whitespace-pre-wrap text-xs text-emerald-950">
                    {studentFeedbackPreview || "No student-facing feedback."}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={saveAssessmentFeedback}
                    disabled={!selectedAssessment?.id || feedbackEditorBusy}
                    className={cx(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold",
                      !selectedAssessment?.id || feedbackEditorBusy
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-500"
                        : "bg-sky-700 text-white hover:bg-sky-800"
                    )}
                  >
                    {feedbackEditorBusy ? "Applying…" : "Apply to marked version"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rebuildMarkedPdf()}
                    disabled={!selectedAssessment?.id || feedbackEditorBusy}
                    className={cx(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                      !selectedAssessment?.id || feedbackEditorBusy
                        ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                        : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                    )}
                  >
                    Rebuild marked PDF
                  </button>
                  <span className="text-[11px] text-zinc-500">
                    Assessor uses current active user. Saves audit output and regenerates marked PDF for this run.
                  </span>
                </div>
              </div>

              {feedbackHistory.length ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Feedback Summary History ({feedbackHistory.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {feedbackHistory.map((row) => (
                      <div key={`fb-${row.id}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-zinc-800">
                            {row.index === 0 ? "Latest" : `Run ${feedbackHistory.length - row.index}`} · {row.grade} · {row.when}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFeedbackHistory((prev) => ({
                                ...prev,
                                [row.id]: !prev[row.id],
                              }))
                            }
                            className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50"
                          >
                            {expandedFeedbackHistory[row.id] ? "Collapse" : "Expand"}
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-zinc-700">
                          {expandedFeedbackHistory[row.id] ? row.fullText || "No feedback text." : row.summary}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {structuredGrading ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Criterion Decisions · {String(structuredGrading?.overallGradeWord || structuredGrading?.overallGrade || "—")} · Resubmission: {Boolean(structuredGrading?.resubmissionRequired) ? "Yes" : "No"}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {(Array.isArray(structuredGrading?.criterionChecks) ? structuredGrading.criterionChecks : []).slice(0, 24).map((row: any, idx: number) => {
                      const code = String(row?.code || "").trim().toUpperCase();
                      const decision = String(row?.decision || (row?.met === true ? "ACHIEVED" : row?.met === false ? "NOT_ACHIEVED" : "UNCLEAR")).toUpperCase();
                      const tone =
                        decision === "ACHIEVED"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : decision === "NOT_ACHIEVED"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-zinc-200 bg-zinc-50 text-zinc-800";
                      const rationale = String(row?.rationale || row?.comment || "").trim();
                      const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
                      const override = criterionOverrideMap.get(code);
                      const overrideDraft = criterionOverrideDrafts[code];
                      const busy = criterionOverrideBusyCode === code;
                      const pages = Array.from(
                        new Set(
                          evidence
                            .map((ev: any) => Number(ev?.page))
                            .filter((n: number) => Number.isInteger(n) && n > 0)
                        )
                      ).slice(0, 8);
                      return (
                        <div key={`crit-${idx}`} className="rounded-lg border border-zinc-200 p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-900">
                              {String(code || "—")}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{decision}</span>
                            {override ? (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                                Overridden
                              </span>
                            ) : null}
                            {pages.length ? (
                              <span className="text-[11px] text-zinc-600">Pages: {pages.join(", ")}</span>
                            ) : null}
                          </div>
                          {rationale ? <div className="mt-1 text-xs text-zinc-700">{rationale}</div> : null}
                          {code ? (
                            <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2">
                              <div className="mb-1 text-[11px] font-semibold text-zinc-700">Assessor override</div>
                              <div className="grid gap-1.5 md:grid-cols-4">
                                <label className="text-[11px] text-zinc-600">
                                  Final decision
                                  <select
                                    value={overrideDraft?.finalDecision || decision}
                                    onChange={(e) =>
                                      setCriterionOverrideDrafts((prev) => ({
                                        ...prev,
                                        [code]: {
                                          finalDecision: e.target.value as CriterionDecision,
                                          reasonCode: (prev[code]?.reasonCode || "ASSESSOR_JUDGEMENT") as OverrideReasonCode,
                                          note: prev[code]?.note || "",
                                        },
                                      }))
                                    }
                                    className="mt-0.5 h-7 w-full rounded-md border border-zinc-300 bg-white px-2 text-[11px] text-zinc-900"
                                  >
                                    <option value="ACHIEVED">ACHIEVED</option>
                                    <option value="NOT_ACHIEVED">NOT_ACHIEVED</option>
                                    <option value="UNCLEAR">UNCLEAR</option>
                                  </select>
                                </label>
                                <label className="text-[11px] text-zinc-600">
                                  Reason
                                  <select
                                    value={overrideDraft?.reasonCode || "ASSESSOR_JUDGEMENT"}
                                    onChange={(e) =>
                                      setCriterionOverrideDrafts((prev) => ({
                                        ...prev,
                                        [code]: {
                                          finalDecision: (prev[code]?.finalDecision || decision) as CriterionDecision,
                                          reasonCode: e.target.value as OverrideReasonCode,
                                          note: prev[code]?.note || "",
                                        },
                                      }))
                                    }
                                    className="mt-0.5 h-7 w-full rounded-md border border-zinc-300 bg-white px-2 text-[11px] text-zinc-900"
                                  >
                                    {OVERRIDE_REASON_OPTIONS.map((opt) => (
                                      <option key={`${code}-${opt.value}`} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-[11px] text-zinc-600 md:col-span-2">
                                  Assessor note (optional)
                                  <input
                                    value={overrideDraft?.note || ""}
                                    onChange={(e) =>
                                      setCriterionOverrideDrafts((prev) => ({
                                        ...prev,
                                        [code]: {
                                          finalDecision: (prev[code]?.finalDecision || decision) as CriterionDecision,
                                          reasonCode: (prev[code]?.reasonCode || "ASSESSOR_JUDGEMENT") as OverrideReasonCode,
                                          note: e.target.value,
                                        },
                                      }))
                                    }
                                    className="mt-0.5 h-7 w-full rounded-md border border-zinc-300 bg-white px-2 text-[11px] text-zinc-900"
                                    placeholder="Why override this criterion?"
                                  />
                                </label>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void applyCriterionOverride(code)}
                                  disabled={busy}
                                  className={cx(
                                    "rounded-md px-2 py-1 text-[11px] font-semibold",
                                    busy ? "cursor-not-allowed bg-zinc-200 text-zinc-500" : "bg-sky-700 text-white hover:bg-sky-800"
                                  )}
                                >
                                  {busy ? "Applying..." : "Apply override"}
                                </button>
                                {override ? (
                                  <button
                                    type="button"
                                    onClick={() => void clearCriterionOverride(code)}
                                    disabled={busy}
                                    className={cx(
                                      "rounded-md border px-2 py-1 text-[11px] font-semibold",
                                      busy
                                        ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                                    )}
                                  >
                                    Reset to model
                                  </button>
                                ) : null}
                                {override ? (
                                  <span className="text-[10px] text-zinc-500">
                                    model: {String(override?.modelDecision || "—")} · reason: {String(override?.reasonCode || "—")}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}

              {pageFeedbackMap.length ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Page Feedback Map ({pageFeedbackMap.length} pages)
                  </summary>
                  <div className="mt-3 space-y-2">
                    {pageFeedbackBySection.map((group) => (
                      <div key={`pf-group-${group.key}`} className="rounded-lg border border-zinc-200 bg-white p-2">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{group.label}</div>
                        <div className="space-y-2">
                          {group.notes.map((p) => (
                            <div key={`pf-${group.key}-${p.page}-${p.criterionCode || "x"}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-800">
                                <span>Page {p.page}</span>
                                {p.criterionCode ? (
                                  <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700">
                                    {p.criterionCode}
                                  </span>
                                ) : null}
                              </div>
                              <ul className="mt-1 list-disc pl-4 text-xs text-zinc-700">
                                {(Array.isArray(p.items) && p.items.length ? p.items.map((it) => it.text) : p.lines).map((line, i) => (
                                  <li key={`pfl-${group.key}-${p.page}-${i}`}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {modalityCompliance.hasData ? (
                <details
                  data-output-section="true"
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                  onToggle={(e) => openSingleOutputSection(e.currentTarget)}
                >
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Modality Compliance · Pass {modalityCompliance.passCount} · Review {modalityCompliance.failCount}
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-600">
                        <tr>
                          <th className="border border-zinc-200 px-2 py-1.5">Task</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Section</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Required</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Found</th>
                          <th className="border border-zinc-200 px-2 py-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalityCompliance.rows.map((row) => (
                          <tr key={row.id}>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-800">{row.task}</td>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-800">{row.section}</td>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-700">
                              chart: {row.required.chart}; table: {row.required.table}; image: {row.required.image}; equation: {row.required.equation}; %: {row.required.percentage}
                            </td>
                            <td className="border border-zinc-200 px-2 py-1.5 text-zinc-700">
                              chart: {row.found.chart}; table: {row.found.table}; image: {row.found.image}; equation: {row.found.equation}; %: {row.found.percentage}
                            </td>
                            <td className="border border-zinc-200 px-2 py-1.5">
                              <span
                                className={cx(
                                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  row.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                )}
                              >
                                {row.ok ? "Pass" : "Review"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    Signals: table={String(modalityCompliance.foundSignals.table)}; bar={String(modalityCompliance.foundSignals.bar)}; pie={String(modalityCompliance.foundSignals.pie)}; image={String(modalityCompliance.foundSignals.image)}; equation={String(modalityCompliance.foundSignals.equation)}; percentage={String(modalityCompliance.foundSignals.percentage)}
                  </div>
                </details>
              ) : null}
            </div>
          </details>
          </div>
          </div>
        </div>
      </section>
    </main>
  );
}
