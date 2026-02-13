"use client";

import { useState } from "react";
import { Pill } from "../../components/ui";
import { tone } from "./briefStyles";
import { IvForm } from "./IvForm";

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

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="text-sm font-semibold text-zinc-900">Add IV record</div>
        <p className="mt-1 text-sm text-zinc-700">
          Keep dates and names exactly as stated on your IV paperwork. This is an audit snapshot, not a “pretty” calendar.
        </p>

        <IvForm onAdd={vm.addIvRecord} busy={vm.ivBusy} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-700">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Academic year</th>
              <th className="px-3 py-2 text-left font-semibold">Outcome</th>
              <th className="px-3 py-2 text-left font-semibold">Verifier</th>
              <th className="px-3 py-2 text-left font-semibold">Date</th>
              <th className="px-3 py-2 text-left font-semibold">Notes</th>
              <th className="px-3 py-2 text-left font-semibold">IV form</th>
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vm.ivRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-600">
                  No IV records yet.
                </td>
              </tr>
            ) : (
              vm.ivRecords.map((r: any) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="px-3 py-3 font-semibold text-zinc-900">{r.academicYear}</td>
                  <td className="px-3 py-3">
                    <Pill cls={r.outcome === "APPROVED" ? tone("ok") : r.outcome === "REJECTED" ? tone("bad") : tone("warn")}>
                      {String(r.outcome).replaceAll("_", " ")}
                    </Pill>
                  </td>
                  <td className="px-3 py-3 text-zinc-700">{r.verifierName || "—"}</td>
                  <td className="px-3 py-3 text-zinc-700">{r.verificationDate || "—"}</td>
                  <td className="px-3 py-3 text-zinc-700">{r.notes || "—"}</td>
                  <td className="px-3 py-3 text-zinc-700">
                    {r.attachment?.documentId ? (
                      <div className="grid gap-1">
                        <a
                          href={`/api/reference-documents/${r.attachment.documentId}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                        >
                          Open IV form
                        </a>
                        <div className="text-xs text-zinc-500">{r.attachment.originalFilename}</div>
                        {r.attachment?.summary ? (
                          <div className="mt-1 rounded border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-700">
                            {r.attachment.summary.internalVerifierName ? (
                              <div>Verifier: {r.attachment.summary.internalVerifierName}</div>
                            ) : null}
                            {r.attachment.summary.assessorName ? (
                              <div>Assessor: {r.attachment.summary.assessorName}</div>
                            ) : null}
                            {r.attachment.summary.unitTitle ? (
                              <div>Unit: {r.attachment.summary.unitTitle}</div>
                            ) : null}
                            {r.attachment.summary.assignmentTitle ? (
                              <div>Assignment: {r.attachment.summary.assignmentTitle}</div>
                            ) : null}
                            {r.attachment.summary.learningOutcomes ? (
                              <div>LOs: {r.attachment.summary.learningOutcomes}</div>
                            ) : null}
                            {r.attachment.summary.acsSubmitted ? (
                              <div>ACS: {r.attachment.summary.acsSubmitted}</div>
                            ) : null}
                          </div>
                        ) : null}
                        {!r.attachment?.summary && /\.docx$/i.test(String(r.attachment?.originalFilename || "")) ? (
                          <button
                            type="button"
                            onClick={() => vm.backfillIvSummary?.(r.id)}
                            disabled={vm.ivBusy}
                            className="mt-1 inline-flex items-center justify-center rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                          >
                            Backfill summary
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="grid gap-1">
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
                          Upload IV Form
                        </label>
                        <div className="text-[11px] text-zinc-500">PDF, DOCX, or DOC · audit linked</div>
                      </div>
                    )}
                    {r.attachment?.documentId ? (
                      <div className="mt-2 text-[11px] text-zinc-500">Attachment locked; add a new IV record for revisions.</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => vm.deleteIvRecord(r.id)}
                      disabled={vm.ivBusy}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-zinc-600">
        Uploading IV forms is audit-safe: prior attachments are retained by creating a new IV record for the revised year.
      </div>
    </section>
  );
}
