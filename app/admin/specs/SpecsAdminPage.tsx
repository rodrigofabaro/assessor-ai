"use client";

/**
 * Admin → Specs
 * ------------
 * Specs are the grading ground truth (unit LO/AC) and are versioned by issue.
 *
 * UX rule:
 * - This page has two modes (tabs): Library and Extract tools.
 * - Extract tools is SPEC-only: it must never display BRIEF content.
 */

import { useMemo, useState } from "react";
import LibraryView from "../library/LibraryView";
import { badge, useReferenceAdmin } from "../reference/reference.logic";
import PageContainer from "@/components/PageContainer";
import { LoCriteriaGrid } from "@/components/spec/LoCriteriaGrid";



export default function SpecsAdminPage() {
  const [tab, setTab] = useState<"library" | "extract">("library");

  // IMPORTANT: fixed types ensure we never show BRIEF docs on this page.
  const vm = useReferenceAdmin({
    context: "specs",
    fixedInboxType: "SPEC",
    fixedUploadType: "SPEC",
  });

  return (
    <PageContainer>
      <div className="grid gap-6 min-w-0">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Specs</h1>
              <p className="mt-1 text-sm text-zinc-700">
                Specs are the grading ground truth. Upload, extract LOs/criteria, and lock the authoritative issue used by
                marking.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                {vm.busy ? `⏳ ${vm.busy}` : "Ready"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("library")}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold border " +
                (tab === "library"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
              }
            >
              Library
            </button>
            <button
              type="button"
              onClick={() => setTab("extract")}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold border " +
                (tab === "extract"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
              }
            >
              Extract tools
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">What locking does</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
            <li>Locks the criteria universe used by grading.</li>
            <li>Preserves version traceability (issue/version label).</li>
            <li>Prevents drift during re-extracts.</li>
          </ul>
        </section>

        {tab === "library" ? <LibraryView showHeader={false} /> : <SpecWorkbench vm={vm} />}
      </div>
    </PageContainer>
  );
}

function SpecWorkbench({ vm }: { vm: ReturnType<typeof useReferenceAdmin> }) {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Spec extraction</div>
          <p className="mt-1 text-xs text-zinc-600">
            Upload a <span className="font-semibold">SPEC</span>, run Extract, review LO/AC, then Lock.
          </p>
        </div>

        {/* ✅ small, always-available action */}
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Upload new spec
        </button>
      </div>

      {vm.error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{vm.error}</div>
      ) : null}

      {/* ✅ Layout now prioritizes Inbox */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[420px_1fr] min-w-0">
        <div className="grid gap-4 min-w-0">
          <InboxCard vm={vm} />
        </div>
        <ReviewCard vm={vm} />
      </div>

      {/* ✅ Upload modal */}
      {showUpload ? <UploadModal vm={vm} onClose={() => setShowUpload(false)} /> : null}
    </section>
  );
}

function UploadModal({ vm, onClose }: { vm: ReturnType<typeof useReferenceAdmin>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/30"
        onClick={() => (vm.busy ? null : onClose())}
        aria-label="Close upload modal"
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="text-sm font-semibold">Upload spec</div>

          <button
            type="button"
            onClick={() => (vm.busy ? null : onClose())}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          <UploadForm vm={vm} onDone={onClose} />
        </div>
      </div>
    </div>
  );
}

