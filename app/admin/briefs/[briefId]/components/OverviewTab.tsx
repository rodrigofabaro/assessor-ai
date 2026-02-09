"use client";

import { Pill } from "../../components/ui";
import { tone, statusTone } from "./briefStyles";

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <div className="text-xs font-semibold text-zinc-700">{label}</div>
      <div className="mt-1 text-sm text-zinc-900">{value || "—"}</div>
    </div>
  );
}

export function OverviewTab({ vm, pdfHref }: { vm: any; pdfHref: string }) {
  const header = vm.linkedDoc?.extractedJson?.header || null;
  const headerFields = [
    { label: "Qualification", value: header?.qualification },
    { label: "Unit number/title", value: header?.unitNumberAndTitle },
    { label: "Assignment title", value: header?.assignmentTitle },
    { label: "Assignment", value: header?.assignment },
    { label: "Assessor", value: header?.assessor },
    { label: "Internal verifier", value: header?.internalVerifier },
    { label: "Verification date", value: header?.verificationDate },
    { label: "Issue date", value: header?.issueDate },
    { label: "Final submission date", value: header?.finalSubmissionDate },
    { label: "Academic year", value: header?.academicYear },
    { label: "Unit code", value: header?.unitCode },
  ];
  const missingHeaderFields = headerFields.filter((field) => !field.value).map((field) => field.label);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
        <h2 className="text-sm font-semibold text-zinc-900">Brief summary</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            label="Status"
            value={<Pill cls={statusTone(vm.brief.status)}>{(vm.brief.status || "").toUpperCase()}</Pill>}
          />
          <Field label="Spec issue" value={vm.brief.unit?.specIssue || vm.brief.unit?.specVersionLabel || "—"} />
          <Field
            label="Assignment"
            value={
              vm.brief.assignmentNumber && vm.brief.totalAssignments
                ? `Assignment ${vm.brief.assignmentNumber}/${vm.brief.totalAssignments}`
                : "—"
            }
          />
          <Field
            label="PDF link"
            value={<Pill cls={vm.brief.briefDocumentId ? tone("ok") : tone("warn")}>{vm.brief.briefDocumentId ? "Linked" : "Missing"}</Pill>}
          />
        </div>

        <div className="mt-4 rounded-xl border border-zinc-200 p-3">
          <div className="text-xs font-semibold text-zinc-700">Linked PDF (reference document)</div>

          {vm.linkedDoc ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-zinc-900 truncate">{vm.linkedDoc.title || vm.linkedDoc.originalFilename}</div>
                <div className="text-xs text-zinc-600 truncate">
                  {vm.linkedDoc.originalFilename} • v{vm.linkedDoc.version}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Pill cls={statusTone(vm.linkedDoc.status)}>{(vm.linkedDoc.status || "").toUpperCase()}</Pill>
                {vm.linkedDoc.lockedAt ? <Pill cls={tone("ok")}>Locked</Pill> : <Pill cls={tone("warn")}>Not locked</Pill>}

                <a
                  href={pdfHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                >
                  Preview
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-700">No linked document found. Use Extract tools to lock the correct brief PDF.</div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Header snapshot (extracted)</h3>
              <p className="mt-1 text-sm text-zinc-700">
                Snapshot of the brief’s cover/header fields. These are extracted for auditability.
              </p>
            </div>
            <Pill cls={header ? tone("ok") : tone("warn")}>{header ? "Extracted" : "Not extracted yet"}</Pill>
          </div>

          {missingHeaderFields.length ? (
            <div className="mt-2 text-xs text-amber-900">
              Missing fields: {missingHeaderFields.join(", ")}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {headerFields.map((field) => (
              <Field key={field.label} label={field.label} value={field.value} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Audit later</h2>
        <p className="mt-1 text-sm text-zinc-700">These counters populate once grading is implemented.</p>

        <div className="mt-4 grid gap-2">
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2">
            <div className="text-sm text-zinc-700">Submissions graded with this brief</div>
            <div className="text-sm font-semibold text-zinc-900">—</div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2">
            <div className="text-sm text-zinc-700">Last graded</div>
            <div className="text-sm font-semibold text-zinc-900">—</div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2">
            <div className="text-sm text-zinc-700">IV status (per year)</div>
            <div className="text-sm font-semibold text-zinc-900">—</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-600">Rule: grading records will reference the exact brief document used at the time (no drift).</div>
      </section>
    </div>
  );
}
