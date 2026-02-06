"use client";

import { useRef } from "react";
import LibraryView from "../library/LibraryView";
import { ui } from "@/components/ui/uiClasses";
import { useSpecsAdmin } from "./specs.logic";
import { SpecList, SpecViewer, UnitEditorPanel } from "./specs.ui";

function toneCls(tone: "success" | "error" | "warn"): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

export default function SpecsAdminPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const admin = useSpecsAdmin();
  const { vm } = admin;

  return (
    <div className="grid min-w-0 gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => {
          admin.uploadFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />

      <div className="pointer-events-none fixed right-4 top-4 z-50 grid gap-2">
        {admin.toasts.map((t) => (
          <div key={t.id} className={"pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-sm " + toneCls(t.tone)}>
            {t.text}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Specs</h1>
            <p className="mt-1 text-sm text-zinc-700">Specs define the criteria universe. Upload, extract, review, then lock.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={admin.uploading}
              className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              Upload spec
            </button>
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              {admin.uploading ? admin.uploadStatus : vm.busy ? `⏳ ${vm.busy}` : "Ready"}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => admin.setTab("library")}
            className={
              "rounded-xl border px-4 py-2 text-sm font-semibold " +
              (admin.tab === "library" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
            }
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => admin.setTab("extract")}
            className={
              "rounded-xl border px-4 py-2 text-sm font-semibold " +
              (admin.tab === "extract" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
            }
          >
            Extract tools
          </button>
        </div>
      </section>

      {admin.tab === "library" ? (
        <LibraryView showHeader={false} />
      ) : (
        <section className="grid min-w-0 gap-4">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" onClick={() => vm.refreshAll()} className={ui.btnSecondary}>Refresh</button>
              <button type="button" onClick={vm.extractSelected} disabled={!vm.selectedDoc || !!vm.busy} className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}>Extract</button>
              <button type="button" onClick={vm.reextractSelected} disabled={!vm.selectedDoc || !!vm.busy} className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-50"}>Re-extract</button>
              <button type="button" onClick={vm.lockSelected} disabled={!vm.selectedDoc || !!vm.busy} className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}>Lock</button>
            </div>
          </article>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[360px_1fr]">
            <SpecList
              documents={vm.filteredDocuments}
              selectedDocId={vm.selectedDocId}
              onSelect={vm.setSelectedDocId}
              q={vm.filters.q}
              status={vm.filters.status}
              onQueryChange={(next) => vm.setFilters({ ...vm.filters, q: next })}
              onStatusChange={(next) => vm.setFilters({ ...vm.filters, status: (next as any) || "" })}
              counts={admin.counts}
            />
            <div className="grid min-w-0 gap-4">
              <UnitEditorPanel selectedDoc={vm.selectedDoc} learningOutcomes={admin.learningOutcomes} />
              <SpecViewer selectedDoc={vm.selectedDoc} learningOutcomes={admin.learningOutcomes} />
            </div>
          </section>
        </section>
      )}
    </div>
  );
}
