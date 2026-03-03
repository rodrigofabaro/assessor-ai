"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type IvAdTemplate = {
  id: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  isActive: boolean;
  createdAt: string;
};

type IvAdDocument = {
  id: string;
  templateId: string;
  studentName: string;
  programmeTitle: string;
  unitCodeTitle: string;
  assignmentTitle: string;
  assessorName: string;
  internalVerifierName: string;
  grade: string;
  keyNotes?: string | null;
  reviewDraftJson?: unknown;
  reviewDraftApproved?: boolean;
  reviewDraftApprovedBy?: string | null;
  reviewDraftApprovedAt?: string | null;
  createdAt: string;
};

type IvAdDocumentDetail = IvAdDocument & {
  sourceMarkedPdfPath: string;
  sourceBriefPdfPath?: string | null;
  outputDocxPath: string;
  template?: {
    id: string;
    filename: string;
    createdAt: string;
  } | null;
};

type ExtractionPreview = {
  extractedGradeGuess: string | null;
  extractedKeyNotesGuess: string;
  pageCount?: number;
};

type AiReviewPreview = {
  gradingDecisionVerdict: "CORRECT" | "QUESTIONABLE" | "INCORRECT";
  feedbackQualityVerdict: "STRONG" | "ADEQUATE" | "WEAK";
  confidence: number;
  summary: string;
  provider: "openai";
  model: string;
} | null;

type IvAdReviewDraft = {
  assessmentDecisionCheck: string;
  feedbackComplianceCheck: string;
  criteriaLinkingCheck: string;
  academicIntegrityCheck: string;
  generalComments: string;
  actionRequired: string;
  warnings: string[];
  confidence: number;
  evidenceSnippets: Array<{
    source: "submission" | "assessment" | "spec";
    excerpt: string;
  }>;
  provider: "openai";
  model: string;
} | null;

type ReferenceSpecDocument = {
  id: string;
  title: string;
  originalFilename: string;
  status: string;
  version?: number | null;
  uploadedAt?: string | null;
  updatedAt?: string | null;
};

type PrefillFlags = {
  studentName: boolean;
  programmeTitle: boolean;
  unitCodeTitle: boolean;
  assignmentTitle: boolean;
  assessorName: boolean;
  internalVerifierName: boolean;
  gradeOverride: boolean;
  keyNotesOverride: boolean;
  selectedSpecId: boolean;
};

const INPUT_CLASS =
  "h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const TEXTAREA_CLASS =
  "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const BUTTON_PRIMARY =
  "inline-flex h-10 items-center justify-center rounded-xl border border-sky-700 bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_NEUTRAL =
  "inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60";

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarizeReviewAudit(row: IvAdDocument) {
  const approved = !!row.reviewDraftApproved;
  const approvedBy = String(row.reviewDraftApprovedBy || "").trim() || "—";
  const approvedAt = fmtDate(row.reviewDraftApprovedAt || null);
  const payload = row.reviewDraftJson as any;
  const hasDraft = !!payload?.draft;
  const warningCount = Array.isArray(payload?.draft?.warnings) ? payload.draft.warnings.length : 0;
  const evidenceCount = Array.isArray(payload?.draft?.evidenceSnippets) ? payload.draft.evidenceSnippets.length : 0;
  return {
    approved,
    approvedBy,
    approvedAt,
    source: hasDraft ? "AI draft + edit" : "Manual/heuristic",
    warningCount,
    evidenceCount,
  };
}

function makeDefaultFields() {
  return {
    studentName: "",
    programmeTitle: "",
    unitCodeTitle: "",
    assignmentTitle: "",
    assessorName: "",
    internalVerifierName: "",
  };
}

function makeDefaultPrefillFlags(): PrefillFlags {
  return {
    studentName: false,
    programmeTitle: false,
    unitCodeTitle: false,
    assignmentTitle: false,
    assessorName: false,
    internalVerifierName: false,
    gradeOverride: false,
    keyNotesOverride: false,
    selectedSpecId: false,
  };
}