function UploadForm({ vm, onDone }: { vm: ReturnType<typeof useReferenceAdmin>; onDone: () => void }) {
  return (
    <div className="grid gap-3">
      <div className="text-xs text-zinc-500">Add a new spec issue. Extraction happens on demand.</div>

      <div className="grid gap-1">
        <span className="text-sm font-medium">Type</span>
        <div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm flex items-center">
          SPEC
        </div>
      </div>

      <label className="grid gap-1">
        <span className="text-sm font-medium">Title</span>
        <input
          value={vm.docTitle}
          onChange={(e) => vm.setDocTitle(e.target.value)}
          placeholder="e.g. Unit 4014 Spec — Issue 5 (June 2025)"
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
            className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
          />
        </label>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={async () => {
            await vm.uploadDoc();
            onDone(); // close modal after upload attempt
          }}
          disabled={!!vm.busy}
          className={
            "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
            (vm.busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")
          }
        >
          Upload
        </button>

        <button
          type="button"
          onClick={onDone}
          disabled={!!vm.busy}
          className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
        >
          Cancel
        </button>

        <div className="ml-auto text-xs text-zinc-600">{vm.busy ? `⏳ ${vm.busy}` : "Ready"}</div>
      </div>
    </div>
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
          <p className="mt-1 text-xs text-zinc-500">SPEC documents only.</p>
        </div>

        <button
          onClick={vm.resetFilters}
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Reset filters
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <input
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
          placeholder="Search title, filename, unit code…"
          className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm flex items-center">Type: SPEC</div>

          <select
            value={f.status}
            onChange={(e) => setF({ ...f, status: (e.target.value as any) || "" })}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="UPLOADED">UPLOADED</option>
            <option value="EXTRACTED">EXTRACTED</option>
            <option value="REVIEWED">REVIEWED</option>
            <option value="LOCKED">LOCKED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={!!f.onlyLocked}
              onChange={(e) => setF({ ...f, onlyLocked: e.target.checked, onlyUnlocked: e.target.checked ? false : f.onlyUnlocked })}
            />
            Only locked
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={!!f.onlyUnlocked}
              onChange={(e) => setF({ ...f, onlyUnlocked: e.target.checked, onlyLocked: e.target.checked ? false : f.onlyLocked })}
            />
            Only unlocked
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={f.sort}
            onChange={(e) => setF({ ...f, sort: e.target.value as any })}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
          >
            <option value="updated">Sort: updated</option>
            <option value="uploaded">Sort: uploaded</option>
            <option value="title">Sort: title</option>
          </select>

          <div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm flex items-center">
            Showing {counts.shown} of {counts.total}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 max-h-[55vh] overflow-auto pr-1">
        {vm.filteredDocuments.map((d) => {
          const active = vm.selectedDocId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => vm.setSelectedDocId(d.id)}
              className={
                "w-full rounded-xl border p-3 text-left transition " +
                (active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold " +
                    badge(d.status).cls
                  }
                >
                  {badge(d.status).text}
                </span>
                <span className={"text-xs " + (active ? "text-zinc-200" : "text-zinc-500")}>v{d.version}</span>
              </div>

              <div className="mt-2 text-sm font-semibold leading-5">{d.title}</div>
              <div className={"mt-1 text-xs " + (active ? "text-zinc-200" : "text-zinc-600")}>{d.originalFilename}</div>
            </button>
          );
        })}

        {vm.filteredDocuments.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            No docs match your filters.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReviewCard({ vm }: { vm: ReturnType<typeof useReferenceAdmin> }) {
  const doc = vm.selectedDoc;
  const extracted = (doc?.extractedJson || null) as any;
  const los = Array.isArray(extracted?.learningOutcomes) ? extracted.learningOutcomes : [];

  const canExtract = !!doc && !vm.busy;
  const canLock = !!doc && !vm.busy;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm min-w-0 overflow-hidden">
      <div className="border-b border-zinc-200 p-4">
        <div className="text-sm font-semibold">Review</div>
        <div className="mt-1 text-xs text-zinc-600">SPEC-only review.</div>
      </div>

      <div className="p-4 grid gap-4 min-w-0">
        {!doc ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            Select a SPEC document in the inbox to extract/review/lock.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-zinc-500">Selected</div>
                <div className="mt-1 text-sm font-semibold truncate">{doc.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={"inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold " + badge(doc.status).cls}>
                    {badge(doc.status).text}
                  </span>
                  <span className="text-xs text-zinc-500">v{doc.version}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canExtract}
                  onClick={vm.extractSelected}
                  className={
                    "rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition " +
                    (!canExtract ? "bg-zinc-100 text-zinc-500 cursor-not-allowed" : "bg-zinc-900 text-white hover:bg-zinc-800")
                  }
                >
                  Extract
                </button>
                <button
                  type="button"
                  disabled={!canExtract}
                  onClick={vm.reextractSelected}
                  className={
                    "rounded-xl px-4 py-2 text-sm font-semibold border transition " +
                    (!canExtract
                      ? "border-zinc-200 bg-white text-zinc-400 cursor-not-allowed"
                      : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
                  }
                >
                  Re-extract
                </button>
                <button
                  type="button"
                  disabled={!canLock}
                  onClick={vm.lockSelected}
                  className={
                    "rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition " +
                    (!canLock ? "bg-zinc-100 text-zinc-500 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-500")
                  }
                >
                  Lock
                </button>
              </div>
            </div>

            {Array.isArray(doc.extractionWarnings) && doc.extractionWarnings.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold">Warnings</div>
                <ul className="mt-2 list-disc pl-5">
                  {doc.extractionWarnings.slice(0, 8).map((w: any, idx: number) => (
                    <li key={idx} className="break-words">
                      {String(w)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* LO/AC preview */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-zinc-500">Parsed preview</div>
                  <div className="mt-1 text-sm font-semibold">Learning Outcomes &amp; Criteria</div>
                </div>
                <button
                  type="button"
                  onClick={() => vm.setShowRawJson((v) => !v)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  {vm.showRawJson ? "Hide raw JSON" : "Show raw JSON"}
                </button>
              </div>

              {vm.showRawJson ? (
                <textarea
                  value={vm.rawJson}
                  onChange={(e) => vm.setRawJson(e.target.value)}
                  spellCheck={false}
                  className="mt-3 h-[45vh] w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-400"
                />
) : los.length ? (
  <div className="mt-4 max-h-[70vh] overflow-auto pr-2">
    <LoCriteriaGrid learningOutcomes={los} />
  </div>
) : (

                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                  No extracted structure yet. Click <span className="font-semibold">Extract</span> to generate LO/AC.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
