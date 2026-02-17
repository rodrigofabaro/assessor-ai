"use client";

import { useRef, useState } from "react";
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
  const [dragActive, setDragActive] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const selectedDoc = vm.selectedDoc;
  const extractionWarnings = Array.isArray(selectedDoc?.extractionWarnings)
    ? (selectedDoc?.extractionWarnings as Array<string | null | undefined>).filter(Boolean)
    : [];

  const errorMessage = vm.error || "";
  const errorDetail = errorMessage.includes("\n\n") ? errorMessage.split("\n\n").slice(1).join("\n\n") : "";

  const isMissingFile =
    /REFERENCE_FILE_MISSING/i.test(errorMessage) ||
    extractionWarnings.some((w) => /File not found|REFERENCE_FILE_MISSING/i.test(String(w)));

  const isLocked = !!selectedDoc?.lockedAt;
  const isExtractError =
    !!errorMessage && /extract|reference_extract_error/i.test(errorMessage) && !isMissingFile;
  const hasWarningDetails = extractionWarnings.length > 0;

  const dragTone = dragActive
    ? "border-sky-400 bg-sky-50 text-sky-900"
    : "border-dashed border-zinc-200 bg-zinc-50 text-zinc-600";

  const canExtract = !!selectedDoc && !vm.busy && !isLocked;
  const selectedLabel = selectedDoc?.title || "No document selected";

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

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
              Specification Operations
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">Specification Library</h1>
            <p className="mt-2 text-sm text-zinc-700">
              Upload, extract, and approve unit specifications used as grading reference truth.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              {admin.uploading ? admin.uploadStatus : vm.busy ? `Processing: ${vm.busy}` : "Ready"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total specifications</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">{admin.counts.total}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtered results</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">{admin.counts.shown}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Selected specification</div>
            <div className="mt-1 truncate text-sm font-semibold text-zinc-900" title={selectedLabel}>{selectedLabel}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Upload specifications</h2>
            <p className="mt-1 text-xs text-zinc-500">Drag and drop PDF files or use file selection.</p>
          </div>
          <div className="flex items-center gap-2">
            {uploadOpen ? (
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Collapse
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setUploadOpen((prev) => !prev)}
              disabled={admin.uploading}
              className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              Upload files
            </button>
          </div>
        </div>

        {uploadOpen ? (
          <div className="mt-4 grid gap-3">
            <div
              className={"grid gap-2 rounded-2xl border-2 p-6 text-sm transition " + dragTone}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                const files = Array.from(e.dataTransfer?.files || []);
                admin.uploadFiles(files);
              }}
            >
              <div className="text-sm font-semibold text-zinc-900">Drop PDF files here</div>
              <div className="text-xs text-zinc-600">Files upload immediately and appear in the specification list.</div>
              <div className="text-xs text-zinc-500">Accepted format: PDF · Multiple files supported</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={admin.uploading}
                className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
              >
                Choose files
              </button>
              <span className="text-xs text-zinc-500">Uploads start immediately after selection.</span>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Upload panel collapsed. Click &quot;Upload files&quot; to add specifications.
          </div>
        )}
      </section>

      <section className="inline-flex w-fit items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => admin.setTab("library")}
          className={
            "rounded-lg px-4 py-2 text-sm font-semibold transition " +
            (admin.tab === "library"
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-100")
          }
        >
          Library
        </button>
        <button
          type="button"
          onClick={() => admin.setTab("extract")}
          className={
            "rounded-lg px-4 py-2 text-sm font-semibold transition " +
            (admin.tab === "extract"
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-100")
          }
        >
          Extraction tools
        </button>
      </section>

      {admin.tab === "library" ? (
        <LibraryView showHeader={false} />
      ) : (
        <section className="grid min-w-0 gap-4">
          <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-zinc-600">
                Selected document: <span className="font-semibold text-zinc-900">{selectedLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" onClick={() => vm.refreshAll()} className={ui.btnSecondary}>
                Refresh
              </button>
              <button
                type="button"
                onClick={vm.extractSelected}
                disabled={!canExtract}
                title={isLocked ? "This document is locked. Use Force re-extract to update extracted data." : ""}
                className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
              >
                Extract
              </button>
              <button
                type="button"
                onClick={vm.reextractSelected}
                disabled={!vm.selectedDoc || !!vm.busy}
                className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-50"}
              >
                {isLocked ? "Force re-extract" : "Re-extract"}
              </button>
              <button
                type="button"
                onClick={vm.lockSelected}
                disabled={!vm.selectedDoc || !!vm.busy}
                className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
              >
                Lock
              </button>
              </div>
            </div>

            {isLocked ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                This document is locked. Use <span className="font-semibold">Force re-extract</span> to update extracted data.
              </div>
            ) : null}

            {isMissingFile ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <div className="font-semibold">File missing for {selectedDoc?.title || "this document"}.</div>
                <div className="mt-1 text-xs text-rose-900/80">
                  The stored file path is invalid or the file was moved/deleted.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                  >
                    Re-upload to replace file
                  </button>
                  <button
                    type="button"
                    onClick={admin.archiveSelected}
                    disabled={!!vm.busy}
                    className={
                      "rounded-xl border px-3 py-2 text-xs font-semibold " +
                      (vm.busy
                        ? "cursor-not-allowed border-rose-200 bg-rose-100 text-rose-300"
                        : "border-rose-200 bg-white text-rose-900 hover:bg-rose-100")
                    }
                  >
                    Remove/Archive this record
                  </button>
                </div>
              </div>
            ) : null}

            {isExtractError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <div className="font-semibold">Extraction error</div>
                <div className="mt-1 text-xs text-rose-900/80">
                  {errorMessage.split("\n\n")[0]}
                </div>
                {errorDetail ? (
                  <details className="mt-2 text-xs text-rose-900/80">
                    <summary className="cursor-pointer font-semibold">Details</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed">{errorDetail}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}

            {!isMissingFile && !isExtractError && selectedDoc?.status === "FAILED" && hasWarningDetails ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <div className="font-semibold">Extraction failed</div>
                <div className="mt-2 text-xs text-rose-900/80">
                  Last extracted data is still shown below.
                </div>
                <details className="mt-2 text-xs text-rose-900/80">
                  <summary className="cursor-pointer font-semibold">Details</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed">
                    {extractionWarnings.join("\n")}
                  </pre>
                </details>
              </div>
            ) : null}
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
