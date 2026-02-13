"use client";

import { useState } from "react";
import { Pill } from "../../components/ui";
import { tone } from "./briefStyles";

function formatAuditDate(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} (${raw.slice(0, 10)})`;
}

function displayGeneralComments(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "No general comments.";
  if (/^evidence\s+upload$/i.test(raw)) return "No general comments.";
  return raw;
}

export function IvTab({ vm }: { vm: any }) {
  const [evidenceYear, setEvidenceYear] = useState<string>(vm.ivDefaultAcademicYear || "");
  const [evidenceOutcome, setEvidenceOutcome] = useState<"APPROVED" | "CHANGES_REQUIRED" | "REJECTED">("APPROVED");
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Internal Verification (IV)</h2>
          <p className="mt-1 text-sm text-zinc-700">Store IV outcomes per academic year. Saved to the linked brief PDF’s metadata (audit-safe).</p>
        </div>

        <div className="flex items-center gap-2">
          <Pill cls={vm.ivBusy ? tone("info") : vm.ivError ? tone("bad") : tone("ok")}>
            {vm.ivBusy ? "Saving…" : vm.ivError ? "Error" : "Ready"}
          </Pill>
        </div>
      </div>

      {vm.ivError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{vm.ivError}</div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <div className="text-sm font-semibold text-sky-900">Quick evidence upload</div>
        <p className="mt-1 text-sm text-sky-900/80">
          Upload a completed IV document directly. This creates the IV record and attaches the file in one step.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-sky-900">Academic year</label>
            <input
              value={evidenceYear}
              onChange={(e) => setEvidenceYear(e.target.value)}
              placeholder={vm.ivDefaultAcademicYear || "2025-26"}
              className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-sky-900">Outcome</label>
            <select
              value={evidenceOutcome}
              onChange={(e) => setEvidenceOutcome(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-sky-200"
            >
              <option value="APPROVED">APPROVED</option>
              <option value="CHANGES_REQUIRED">CHANGES REQUIRED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>
          <div className="flex items-end">
            <input
              id="iv-evidence-upload"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                vm.addIvEvidence?.(file, { academicYear: evidenceYear, outcome: evidenceOutcome });
              }}
            />
            <label
              htmlFor="iv-evidence-upload"
              className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Upload completed IV file
            </label>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {vm.ivRecords.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
            No IV records yet.
          </div>
        ) : (
          vm.ivRecords.map((r: any) => (
            <article key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              {(() => {
                const verifierDisplay =
                  String(r.verifierName || "").trim() ||
                  String(r.attachment?.summary?.internalVerifierName || "").trim() ||
                  "Not provided";
                const verifiedDateRaw =
                  String(r.verificationDate || "").trim() ||
                  String(r.attachment?.summary?.verificationDate || "").trim();
                const verifiedDateDisplay = verifiedDateRaw
                  ? formatAuditDate(verifiedDateRaw)
                  : "Not provided";
                const commentsDisplay = displayGeneralComments(
                  String(r.notes || "").trim() || String(r.attachment?.summary?.generalComments || "").trim()
                );
                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-base font-semibold text-zinc-900">{r.academicYear}</div>
                  <Pill cls={r.outcome === "APPROVED" ? tone("ok") : r.outcome === "REJECTED" ? tone("bad") : tone("warn")}>
                    {String(r.outcome).replaceAll("_", " ")}
                  </Pill>
                </div>
                <button
                  type="button"
                  onClick={() => vm.deleteIvRecord(r.id)}
                  disabled={vm.ivBusy}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-zinc-700 md:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verifier</div>
                  <div className="mt-1">{verifierDisplay}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verified Date</div>
                  <div className="mt-1">{verifiedDateDisplay}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recorded Date</div>
                  <div className="mt-1">{formatAuditDate(r.createdAt)}</div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">General Comments</div>
                <div className="mt-1 whitespace-pre-wrap">{commentsDisplay}</div>
              </div>

              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">IV Evidence</div>
                {r.attachment?.documentId ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={`/api/reference-documents/${r.attachment.documentId}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50"
                      >
                        Open IV form
                      </a>
                      <span className="text-xs text-zinc-600">{r.attachment.originalFilename}</span>
                      <span className="text-xs text-zinc-500">Uploaded: {formatAuditDate(r.attachment.uploadedAt)}</span>
                    </div>
                    {r.attachment?.summary ? (
                      <div className="grid gap-1 rounded border border-zinc-200 bg-white p-3 text-[12px] text-zinc-700 md:grid-cols-2">
                        <div className="font-semibold text-zinc-800 md:col-span-2">Extracted From IV Document</div>
                        {r.attachment.summary.internalVerifierName ? <div>Internal verifier: {r.attachment.summary.internalVerifierName}</div> : null}
                        {r.attachment.summary.assessorName ? <div>Assessor: {r.attachment.summary.assessorName}</div> : null}
                        {r.attachment.summary.unitTitle ? <div>Unit: {r.attachment.summary.unitTitle}</div> : null}
                        {r.attachment.summary.assignmentTitle ? <div>Assignment: {r.attachment.summary.assignmentTitle}</div> : null}
                        {r.attachment.summary.learningOutcomes ? <div className="md:col-span-2">Learning outcomes: {r.attachment.summary.learningOutcomes}</div> : null}
                        {r.attachment.summary.acsSubmitted ? <div className="md:col-span-2">Assessment criteria: {r.attachment.summary.acsSubmitted}</div> : null}
                      </div>
                    ) : null}
                    {!r.attachment?.summary && /\.docx$/i.test(String(r.attachment?.originalFilename || "")) ? (
                      <button
                        type="button"
                        onClick={() => vm.backfillIvSummary?.(r.id)}
                        disabled={vm.ivBusy}
                        className="inline-flex items-center justify-center rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                      >
                        Backfill summary
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <input
                      id={`iv-upload-${r.id}`}
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        vm.uploadIvAttachment?.(r.id, file);
                      }}
                    />
                    <label
                      htmlFor={`iv-upload-${r.id}`}
                      className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Upload IV form
                    </label>
                    <div className="text-[11px] text-zinc-500">PDF, DOCX, or DOC</div>
                  </div>
                )}
              </div>
                  </>
                );
              })()}
            </article>
          ))
        )}
      </div>

      <div className="mt-3 text-xs text-zinc-600">
        IV evidence is audit-safe: each upload is preserved against its record and year.
      </div>
    </section>
  );
}