export default function IvAdAdminPage() {
  const searchParams = useSearchParams();
  const didApplyLaunchPrefill = useRef(false);
  const [activeTemplate, setActiveTemplate] = useState<IvAdTemplate | null>(null);
  const [history, setHistory] = useState<IvAdDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [markedPdf, setMarkedPdf] = useState<File | null>(null);
  const [specOptions, setSpecOptions] = useState<ReferenceSpecDocument[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [fields, setFields] = useState(makeDefaultFields);
  const [gradeOverride, setGradeOverride] = useState("");
  const [keyNotesOverride, setKeyNotesOverride] = useState("");
  const [prefillFlags, setPrefillFlags] = useState<PrefillFlags>(makeDefaultPrefillFlags);
  const [missingFlags, setMissingFlags] = useState<PrefillFlags>(makeDefaultPrefillFlags);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [aiReview, setAiReview] = useState<AiReviewPreview>(null);
  const [aiReviewReason, setAiReviewReason] = useState("");
  const [reviewDraft, setReviewDraft] = useState<IvAdReviewDraft>(null);
  const [reviewApproved, setReviewApproved] = useState(false);
  const [reviewApprovedBy, setReviewApprovedBy] = useState("");
  const [useAiReview, setUseAiReview] = useState(true);
  const [lastDownloadUrl, setLastDownloadUrl] = useState("");
  const [auditBusy, setAuditBusy] = useState("");
  const [auditError, setAuditError] = useState("");
  const [auditDetail, setAuditDetail] = useState<IvAdDocumentDetail | null>(null);

  async function loadTemplateAndHistory() {
    setLoading(true);
    setError("");
    try {
      const [templateRes, docsRes, specsRes] = await Promise.all([
        fetch("/api/admin/iv-ad/template", { cache: "no-store" }),
        fetch("/api/admin/iv-ad/documents?templateId=active", { cache: "no-store" }),
        fetch("/api/reference-documents?type=SPEC&extracted=none", { cache: "no-store" }),
      ]);
      const templateJson = await templateRes.json();
      const docsJson = await docsRes.json();
      const specsJson = await specsRes.json();

      if (!templateRes.ok) throw new Error(templateJson?.error || `Template fetch failed (${templateRes.status})`);
      if (!docsRes.ok) throw new Error(docsJson?.error || `History fetch failed (${docsRes.status})`);
      if (!specsRes.ok) throw new Error(specsJson?.error || `Spec list fetch failed (${specsRes.status})`);

      setActiveTemplate(templateJson?.activeTemplate || null);
      setHistory(Array.isArray(docsJson?.documents) ? docsJson.documents : []);
      setSpecOptions(Array.isArray(specsJson?.documents) ? specsJson.documents : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load IV-AD page data.");
      setActiveTemplate(null);
      setHistory([]);
      setSpecOptions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplateAndHistory();
  }, []);

  useEffect(() => {
    if (didApplyLaunchPrefill.current) return;
    if (!searchParams) return;
    if (String(searchParams.get("source") || "").trim() !== "submission-detail") return;

    const fieldKeys = ["studentName", "programmeTitle", "unitCodeTitle", "assignmentTitle", "assessorName", "internalVerifierName"] as const;
    const nextFields = makeDefaultFields();
    const nextPrefillFlags = makeDefaultPrefillFlags();
    const nextMissingFlags = makeDefaultPrefillFlags();
    let hasAnyField = false;
    for (const key of fieldKeys) {
      const v = String(searchParams.get(key) || "").trim();
      if (v) {
        nextFields[key] = v;
        nextPrefillFlags[key] = true;
        hasAnyField = true;
      } else {
        nextMissingFlags[key] = true;
      }
    }
    if (hasAnyField) setFields(nextFields);

    const finalGrade = String(searchParams.get("finalGrade") || "").trim();
    if (finalGrade) {
      setGradeOverride(finalGrade);
      nextPrefillFlags.gradeOverride = true;
    } else {
      nextMissingFlags.gradeOverride = true;
    }
    const keyNotes = String(searchParams.get("keyNotes") || "").trim();
    if (keyNotes) {
      setKeyNotesOverride(keyNotes);
      nextPrefillFlags.keyNotesOverride = true;
    } else {
      nextMissingFlags.keyNotesOverride = true;
    }
    const referenceSpecId = String(searchParams.get("referenceSpecId") || "").trim();
    if (referenceSpecId) {
      setSelectedSpecId(referenceSpecId);
      nextPrefillFlags.selectedSpecId = true;
    } else {
      nextMissingFlags.selectedSpecId = true;
    }
    if (nextFields.internalVerifierName) setReviewApprovedBy(nextFields.internalVerifierName);
    setPrefillFlags(nextPrefillFlags);
    setMissingFlags(nextMissingFlags);
    setSuccess("Prefilled from submission detail context. Upload marked PDF (or run AI review) to continue.");
    didApplyLaunchPrefill.current = true;
  }, [searchParams]);

  const missingContextItems = useMemo(() => {
    const out: string[] = [];
    if (missingFlags.studentName) out.push("Student name");
    if (missingFlags.programmeTitle) out.push("Programme title");
    if (missingFlags.unitCodeTitle) out.push("Unit code + title");
    if (missingFlags.assignmentTitle) out.push("Assignment title");
    if (missingFlags.assessorName) out.push("Assessor name");
    if (missingFlags.internalVerifierName) out.push("Internal verifier name");
    if (missingFlags.gradeOverride) out.push("Grade override");
    if (missingFlags.keyNotesOverride) out.push("Key notes override");
    if (missingFlags.selectedSpecId) out.push("SPEC selection");
    return out;
  }, [missingFlags]);

  const noActiveTemplate = !activeTemplate;
  const canGenerate = useMemo(() => {
    const requiredFieldValues = Object.values(fields).every((v) => String(v || "").trim());
    return !!markedPdf && requiredFieldValues && !noActiveTemplate && !busy && reviewApproved && !!reviewApprovedBy.trim();
  }, [fields, markedPdf, noActiveTemplate, busy, reviewApproved, reviewApprovedBy]);
  const canRunDraftReview = useMemo(() => {
    const requiredFieldValues = Object.values(fields).every((v) => String(v || "").trim());
    return !!markedPdf && requiredFieldValues && !busy;
  }, [fields, markedPdf, busy]);

  async function uploadTemplate() {
    if (!templateFile) return;
    setBusy("Uploading template...");
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.set("template", templateFile);
      const res = await fetch("/api/admin/iv-ad/template", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Template upload failed (${res.status})`);
      setTemplateFile(null);
      setSuccess("Template uploaded and set as active.");
      await loadTemplateAndHistory();
    } catch (e: any) {
      setError(e?.message || "Failed to upload template.");
    } finally {
      setBusy("");
    }
  }

  async function generateIvDocx() {
    if (!canGenerate || !markedPdf) return;
    setBusy("Generating IV DOCX...");
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.set("markedPdf", markedPdf);
      if (selectedSpecId) fd.set("referenceSpecId", selectedSpecId);
      fd.set("useAiReview", useAiReview ? "true" : "false");
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      if (gradeOverride) fd.set("gradeOverride", gradeOverride);
      if (keyNotesOverride.trim()) fd.set("keyNotesOverride", keyNotesOverride.trim());
      if (reviewDraft) fd.set("reviewDraftJson", JSON.stringify(reviewDraft));
      fd.set("reviewApproved", reviewApproved ? "true" : "false");
      fd.set("reviewApprovedBy", reviewApprovedBy.trim());

      const res = await fetch("/api/admin/iv-ad/generate", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Generate failed (${res.status})`);

      setPreview(json?.extractionPreview || null);
      setAiReview(json?.aiReview || null);
      setAiReviewReason(String(json?.aiReviewReason || ""));
      setLastDownloadUrl(String(json?.downloadUrl || ""));
      setSuccess(json?.reviewDraftUsed ? "IV DOCX generated using edited AI review draft." : "IV DOCX generated successfully.");
      await loadTemplateAndHistory();

      const downloadUrl = String(json?.downloadUrl || "");
      if (downloadUrl && typeof window !== "undefined") {
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.click();
      }
    } catch (e: any) {
      setError(e?.message || "Failed to generate IV DOCX.");
    } finally {
      setBusy("");
    }
  }

  async function runAiReviewDraft() {
    if (!canRunDraftReview || !markedPdf) return;
    setBusy("Running AI IV review...");
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.set("markedPdf", markedPdf);
      if (selectedSpecId) fd.set("referenceSpecId", selectedSpecId);
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      if (gradeOverride) fd.set("finalGrade", gradeOverride);
      if (keyNotesOverride.trim()) fd.set("keyNotes", keyNotesOverride.trim());

      const res = await fetch("/api/iv-ad/review-draft", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Review draft failed (${res.status})`);

      setReviewDraft(json?.draft || null);
      setReviewApproved(false);
      setReviewApprovedBy(fields.internalVerifierName || "");
      setSuccess("AI review draft generated. You can now edit the draft sections before final generation.");
    } catch (e: any) {
      setReviewDraft(null);
      setError(e?.message || "Failed to run AI IV review.");
    } finally {
      setBusy("");
    }
  }

  async function openAuditDetail(documentId: string) {
    if (!documentId) return;
    setAuditBusy(documentId);
    setAuditError("");
    try {
      const res = await fetch(`/api/admin/iv-ad/documents/${documentId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Audit detail failed (${res.status})`);
      setAuditDetail((json?.document || null) as IvAdDocumentDetail | null);
    } catch (e: any) {
      setAuditError(e?.message || "Failed to load audit detail.");
      setAuditDetail(null);
    } finally {
      setAuditBusy("");
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      <header className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
              IV - AD Workflow
            </div>
            <h1 className="mt-2 text-base font-semibold text-zinc-900">Pearson IV - Assessment Decisions (Single Student)</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Upload one reusable DOCX template, then generate filled IV forms from marked student PDFs using fixed table cell coordinates.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
            {loading ? "Loading..." : busy ? busy : "Ready"}
          </span>
        </div>
        {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}
        {success ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</div> : null}
        {auditError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{auditError}</div> : null}
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">A) Active Template (upload once, reuse)</h2>
            <p className="mt-1 text-xs text-zinc-500">DOCX only. Uploading a new template replaces the active one for future generations.</p>
          </div>
        </div>

        {activeTemplate ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Meta label="Filename" value={activeTemplate.filename} />
              <Meta label="Uploaded" value={fmtDate(activeTemplate.createdAt)} />
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            No active template. Upload a DOCX template to enable generation.
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-zinc-900">{activeTemplate ? "Replace template" : "Upload template"}</span>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
              className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-sky-700 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-sky-800"
            />
          </label>
          <button type="button" onClick={uploadTemplate} disabled={!templateFile || !!busy} className={BUTTON_PRIMARY}>
            {busy === "Uploading template..." ? "Uploading..." : activeTemplate ? "Replace Template" : "Upload Template"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">B) Generate IV DOCX (per student)</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Upload the marked submission PDF, review the extraction guesses, override if needed, then generate the completed DOCX.
            </p>
          </div>
          {noActiveTemplate ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              Blocked: no active template
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {missingContextItems.length > 0 ? (
            <div className="lg:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Missing submission context detected. Complete manually: {missingContextItems.join(", ")}.
            </div>
          ) : null}
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Marked Submission PDF (required)</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setMarkedPdf(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-sky-700 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-sky-800"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Optional spec (from existing library)</span>
              <select
                value={selectedSpecId}
                onChange={(e) => {
                  setSelectedSpecId(e.target.value);
                  setPrefillFlags((p) => ({ ...p, selectedSpecId: false }));
                  setMissingFlags((p) => ({ ...p, selectedSpecId: false }));
                }}
                className={INPUT_CLASS}
              >
                <option value="">None</option>
                {specOptions.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.title || spec.originalFilename} · v{Number(spec.version || 1)} · {spec.status || "UPLOADED"}
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">
                Uses your stored SPEC PDFs from Reference Library instead of uploading another file.
              </span>
              {prefillFlags.selectedSpecId ? (
                <span className="text-[11px] font-semibold text-cyan-700">Auto-filled from submission context</span>
              ) : missingFlags.selectedSpecId ? (
                <span className="text-[11px] font-semibold text-amber-700">Missing context - select SPEC manually</span>
              ) : null}
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Student name"
                value={fields.studentName}
                sourceLabel={prefillFlags.studentName ? "Auto-filled" : missingFlags.studentName ? "Missing context" : ""}
                sourceTone={prefillFlags.studentName ? "auto" : missingFlags.studentName ? "unknown" : undefined}
                onChange={(v) => {
                  setFields((f) => ({ ...f, studentName: v }));
                  setPrefillFlags((p) => ({ ...p, studentName: false }));
                  setMissingFlags((p) => ({ ...p, studentName: false }));
                }}
              />
              <Field
                label="Programme title"
                value={fields.programmeTitle}
                sourceLabel={prefillFlags.programmeTitle ? "Auto-filled" : missingFlags.programmeTitle ? "Missing context" : ""}
                sourceTone={prefillFlags.programmeTitle ? "auto" : missingFlags.programmeTitle ? "unknown" : undefined}
                onChange={(v) => {
                  setFields((f) => ({ ...f, programmeTitle: v }));
                  setPrefillFlags((p) => ({ ...p, programmeTitle: false }));
                  setMissingFlags((p) => ({ ...p, programmeTitle: false }));
                }}
              />
              <Field
                label="Unit code + title"
                value={fields.unitCodeTitle}
                sourceLabel={prefillFlags.unitCodeTitle ? "Auto-filled" : missingFlags.unitCodeTitle ? "Missing context" : ""}
                sourceTone={prefillFlags.unitCodeTitle ? "auto" : missingFlags.unitCodeTitle ? "unknown" : undefined}
                onChange={(v) => {
                  setFields((f) => ({ ...f, unitCodeTitle: v }));
                  setPrefillFlags((p) => ({ ...p, unitCodeTitle: false }));
                  setMissingFlags((p) => ({ ...p, unitCodeTitle: false }));
                }}
              />
              <Field
                label="Assignment title"
                value={fields.assignmentTitle}
                sourceLabel={prefillFlags.assignmentTitle ? "Auto-filled" : missingFlags.assignmentTitle ? "Missing context" : ""}
                sourceTone={prefillFlags.assignmentTitle ? "auto" : missingFlags.assignmentTitle ? "unknown" : undefined}
                onChange={(v) => {
                  setFields((f) => ({ ...f, assignmentTitle: v }));
                  setPrefillFlags((p) => ({ ...p, assignmentTitle: false }));
                  setMissingFlags((p) => ({ ...p, assignmentTitle: false }));
                }}
              />
              <Field
                label="Assessor name"
                value={fields.assessorName}
                sourceLabel={prefillFlags.assessorName ? "Auto-filled" : missingFlags.assessorName ? "Missing context" : ""}
                sourceTone={prefillFlags.assessorName ? "auto" : missingFlags.assessorName ? "unknown" : undefined}
                onChange={(v) => {
                  setFields((f) => ({ ...f, assessorName: v }));
                  setPrefillFlags((p) => ({ ...p, assessorName: false }));
                  setMissingFlags((p) => ({ ...p, assessorName: false }));
                }}
              />
              <Field
                label="Internal verifier name"
                value={fields.internalVerifierName}
                sourceLabel={prefillFlags.internalVerifierName ? "Auto-filled" : missingFlags.internalVerifierName ? "Missing context" : ""}
                sourceTone={prefillFlags.internalVerifierName ? "auto" : missingFlags.internalVerifierName ? "unknown" : undefined}
                onChange={(v) => {
                  setFields((f) => ({ ...f, internalVerifierName: v }));
                  setPrefillFlags((p) => ({ ...p, internalVerifierName: false }));
                  setMissingFlags((p) => ({ ...p, internalVerifierName: false }));
                }}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-sm font-semibold text-zinc-900">Extraction preview (read-only)</div>
              <p className="mt-1 text-xs text-zinc-500">Populates after generation request (the route extracts first, then fills the DOCX).</p>
              <div className="mt-3 grid gap-2">
                <ReadOnlyField label="extractedGradeGuess" value={preview?.extractedGradeGuess || "—"} />
                <ReadOnlyField label="extractedKeyNotesGuess" value={preview?.extractedKeyNotesGuess || "—"} multiline />
                <ReadOnlyField label="pagesParsed" value={preview?.pageCount ? String(preview.pageCount) : "—"} />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="text-sm font-semibold text-zinc-900">Manual overrides</div>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Grade override</span>
                  <select
                    value={gradeOverride}
                    onChange={(e) => {
                      setGradeOverride(e.target.value);
                      setPrefillFlags((p) => ({ ...p, gradeOverride: false }));
                      setMissingFlags((p) => ({ ...p, gradeOverride: false }));
                    }}
                    className={INPUT_CLASS}
                  >
                    <option value="">Use extracted guess</option>
                    <option value="Pass">Pass</option>
                    <option value="Merit">Merit</option>
                    <option value="Distinction">Distinction</option>
                    <option value="Fail">Fail</option>
                  </select>
                </label>
                {prefillFlags.gradeOverride ? (
                  <span className="text-[11px] font-semibold text-cyan-700">Auto-filled from submission context</span>
                ) : missingFlags.gradeOverride ? (
                  <span className="text-[11px] font-semibold text-amber-700">Missing context - set grade manually</span>
                ) : null}
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Key notes override</span>
                  <textarea
                    value={keyNotesOverride}
                    onChange={(e) => {
                      setKeyNotesOverride(e.target.value);
                      setPrefillFlags((p) => ({ ...p, keyNotesOverride: false }));
                      setMissingFlags((p) => ({ ...p, keyNotesOverride: false }));
                    }}
                    rows={4}
                    className={TEXTAREA_CLASS}
                    placeholder="Short text, e.g. Task 2(b) table/graph incorrect and needs correction guidance."
                  />
                </label>
                {prefillFlags.keyNotesOverride ? (
                  <span className="text-[11px] font-semibold text-cyan-700">Auto-filled from submission context</span>
                ) : missingFlags.keyNotesOverride ? (
                  <span className="text-[11px] font-semibold text-amber-700">Missing context - add key notes manually</span>
                ) : null}
                <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <input
                    type="checkbox"
                    checked={useAiReview}
                    onChange={(e) => setUseAiReview(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-sky-700 focus:ring-sky-500"
                  />
                  Use AI IV review to fill comments/actions
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-sm font-semibold text-zinc-900">AI review draft workspace</div>
              <p className="mt-1 text-xs text-zinc-500">
                Run AI review to generate editable draft sections before producing the final DOCX.
              </p>
              {reviewDraft ? (
                <div className="mt-3 grid gap-3">
                  <EditableField
                    label="Assessment decision check"
                    value={reviewDraft.assessmentDecisionCheck}
                    onChange={(value) =>
                      setReviewDraft((prev) => (prev ? { ...prev, assessmentDecisionCheck: value } : prev))
                    }
                  />
                  <EditableField
                    label="Feedback compliance check"
                    value={reviewDraft.feedbackComplianceCheck}
                    onChange={(value) =>
                      setReviewDraft((prev) => (prev ? { ...prev, feedbackComplianceCheck: value } : prev))
                    }
                  />
                  <EditableField
                    label="Criteria linking check"
                    value={reviewDraft.criteriaLinkingCheck}
                    onChange={(value) => setReviewDraft((prev) => (prev ? { ...prev, criteriaLinkingCheck: value } : prev))}
                  />
                  <EditableField
                    label="Academic integrity check"
                    value={reviewDraft.academicIntegrityCheck}
                    onChange={(value) =>
                      setReviewDraft((prev) => (prev ? { ...prev, academicIntegrityCheck: value } : prev))
                    }
                  />
                  <EditableField
                    label="General comments"
                    value={reviewDraft.generalComments}
                    onChange={(value) => setReviewDraft((prev) => (prev ? { ...prev, generalComments: value } : prev))}
                  />
                  <EditableField
                    label="Action required"
                    value={reviewDraft.actionRequired}
                    onChange={(value) => setReviewDraft((prev) => (prev ? { ...prev, actionRequired: value } : prev))}
                  />
                  <ReadOnlyField label="confidence" value={Number(reviewDraft.confidence).toFixed(2)} />
                  <ReadOnlyField label="warnings" value={reviewDraft.warnings.join(" | ") || "—"} multiline />
                  <ReadOnlyField
                    label="evidence snippets"
                    value={reviewDraft.evidenceSnippets.map((s) => `[${s.source}] ${s.excerpt}`).join("\n\n") || "—"}
                    multiline
                  />
                  <ReadOnlyField label="provider/model" value={`${reviewDraft.provider} · ${reviewDraft.model}`} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-600">No draft yet. Use Run AI IV Review to generate one.</p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-sm font-semibold text-zinc-900">AI review result (during final generation)</div>
              {aiReview ? (
                <div className="mt-3 grid gap-2">
                  <ReadOnlyField label="gradingDecisionVerdict" value={aiReview.gradingDecisionVerdict} />
                  <ReadOnlyField label="feedbackQualityVerdict" value={aiReview.feedbackQualityVerdict} />
                  <ReadOnlyField label="confidence" value={Number(aiReview.confidence).toFixed(2)} />
                  <ReadOnlyField label="summary" value={aiReview.summary} multiline />
                  <ReadOnlyField label="provider/model" value={`${aiReview.provider} · ${aiReview.model}`} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-600">
                  {aiReviewReason ? `AI review unavailable (${aiReviewReason}). Heuristic narrative was used.` : "No generation AI review result yet."}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="text-sm font-semibold text-zinc-900">Approval gate (required)</div>
              <p className="mt-1 text-xs text-zinc-500">Confirm review and capture approver identity before generating the final DOCX.</p>
              <div className="mt-3 grid gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <input
                    type="checkbox"
                    checked={reviewApproved}
                    onChange={(e) => setReviewApproved(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-sky-700 focus:ring-sky-500"
                  />
                  I approve this IV-AD review draft for final generation
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Approved by</span>
                  <input
                    value={reviewApprovedBy}
                    onChange={(e) => setReviewApprovedBy(e.target.value)}
                    placeholder="Approver full name"
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={runAiReviewDraft} disabled={!canRunDraftReview} className={BUTTON_NEUTRAL}>
                {busy === "Running AI IV review..." ? "Running AI Review..." : "Run AI IV Review"}
              </button>
              <button type="button" onClick={generateIvDocx} disabled={!canGenerate} className={BUTTON_PRIMARY}>
                {busy === "Generating IV DOCX..." ? "Generating..." : "Generate IV DOCX"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMarkedPdf(null);
                  setSelectedSpecId("");
                  setPreview(null);
                  setAiReview(null);
                  setAiReviewReason("");
                  setReviewDraft(null);
                  setReviewApproved(false);
                  setReviewApprovedBy("");
                  setGradeOverride("");
                  setKeyNotesOverride("");
                  setPrefillFlags(makeDefaultPrefillFlags());
                  setMissingFlags(makeDefaultPrefillFlags());
                }}
                disabled={!!busy}
                className={BUTTON_NEUTRAL}
              >
                Reset form extras
              </button>
              {lastDownloadUrl ? (
                <a href={lastDownloadUrl} className={BUTTON_NEUTRAL}>
                  Download latest DOCX
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900">History (generated docs for active template)</div>
          <div className="mt-1 text-xs text-zinc-500">
            {activeTemplate ? `Template: ${activeTemplate.filename}` : "No active template selected"} · {history.length} record(s)
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold text-zinc-700">
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Student</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Unit</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Grade</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Review audit</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Created</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-600">
                    No generated IV documents yet.
                  </td>
                </tr>
              ) : (
                history.map((row) => {
                  const audit = summarizeReviewAudit(row);
                  return (
                    <tr key={row.id} className="text-sm">
                      <td className="border-b border-zinc-100 px-4 py-3 text-zinc-900">
                        <div className="font-medium">{row.studentName}</div>
                        <div className="text-xs text-zinc-500">{row.assignmentTitle}</div>
                      </td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.unitCodeTitle}</td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.grade}</td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">
                        <div className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${audit.approved ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                          {audit.approved ? "Approved" : "Not approved"}
                        </div>
                        <div className="mt-1 text-xs text-zinc-600">By: {audit.approvedBy}</div>
                        <div className="text-xs text-zinc-600">At: {audit.approvedAt}</div>
                        <div className="text-xs text-zinc-600">Source: {audit.source}</div>
                        <div className="text-xs text-zinc-600">
                          Warnings: {audit.warningCount} · Evidence: {audit.evidenceCount}
                        </div>
                      </td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{fmtDate(row.createdAt)}</td>
                      <td className="border-b border-zinc-100 px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void openAuditDetail(row.id)}
                            disabled={auditBusy === row.id}
                            className="inline-flex h-8 items-center rounded-lg border border-cyan-300 bg-cyan-50 px-3 text-xs font-semibold text-cyan-900 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {auditBusy === row.id ? "Loading..." : "View audit"}
                          </button>
                          <a
                            href={`/api/admin/iv-ad/documents/${row.id}/file`}
                            className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Download DOCX
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {auditDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">IV-AD audit detail</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Record {auditDetail.id} · Template {auditDetail.template?.filename || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditDetail(null)}
                className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            {auditError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{auditError}</div>
            ) : null}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <ReadOnlyField label="student" value={auditDetail.studentName} />
                <ReadOnlyField label="programme" value={auditDetail.programmeTitle} />
                <ReadOnlyField label="unit" value={auditDetail.unitCodeTitle} />
                <ReadOnlyField label="assignment" value={auditDetail.assignmentTitle} />
                <ReadOnlyField label="assessor" value={auditDetail.assessorName} />
                <ReadOnlyField label="internal verifier" value={auditDetail.internalVerifierName} />
                <ReadOnlyField label="grade" value={auditDetail.grade} />
                <ReadOnlyField label="created" value={fmtDate(auditDetail.createdAt)} />
              </div>
              <div className="grid gap-2">
                <ReadOnlyField label="review approved" value={auditDetail.reviewDraftApproved ? "Yes" : "No"} />
                <ReadOnlyField label="approved by" value={String(auditDetail.reviewDraftApprovedBy || "—")} />
                <ReadOnlyField label="approved at" value={fmtDate(auditDetail.reviewDraftApprovedAt || null)} />
                <ReadOnlyField label="sourceMarkedPdfPath" value={auditDetail.sourceMarkedPdfPath} multiline />
                <ReadOnlyField label="sourceBriefPdfPath" value={String(auditDetail.sourceBriefPdfPath || "—")} multiline />
                <ReadOnlyField label="outputDocxPath" value={auditDetail.outputDocxPath} multiline />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-sm font-semibold text-zinc-900">Persisted review draft JSON</div>
              {((auditDetail.reviewDraftJson as any)?.draft && typeof (auditDetail.reviewDraftJson as any)?.draft === "object") ? (
                <div className="mt-3 grid gap-2">
                  <ReadOnlyField label="assessmentDecisionCheck" value={String((auditDetail.reviewDraftJson as any).draft.assessmentDecisionCheck || "—")} multiline />
                  <ReadOnlyField label="feedbackComplianceCheck" value={String((auditDetail.reviewDraftJson as any).draft.feedbackComplianceCheck || "—")} multiline />
                  <ReadOnlyField label="criteriaLinkingCheck" value={String((auditDetail.reviewDraftJson as any).draft.criteriaLinkingCheck || "—")} multiline />
                  <ReadOnlyField label="academicIntegrityCheck" value={String((auditDetail.reviewDraftJson as any).draft.academicIntegrityCheck || "—")} multiline />
                  <ReadOnlyField label="generalComments" value={String((auditDetail.reviewDraftJson as any).draft.generalComments || "—")} multiline />
                  <ReadOnlyField label="actionRequired" value={String((auditDetail.reviewDraftJson as any).draft.actionRequired || "—")} multiline />
                  <ReadOnlyField label="warnings" value={Array.isArray((auditDetail.reviewDraftJson as any).draft.warnings) ? (auditDetail.reviewDraftJson as any).draft.warnings.join(" | ") : "—"} multiline />
                  <ReadOnlyField
                    label="evidenceSnippets"
                    value={Array.isArray((auditDetail.reviewDraftJson as any).draft.evidenceSnippets)
                      ? (auditDetail.reviewDraftJson as any).draft.evidenceSnippets
                          .map((s: any) => `[${String(s?.source || "unknown")}] ${String(s?.excerpt || "")}`)
                          .join("\n\n")
                      : "—"}
                    multiline
                  />
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-600">No persisted review draft snapshot for this record.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  sourceLabel,
  sourceTone,
  value,
  onChange,
}: {
  label: string;
  sourceLabel?: string;
  sourceTone?: "auto" | "unknown";
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="flex items-center gap-2 text-sm font-medium">
        <span>{label}</span>
        {sourceLabel ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              sourceTone === "unknown"
                ? "border border-amber-200 bg-amber-50 text-amber-800"
                : "border border-cyan-200 bg-cyan-50 text-cyan-800"
            }`}
          >
            {sourceLabel}
          </span>
        ) : null}
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-900 break-words">{value || "—"}</div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={TEXTAREA_CLASS} />
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-sm text-zinc-900 ${multiline ? "whitespace-pre-wrap" : ""}`}>{value || "—"}</div>
    </div>
  );
}
