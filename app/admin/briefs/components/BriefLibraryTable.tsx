"use client";

import Link from "next/link";
import { Btn, Pill } from "./ui";
import { ivTone, statusTone, tone } from "../briefs.logic";
import { uniqSortedCriteriaCodes } from "@/lib/extraction/utils/criteriaCodes";

export default function BriefLibraryTable({
  vm,
  goToInbox,
}: {
  vm: ReturnType<any>;
  goToInbox: () => void;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Locked brief register</h2>
          <p className="mt-1 text-sm text-zinc-700">
            These are the briefs you can safely use for assessment. Each row links to an inspector with the PDF, versions,
            extracted header fields, and IV history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={vm.q}
            onChange={(e: any) => vm.setQ(e.target.value)}
            placeholder="Search unit, A-code, title, year…"
            className="w-64 max-w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
          />

          <select
            value={vm.unitFilter}
            onChange={(e: any) => vm.setUnitFilter(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All units</option>
            {vm.unitOptions.map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>

          <select
            value={vm.statusFilter}
            onChange={(e: any) => vm.setStatusFilter(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All statuses</option>
            {vm.statusOptions.map((s: any) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Btn kind="ghost" onClick={goToInbox}>
            Go to inbox
          </Btn>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 min-w-0">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-700">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Brief</th>
              <th className="px-3 py-2 text-left font-semibold">Year</th>
              <th className="px-3 py-2 text-left font-semibold">Issue</th>
              <th className="px-3 py-2 text-left font-semibold">Final submit</th>
              <th className="px-3 py-2 text-left font-semibold">Readiness</th>
              <th className="px-3 py-2 text-left font-semibold">IV</th>
              <th className="px-3 py-2 text-left font-semibold">PDF</th>
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vm.libraryRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-zinc-600">
                  No locked briefs yet. Use Extract tools to lock a brief PDF, then it will appear here.
                </td>
              </tr>
            ) : (
              vm.libraryRows.map((r: any) => {
                const doc = r.linkedDoc;
                const iv = r.ivForYear;
                const pdfHref = doc ? `/api/reference-documents/${doc.id}/file` : "";
                const extracted = doc?.extractedJson ?? null;
                const criteriaCodes = uniqSortedCriteriaCodes([
                  ...(Array.isArray(extracted?.criteriaCodes) ? extracted.criteriaCodes : []),
                  ...(Array.isArray(extracted?.detectedCriterionCodes) ? extracted.detectedCriterionCodes : []),
                  ...(Array.isArray(extracted?.criteriaRefs) ? extracted.criteriaRefs : []),
                ]);
                return (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-zinc-900">
                        {r.unit?.unitCode} {r.assignmentCode} — {r.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                        <Pill cls={statusTone(r.status)}>{(r.status || "").toUpperCase()}</Pill>
                        {doc ? (
                          <Pill cls={statusTone(doc.status)}>{(doc.status || "").toUpperCase()}</Pill>
                        ) : (
                          <Pill cls={tone("warn")}>NO DOC</Pill>
                        )}
                        {doc?.lockedAt ? <Pill cls={tone("ok")}>DOC LOCKED</Pill> : <Pill cls={tone("warn")}>DOC NOT LOCKED</Pill>}
                        <span className="truncate">{doc?.originalFilename || "—"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-700">
                        <span className="font-semibold">Criteria:</span>
                        {criteriaCodes.length ? criteriaCodes.map((code: string) => <Pill key={code} cls={tone("muted")}>{code}</Pill>) : <span>—</span>}
                        {!extracted ? <Pill cls={tone("warn")}>NOT EXTRACTED</Pill> : null}
                        {extracted && criteriaCodes.length === 0 ? <Pill cls={tone("warn")}>NO CODES</Pill> : null}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-zinc-700">{r.headerYear || "—"}</td>
                    <td className="px-3 py-3 text-zinc-700">{r.issueDate || "—"}</td>
                    <td className="px-3 py-3 text-zinc-700">{r.finalSubmissionDate || "—"}</td>

                    <td className="px-3 py-3">
                      <Pill cls={r.readiness === "READY" ? tone("ok") : r.readiness === "BLOCKED" ? tone("bad") : tone("warn")}>
                        <span title={r.readinessReason || ""}>{r.readiness || "—"}</span>
                      </Pill>
                    </td>

                    <td className="px-3 py-3">
                      {iv ? (
                        <Pill cls={ivTone(iv.outcome)}>{iv.outcome.replaceAll("_", " ")}</Pill>
                      ) : (
                        <Pill cls={tone("warn")}>MISSING</Pill>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {doc ? (
                        <a
                          href={pdfHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-zinc-900 underline decoration-zinc-300 hover:decoration-zinc-900"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-sm text-zinc-500">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/briefs/${r.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-zinc-600">
        Note: “IV = MISSING” means the linked PDF doesn’t yet have an IV record for the same academic year extracted from the PDF header.
      </div>
    </section>
  );
}
