"use client";

import { useMemo, useState } from "react";
import LibraryView from "../library/LibraryView";
import { badge, useReferenceAdmin } from "../reference/reference.logic";
import { LoCriteriaGrid } from "@/components/spec/LoCriteriaGrid";

export default function SpecsAdminPage() {
  const [tab, setTab] = useState<"library" | "extract">("library");
  const vm = useReferenceAdmin({
    context: "specs",
    fixedInboxType: "SPEC",
    fixedUploadType: "SPEC",
  });

  return (
    <div className="grid min-w-0 gap-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Specs</h1>
            <p className="mt-1 text-sm text-zinc-700">Specs define the criteria universe. Upload/extract, then lock the authoritative issue used by grading.</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
            {vm.busy ? `⏳ ${vm.busy}` : "Ready"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (tab === "library" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setTab("extract")}
            className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (tab === "extract" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")}
          >
            Extract tools
          </button>
        </div>
      </section>

      {tab === "library" ? <LibraryView showHeader={false} /> : <SpecsWorkbench vm={vm} />}
    </div>
  );
}

function SpecsWorkbench({ vm }: { vm: ReturnType<typeof useReferenceAdmin> }) {
  const [showGuide, setShowGuide] = useState(true);
  const filters = vm.filters;
  const setFilters = vm.setFilters;
  const extracted = (vm.selectedDoc?.extractedJson || null) as any;
  const los = Array.isArray(extracted?.learningOutcomes) ? extracted.learningOutcomes : [];

  const counts = useMemo(() => ({ total: vm.documents.length, shown: vm.filteredDocuments.length }), [vm.documents.length, vm.filteredDocuments.length]);

  return (
    <div className="grid gap-4 min-w-0">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => vm.refreshAll()} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50">Refresh</button>
          <button type="button" onClick={vm.extractSelected} disabled={!vm.selectedDoc || !!vm.busy} className="rounded-xl bg-zinc-900 px-3 py-2 font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300">Extract</button>
          <button type="button" onClick={vm.reextractSelected} disabled={!vm.selectedDoc || !!vm.busy} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50">Re-extract</button>
          <button type="button" onClick={vm.lockSelected} disabled={!vm.selectedDoc || !!vm.busy} className="rounded-xl bg-emerald-600 px-3 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300">Lock</button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <button type="button" onClick={() => setShowGuide((v) => !v)} className="text-xs font-semibold text-zinc-700 hover:text-zinc-900">
          {showGuide ? "Hide" : "Show"} what locking does
        </button>
        {showGuide ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-700">
            <li>Locks the reference version used for grading.</li>
            <li>Prevents accidental re-extract drift.</li>
            <li>Creates an audit trail for QA/IV.</li>
          </ul>
        ) : null}
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[380px_1fr]">
        <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Units list</h2>
          <div className="mt-3 grid gap-2">
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search title, filename, unit code…" className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: (e.target.value as any) || "" })} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">
              <option value="">All statuses</option>
              <option value="UPLOADED">UPLOADED</option>
              <option value="EXTRACTED">EXTRACTED</option>
              <option value="REVIEWED">REVIEWED</option>
              <option value="LOCKED">LOCKED</option>
              <option value="FAILED">FAILED</option>
            </select>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">Showing {counts.shown} of {counts.total}</div>
          </div>

          <div className="mt-3 grid max-h-[60vh] gap-2 overflow-auto pr-1">
            {vm.filteredDocuments.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No locked specs yet. Upload a spec to begin.</div>
            ) : (
              vm.filteredDocuments.map((d) => {
                const active = vm.selectedDocId === d.id;
                const b = badge(d.status);
                return (
                  <button key={d.id} type="button" onClick={() => vm.setSelectedDocId(d.id)} className={"rounded-xl border p-3 text-left " + (active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50")}>
                    <div className={"inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " + b.cls}>{b.text}</div>
                    <div className="mt-2 text-sm font-semibold">{d.title}</div>
                    <div className={"mt-1 text-xs " + (active ? "text-zinc-200" : "text-zinc-500")}>v{d.version}</div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
          <h2 className="text-sm font-semibold">Spec viewer</h2>
          {!vm.selectedDoc ? (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">Select a unit to view locked content.</div>
          ) : (
            <div className="mt-3 grid gap-3 min-w-0">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Selected spec</div>
                <div className="text-sm font-semibold text-zinc-900">{vm.selectedDoc.title}</div>
              </div>
              {los.length ? (
                <div className="max-h-[68vh] overflow-auto pr-1">
                  <LoCriteriaGrid learningOutcomes={los} />
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No extracted structure yet. Click Extract to generate LO/AC.</div>
              )}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
