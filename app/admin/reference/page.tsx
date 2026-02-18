"use client";

import { formatDate, getInboxCounts, type Criterion, type Unit, useReferenceAdmin } from "./reference.logic";
import { ReferenceList } from "./components/ReferenceList";
import { ReferenceToolbar } from "./components/ReferenceToolbar";


export default function ReferenceAdminPage() {
  const vm = useReferenceAdmin();

  return (
    <div className="grid min-w-0 gap-4">
      <header className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
              Reference Operations
            </div>
            <h1 className="mt-1 text-sm font-semibold tracking-tight text-zinc-900">Reference library</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Upload a <span className="font-semibold">SPEC</span> or <span className="font-semibold">BRIEF</span>, run{" "}
              <span className="font-semibold">Extract</span>, review learning outcomes/criteria, then{" "}
              <span className="font-semibold">Lock</span> to store the final version used by grading.
            </p>
            <p className="mt-1 text-xs text-zinc-500">Workflow: Upload → Select → Extract → Review → Lock</p>
          </div>

          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
            {vm.busy ? `Working: ${vm.busy}` : "Ready"}
          </span>
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
              type="file"
              onChange={(e) => vm.setDocFile(e.target.files?.[0] || null)}
              className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-sky-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-800"
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
            (vm.busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-sky-700 text-white hover:bg-sky-800")
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
  const counts = getInboxCounts(vm.documents, vm.filteredDocuments);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <ReferenceToolbar filters={f} setFilters={setF} resetFilters={vm.resetFilters} counts={counts} />
      <ReferenceList
        documents={vm.filteredDocuments}
        selectedDocId={vm.selectedDocId}
        onSelect={vm.setSelectedDocId}
      />
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
                : "bg-sky-700 text-white hover:bg-sky-800")
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

          <UnitEditorPanel vm={vm} />

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

function UnitEditorPanel({ vm }: { vm: ReturnType<typeof useReferenceAdmin> }) {
  if (!vm.selectedDoc || vm.selectedDoc.type !== "SPEC") return null;

  const unit = vm.selectedUnit;
  const archived = !!unit?.sourceMeta?.archived;
  const busy = !!vm.busy;

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-600">Unit editor</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">
            {unit ? `${unit.unitCode} — ${unit.unitTitle}` : "No unit found for this spec"}
          </div>
        </div>

        {unit ? (
          <span
            className={
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " +
              (archived ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")
            }
          >
            {archived ? "ARCHIVED" : "ACTIVE"}
          </span>
        ) : null}
      </div>

      {vm.unitNotice ? (
        <div
          className={
            "mt-3 rounded-xl border p-3 text-sm " +
            (vm.unitNotice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900")
          }
        >
          {vm.unitNotice.text}
        </div>
      ) : null}

      {!unit ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          Lock this spec to create a unit before editing its metadata.
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-zinc-600">Unit code</span>
            <input
              value={vm.editUnitCode}
              onChange={(e) => vm.setEditUnitCode(e.target.value)}
              className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-600">Unit title</span>
            <input
              value={vm.editUnitTitle}
              onChange={(e) => vm.setEditUnitTitle(e.target.value)}
              className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-600">Spec label</span>
            <input
              value={vm.editSpecLabel}
              onChange={(e) => vm.setEditSpecLabel(e.target.value)}
              className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={vm.saveSelectedUnit}
              disabled={!vm.unitDirty || busy}
              className={
                "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                (!vm.unitDirty || busy
                  ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                  : "bg-sky-700 text-white hover:bg-sky-800")
              }
            >
              Save
            </button>
            <button
              type="button"
              onClick={vm.toggleUnitArchive}
              disabled={busy}
              className={
                "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                (busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-amber-600 text-white hover:bg-amber-500")
              }
            >
              {archived ? "Unarchive" : "Archive"}
            </button>
            <button
              type="button"
              onClick={vm.deleteSelectedUnit}
              disabled={busy}
              className={
                "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                (busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-rose-600 text-white hover:bg-rose-500")
              }
            >
              Delete (safe)
            </button>
          </div>
        </div>
      )}
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

