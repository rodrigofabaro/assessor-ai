"use client";

import { useEffect, useMemo, useState } from "react";

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
  createdAt: string;
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

export default function IvAdAdminPage() {
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
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [aiReview, setAiReview] = useState<AiReviewPreview>(null);
  const [aiReviewReason, setAiReviewReason] = useState("");
  const [reviewDraft, setReviewDraft] = useState<IvAdReviewDraft>(null);
  const [reviewApproved, setReviewApproved] = useState(false);
  const [reviewApprovedBy, setReviewApprovedBy] = useState("");
  const [useAiReview, setUseAiReview] = useState(true);
  const [lastDownloadUrl, setLastDownloadUrl] = useState("");

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
              <select value={selectedSpecId} onChange={(e) => setSelectedSpecId(e.target.value)} className={INPUT_CLASS}>
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
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Student name" value={fields.studentName} onChange={(v) => setFields((f) => ({ ...f, studentName: v }))} />
              <Field label="Programme title" value={fields.programmeTitle} onChange={(v) => setFields((f) => ({ ...f, programmeTitle: v }))} />
              <Field label="Unit code + title" value={fields.unitCodeTitle} onChange={(v) => setFields((f) => ({ ...f, unitCodeTitle: v }))} />
              <Field label="Assignment title" value={fields.assignmentTitle} onChange={(v) => setFields((f) => ({ ...f, assignmentTitle: v }))} />
              <Field label="Assessor name" value={fields.assessorName} onChange={(v) => setFields((f) => ({ ...f, assessorName: v }))} />
              <Field
                label="Internal verifier name"
                value={fields.internalVerifierName}
                onChange={(v) => setFields((f) => ({ ...f, internalVerifierName: v }))}
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
                  <select value={gradeOverride} onChange={(e) => setGradeOverride(e.target.value)} className={INPUT_CLASS}>
                    <option value="">Use extracted guess</option>
                    <option value="Pass">Pass</option>
                    <option value="Merit">Merit</option>
                    <option value="Distinction">Distinction</option>
                    <option value="Fail">Fail</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Key notes override</span>
                  <textarea
                    value={keyNotesOverride}
                    onChange={(e) => setKeyNotesOverride(e.target.value)}
                    rows={4}
                    className={TEXTAREA_CLASS}
                    placeholder="Short text, e.g. Task 2(b) table/graph incorrect and needs correction guidance."
                  />
                </label>
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
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Created</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Download</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-600">
                    No generated IV documents yet.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className="text-sm">
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-900">
                      <div className="font-medium">{row.studentName}</div>
                      <div className="text-xs text-zinc-500">{row.assignmentTitle}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.unitCodeTitle}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.grade}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{fmtDate(row.createdAt)}</td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <a
                        href={`/api/admin/iv-ad/documents/${row.id}/file`}
                        className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      >
                        Download DOCX
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
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
