"use client";

import { useMemo, useState } from "react";
import {
  badge,
  formatDate,
  type Criterion,
  type ReferenceDocument,
  type Unit,
  useReferenceAdmin,
} from "./reference.logic";




export default function ReferenceAdminPage() {
  const vm = useReferenceAdmin();

  return (
    <div className="grid gap-4">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reference library</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Upload a <span className="font-semibold">SPEC</span> or <span className="font-semibold">BRIEF</span>, run{" "}
              <span className="font-semibold">Extract</span>, review learning outcomes/criteria, then{" "}
              <span className="font-semibold">Lock</span> to store the final version used by grading.
            </p>
            <p className="mt-1 text-xs text-zinc-500">Workflow: Upload → Select → Extract → Review → Lock</p>
          </div>

          <div className="text-xs text-zinc-600">{vm.busy ? <span>⏳ {vm.busy}</span> : <span>Ready</span>}</div>
        </div>

        {vm.error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{vm.error}</div>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="grid gap-4">
          <UploadCard vm={vm} />
          <InboxCard vm={vm} />
        </div>

        <ReviewCard vm={vm} />
      </div>
    </div>
  );
}

function UploadCard({ vm }: { vm: ReturnType<typeof useReferenceAdmin> }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">Upload</h2>
      <p className="mt-1 text-xs text-zinc-500">Add new specs/briefs to the inbox. Extraction happens on demand.</p>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Type</span>
          <select
            value={vm.docType}
            onChange={(e) => vm.setDocType(e.target.value as any)}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
          >
            <option value="SPEC">SPEC</option>
            <option value="BRIEF">BRIEF</option>
            <option value="RUBRIC">RUBRIC</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Title</span>
          <input
            value={vm.docTitle}
            onChange={(e) => vm.setDocTitle(e.target.value)}
            placeholder="e.g. Unit 4017 Spec"
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Version</span>
            <input
              value={vm.docVersion}
              onChange={(e) => vm.setDocVersion(e.target.value)}
              className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">File</span>
            <input
              ref={vm.fileRef}
              type="file"
              onChange={(e) => vm.setDocFile(e.target.files?.[0] || null)}
              className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
            />
          </label>
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={vm.uploadDoc}
          disabled={!!vm.busy}
          className={
            "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
            (vm.busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")
          }
        >
          Upload
        </button>
      </div>
    </section>
  );
}

function InboxCard({ vm }: { vm: ReturnType<typeof useReferenceAdmin> }) {
  const f = vm.filters;
  const setF = vm.setFilters;

  const counts = useMemo(() => {
    const total = vm.documents.length;
    const shown = vm.filteredDocuments.length;
    const byStatus: Record<string, number> = {};
    for (const d of vm.documents) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    return { total, shown, byStatus };
  }, [vm.documents, vm.filteredDocuments]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Inbox</h2>
          <p className="mt-1 text-xs text-zinc-500">Filter and select a document to review.</p>
        </div>

        <button
          onClick={vm.resetFilters}
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Reset filters
        </button>
      </div>

      {/* Filters */}
      <div className="mt-3 grid gap-2">
        <input
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
          placeholder="Search title, filename, unit code…"
          className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={f.type}
            onChange={(e) => setF({ ...f, type: e.target.value as any })}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">All types</option>
            <option value="SPEC">SPEC</option>
            <option value="BRIEF">BRIEF</option>
            <option value="RUBRIC">RUBRIC</option>
          </select>

          <select
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value as any })}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="UPLOADED">UPLOADED</option>
            <option value="EXTRACTED">EXTRACTED</option>
            <option value="REVIEWED">REVIEWED</option>
            <option value="LOCKED">LOCKED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={f.onlyLocked}
              onChange={(e) => setF({ ...f, onlyLocked: e.target.checked, onlyUnlocked: e.target.checked ? false : f.onlyUnlocked })}
            />
            Only locked
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={f.onlyUnlocked}
              onChange={(e) => setF({ ...f, onlyUnlocked: e.target.checked, onlyLocked: e.target.checked ? false : f.onlyLocked })}
            />
            Only unlocked
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={f.sort}
            onChange={(e) => setF({ ...f, sort: e.target.value as any })}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="updated">Sort: updated</option>
            <option value="uploaded">Sort: uploaded</option>
            <option value="title">Sort: title</option>
          </select>

          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
            Showing <span className="font-semibold text-zinc-900">{counts.shown}</span> of{" "}
            <span className="font-semibold text-zinc-900">{counts.total}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {(["UPLOADED", "EXTRACTED", "LOCKED", "FAILED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setF({ ...f, status: f.status === s ? "" : (s as any) })}
              className={
                "rounded-full border px-3 py-1 font-semibold " +
                (f.status === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
              }
            >
              {s} <span className="opacity-70">({counts.byStatus[s] || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="mt-3 max-h-[520px] overflow-auto rounded-xl border border-zinc-200">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-xs text-zinc-600">
              <th className="border-b border-zinc-200 px-3 py-2">Status</th>
              <th className="border-b border-zinc-200 px-3 py-2">Type</th>
              <th className="border-b border-zinc-200 px-3 py-2">Title</th>
            </tr>
          </thead>
          <tbody>
            {vm.filteredDocuments.map((d) => {
              const b = badge(d.status);
              const active = d.id === vm.selectedDocId;
              const meta = d.sourceMeta || {};
              const hint = [meta.unitCode ? `Unit ${meta.unitCode}` : "", meta.assignmentCode ? meta.assignmentCode : ""]
                .filter(Boolean)
                .join(" • ");

              return (
                <tr
                  key={d.id}
                  onClick={() => vm.setSelectedDocId(d.id)}
                  className={
                    "cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 " + (active ? "bg-zinc-50" : "bg-white")
                  }
                >
                  <td className="px-3 py-2">
                    <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " + b.cls}>
                      {b.text}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{d.type}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-zinc-900">{d.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-600">{hint || d.originalFilename}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {vm.filteredDocuments.length === 0 ? (
          <div className="p-3 text-sm text-zinc-600">No documents match your filters.</div>
        ) : null}
      </div>
    </section>
  );
}

function ReviewCard({ vm }: { vm: ReturnType<typeof useReferenceAdmin> }) {
  const selectedDoc = vm.selectedDoc;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Review</h2>
          <p className="mt-1 text-xs text-zinc-500">Extract builds a draft. Lock saves the final reference used by grading.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={vm.extractSelected}
            disabled={!selectedDoc || !!vm.busy}
            className={
              "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
              (!selectedDoc || vm.busy
                ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                : "bg-zinc-900 text-white hover:bg-zinc-800")
            }
          >
            Extract
          </button>

          {selectedDoc?.lockedAt ? (
            <button
              onClick={vm.reextractSelected}
              disabled={!selectedDoc || !!vm.busy}
              className={
                "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                (!selectedDoc || vm.busy
                  ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                  : "bg-amber-600 text-white hover:bg-amber-500")
              }
            >
              Re-extract (overwrite)
            </button>
          ) : null}

          <button
            onClick={vm.lockSelected}
            disabled={!selectedDoc || !!vm.busy}
            className={
              "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
              (!selectedDoc || vm.busy
                ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                : "bg-emerald-700 text-white hover:bg-emerald-600")
            }
          >
            Approve & Lock
          </button>
        </div>
      </div>

      {!selectedDoc ? (
        <p className="mt-4 text-sm text-zinc-600">Select a document from the inbox to review it.</p>
      ) : (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Type" value={selectedDoc.type} />
            <Meta label="Uploaded" value={formatDate(selectedDoc.uploadedAt)} />
            <Meta label="Status" value={selectedDoc.status} />
            <Meta label="Locked at" value={formatDate(selectedDoc.lockedAt)} />
          </div>

          {selectedDoc.extractionWarnings && Array.isArray(selectedDoc.extractionWarnings) && selectedDoc.extractionWarnings.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Warnings</div>
              <ul className="mt-2 list-disc pl-5">
                {selectedDoc.extractionWarnings.map((w: string, idx: number) => (
                  <li key={idx} className="break-words">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4">
            {selectedDoc.type === "SPEC" ? (
              <SpecPreview draft={selectedDoc.extractedJson} />
            ) : selectedDoc.type === "BRIEF" ? (
              <BriefPreview
                draft={selectedDoc.extractedJson}
                units={vm.units}
                briefUnitId={vm.briefUnitId}
                setBriefUnitId={vm.setBriefUnitId}
                criteria={vm.criteriaForSelectedUnit}
                mapSelected={vm.mapSelected}
                setMapSelected={vm.setMapSelected}
                assignmentCodeInput={vm.assignmentCodeInput}
                setAssignmentCodeInput={vm.setAssignmentCodeInput}
              />
            ) : (
              <p className="text-sm text-zinc-600">
                RUBRIC ingestion UI lands later; for now it stays as a stored document.
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vm.showRawJson} onChange={(e) => vm.setShowRawJson(e.target.checked)} />
              Show raw extracted JSON (advanced)
            </label>

            {vm.showRawJson ? (
              <textarea
                value={vm.rawJson}
                onChange={(e) => vm.setRawJson(e.target.value)}
                className="mt-2 h-[240px] w-full rounded-xl border border-zinc-300 p-3 font-mono text-xs"
                placeholder="Extract draft JSON will appear here after Extract."
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="mt-0.5 break-words text-sm font-semibold text-zinc-900">{value || "-"}</div>
    </div>
  );
}

/* -------------------- SPEC Preview -------------------- */

function SpecPreview({ draft }: { draft: any }) {
  if (!draft) return <p className="text-sm text-zinc-600">No draft extracted yet. Click Extract.</p>;
  if (draft.kind !== "SPEC") return <p className="text-sm text-zinc-600">This draft is not a SPEC.</p>;

  const unit = draft.unit || {};
  const los = Array.isArray(draft.learningOutcomes) ? draft.learningOutcomes : [];
  const totalCriteria = los.reduce((n: number, lo: any) => n + (lo.criteria?.length || 0), 0);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 p-4">
        <div>
          <div className="text-xs text-zinc-600">SPEC preview</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">
            {unit.unitCode ? `${unit.unitCode} — ${unit.unitTitle || ""}` : "(Unit not detected)"}
          </div>
          <div className="mt-1 text-sm text-zinc-700">
            {los.length} learning outcomes • {totalCriteria} assessment criteria
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-xs text-zinc-600">Spec label</div>
          <div className="text-sm font-semibold text-zinc-900">{unit.specVersionLabel || unit.specIssue || "(not detected)"}</div>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {los.length === 0 ? (
          <p className="text-sm text-zinc-600">No learning outcomes detected.</p>
        ) : (
          los.map((lo: any, idx: number) => {
            const criteria = Array.isArray(lo.criteria) ? lo.criteria : [];
            return (
              <div key={`${lo.loCode}-${idx}`} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-600">Learning outcome</div>

                    {/* ✅ Wrap correctly so it never “cuts” the LO text */}
                    <div className="mt-1 flex flex-wrap items-start gap-3">
                      <span className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-bold text-zinc-900">
                        {lo.loCode}
                      </span>
                      <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 leading-relaxed break-words whitespace-pre-wrap">
                        {lo.description || ""}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-600">{criteria.length} criteria</div>
                </div>

                <div className="mt-3">
                  {criteria.length === 0 ? (
                    <p className="text-sm text-zinc-600">(none)</p>
                  ) : (
                    <ul className="grid gap-2">
                      {criteria.map((c: any, cidx: number) => (
                        <li key={`${c.acCode}-${cidx}`} className="rounded-xl border border-zinc-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-bold text-zinc-900">
                              {c.acCode}
                            </span>
                            <span className="text-xs text-zinc-600">{c.gradeBand}</span>
                          </div>

                          <details className="mt-2">
                            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-800">
                              Show criterion text
                            </summary>
                            <p className="mt-2 text-sm text-zinc-900 leading-relaxed break-words whitespace-pre-wrap">
                              {c.description || ""}
                            </p>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {lo.essentialContent ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Essential content (reference)</summary>
                    <p className="mt-2 text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap break-words">
                      {String(lo.essentialContent)}
                    </p>
                  </details>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* -------------------- BRIEF preview -------------------- */

function BriefPreview({
  draft,
  units,
  briefUnitId,
  setBriefUnitId,
  criteria,
  mapSelected,
  setMapSelected,
  assignmentCodeInput,
  setAssignmentCodeInput,
}: {
  draft: any;
  units: Unit[];
  briefUnitId: string;
  setBriefUnitId: (id: string) => void;
  criteria: Criterion[];
  mapSelected: Record<string, boolean>;
  setMapSelected: (x: Record<string, boolean>) => void;
  assignmentCodeInput: string;
  setAssignmentCodeInput: (v: string) => void;
}) {
  if (!draft) return <p className="text-sm text-zinc-600">No draft extracted yet. Click Extract.</p>;
  if (draft.kind !== "BRIEF") return <p className="text-sm text-zinc-600">This draft is not a BRIEF.</p>;

  const codes: string[] = (draft.detectedCriterionCodes || []).map((x: string) => String(x).toUpperCase());
  const unitGuess = draft.unitCodeGuess ? String(draft.unitCodeGuess) : "";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="text-xs text-zinc-600">BRIEF preview</div>

      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <div className="text-xs text-zinc-600">Assignment</div>
          <div className="mt-1 font-semibold text-zinc-900 break-words">
            {draft.assignmentCode || "(missing)"} — {draft.title || "(title not detected)"}
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-zinc-600">Assignment code (required to lock)</div>
            <input
              value={assignmentCodeInput}
              onChange={(e) => setAssignmentCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. A1"
              className="h-10 w-36 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </div>

          {draft.assignmentNumber ? (
            <div className="mt-2 text-xs text-zinc-600">
              Assignment {draft.assignmentNumber} of {draft.totalAssignments || "?"}
            </div>
          ) : null}
        </div>

        <div>
          <div className="text-xs text-zinc-600">Detected unit</div>
          <div className="mt-1 font-semibold text-zinc-900">{unitGuess ? `Unit ${unitGuess}` : "(not detected)"}</div>
          {draft.aiasLevel ? <div className="mt-1 text-xs text-zinc-600">AIAS Level {draft.aiasLevel}</div> : null}
        </div>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-4">
        <label className="text-xs text-zinc-600">Link this brief to a unit</label>
        <div className="mt-1">
          <select
            value={briefUnitId}
            onChange={(e) => setBriefUnitId(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">(select unit...)</option>
            {units
              // Only show ACTIVE (non-archived) LOCKED specs by default.
              // Archived issues remain in the Library for audit/history but should not be the default binding target.
              .filter((u) => u.status === "LOCKED" && !(u as any)?.sourceMeta?.archived)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitCode} — {u.unitTitle}
                  {(() => {
                    const issue = (u as any)?.specIssue || (u as any)?.specDocument?.sourceMeta?.specIssue;
                    return issue ? ` (${issue})` : "";
                  })()}
                </option>
              ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Only ACTIVE (non-archived) locked specs are shown here.
        </p>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-4">
        <div className="font-semibold text-zinc-900">Criteria mapping</div>
        <p className="mt-1 text-sm text-zinc-700 break-words">
          Detected codes: <span className="font-semibold">{codes.length ? codes.join(", ") : "(none)"}</span>
        </p>

        {!briefUnitId ? (
          <p className="mt-2 text-sm text-zinc-600">Select a unit to view criteria and confirm mapping.</p>
        ) : (
          <div className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-zinc-200 p-3">
            {criteria.length === 0 ? (
              <p className="text-sm text-zinc-600">No criteria found for that unit (is the spec locked?).</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {criteria.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 p-2">
                    <input
                      type="checkbox"
                      checked={!!mapSelected[c.acCode]}
                      onChange={(e) => setMapSelected({ ...mapSelected, [c.acCode]: e.target.checked })}
                    />
                    <span className="text-sm font-semibold text-zinc-900">{c.acCode}</span>
                    <span className="text-xs text-zinc-600">{c.learningOutcome.loCode}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
