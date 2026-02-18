"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const admin = useSpecsAdmin();
  const { vm } = admin;
  const tab = admin.tab;
  const setTab = admin.setTab;
  const uploading = admin.uploading;
  const uploadStatus = admin.uploadStatus;
  const toasts = admin.toasts;
  const uploadFiles = admin.uploadFiles;
  const archiveSelected = admin.archiveSelected;
  const counts = admin.counts;
  const learningOutcomes = admin.learningOutcomes;
  const filters = vm.filters;
  const setFilters = vm.setFilters;
  const selectedDocId = vm.selectedDocId;
  const setSelectedDocId = vm.setSelectedDocId;
  const refreshAll = vm.refreshAll;
  const extractSelected = vm.extractSelected;
  const lockSelected = vm.lockSelected;
  const reextractSelected = vm.reextractSelected;
  const [dragActive, setDragActive] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<"ALL" | "NEEDS_REVIEW" | "LOCKED" | "FAILED">("ALL");
  const [headerBusy, setHeaderBusy] = useState<null | "refresh" | "extract" | "lock">(null);
  const [rowBusy, setRowBusy] = useState<Record<string, "extract" | "lock" | undefined>>({});
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

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
  const totalDocs = vm.documents.length;
  const lockedDocs = vm.documents.filter((d: any) => !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED").length;
  const extractedDocs = vm.documents.filter((d: any) => ["EXTRACTED", "REVIEWED", "LOCKED"].includes(String(d.status || "").toUpperCase())).length;
  const failedDocs = vm.documents.filter((d: any) => String(d.status || "").toUpperCase() === "FAILED").length;
  const needsReviewDocs = vm.documents.filter((d: any) => {
    const s = String(d.status || "").toUpperCase();
    return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
  }).length;
  const docsWithWarnings = vm.documents.filter((d: any) => Array.isArray(d.extractionWarnings) && d.extractionWarnings.length > 0).length;
  const docsMissingFiles = vm.documents.filter((d: any) => /File not found|REFERENCE_FILE_MISSING/i.test(JSON.stringify(d.extractionWarnings || ""))).length;

  const quickCounts = useMemo(() => {
    const all = vm.filteredDocuments.length;
    const needsReview = vm.filteredDocuments.filter((d: any) => {
      const s = String(d.status || "").toUpperCase();
      return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
    }).length;
    const locked = vm.filteredDocuments.filter((d: any) => !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED").length;
    const failed = vm.filteredDocuments.filter((d: any) => String(d.status || "").toUpperCase() === "FAILED").length;
    return { all, needsReview, locked, failed };
  }, [vm.filteredDocuments]);

  const visibleDocuments = useMemo(() => {
    if (quickFilter === "ALL") return vm.filteredDocuments;
    if (quickFilter === "FAILED") return vm.filteredDocuments.filter((d: any) => String(d.status || "").toUpperCase() === "FAILED");
    if (quickFilter === "LOCKED") return vm.filteredDocuments.filter((d: any) => !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED");
    return vm.filteredDocuments.filter((d: any) => {
      const s = String(d.status || "").toUpperCase();
      return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
    });
  }, [vm.filteredDocuments, quickFilter]);

  const handleExtract = useCallback(async (docId?: string) => {
    const id = docId || selectedDocId;
    if (!id) return;
    if (docId) setRowBusy((prev) => ({ ...prev, [id]: "extract" }));
    if (!docId) setHeaderBusy("extract");
    try {
      if (selectedDocId !== id) setSelectedDocId(id);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await extractSelected();
    } finally {
      if (docId) setRowBusy((prev) => ({ ...prev, [id]: undefined }));
      if (!docId) setHeaderBusy(null);
    }
  }, [extractSelected, selectedDocId, setSelectedDocId]);

  const handleLock = useCallback(async (docId?: string) => {
    const id = docId || selectedDocId;
    if (!id) return;
    if (docId) setRowBusy((prev) => ({ ...prev, [id]: "lock" }));
    if (!docId) setHeaderBusy("lock");
    try {
      if (selectedDocId !== id) setSelectedDocId(id);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await lockSelected();
    } finally {
      if (docId) setRowBusy((prev) => ({ ...prev, [id]: undefined }));
      if (!docId) setHeaderBusy(null);
    }
  }, [lockSelected, selectedDocId, setSelectedDocId]);

  const handleRefresh = useCallback(async () => {
    setHeaderBusy("refresh");
    try {
      await refreshAll();
    } finally {
      setHeaderBusy(null);
    }
  }, [refreshAll]);

  const nextAction = useMemo(() => {
    if (failedDocs > 0) return "Resolve failed specs first to restore extraction health.";
    if (needsReviewDocs > 0) return `Review and lock ${needsReviewDocs} extracted spec${needsReviewDocs === 1 ? "" : "s"}.`;
    if (totalDocs === 0) return "Upload your first spec to start building the reference register.";
    return "Workspace is healthy. Continue reviewing and locking new uploads.";
  }, [failedDocs, needsReviewDocs, totalDocs]);

  const nextFocusDocId = useMemo(() => {
    const failed = visibleDocuments.find((d: any) => String(d.status || "").toUpperCase() === "FAILED");
    if (failed) return failed.id;
    const pending = visibleDocuments.find((d: any) => {
      const s = String(d.status || "").toUpperCase();
      return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
    });
    if (pending) return pending.id;
    return visibleDocuments[0]?.id || "";
  }, [visibleDocuments]);

  // Persist tab and filters in URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydratedFromUrl) {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const q = params.get("q");
      const status = params.get("status");
      const quick = params.get("quick");
      if (tab === "library" || tab === "extract") setTab(tab);
      if (q !== null || status !== null) {
        setFilters({
          ...filters,
          q: q ?? filters.q,
          status: (status ?? filters.status) as any,
        });
      }
      if (quick === "ALL" || quick === "NEEDS_REVIEW" || quick === "LOCKED" || quick === "FAILED") setQuickFilter(quick);
      setHydratedFromUrl(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    if (filters.q) params.set("q", filters.q); else params.delete("q");
    if (filters.status) params.set("status", filters.status); else params.delete("status");
    params.set("quick", quickFilter);
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [filters, hydratedFromUrl, quickFilter, setFilters, setTab, tab]);

  // Keyboard flow: / search, j/k move, e extract, l lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = String((e.target as HTMLElement | null)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (!visibleDocuments.length) return;
      const idx = Math.max(0, visibleDocuments.findIndex((d: any) => d.id === selectedDocId));
      if (e.key.toLowerCase() === "j") {
        const next = visibleDocuments[Math.min(visibleDocuments.length - 1, idx + 1)];
        if (next) setSelectedDocId(next.id);
      } else if (e.key.toLowerCase() === "k") {
        const prev = visibleDocuments[Math.max(0, idx - 1)];
        if (prev) setSelectedDocId(prev.id);
      } else if (e.key.toLowerCase() === "e") {
        if (selectedDocId) void handleExtract(selectedDocId);
      } else if (e.key.toLowerCase() === "l") {
        if (selectedDocId) void handleLock(selectedDocId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleExtract, handleLock, selectedDocId, setSelectedDocId, visibleDocuments]);

  // Auto-collapse upload after successful upload cycle.
  const prevUploadingRef = useRef(false);
  useEffect(() => {
    if (prevUploadingRef.current && !uploading && !vm.error) setUploadOpen(false);
    prevUploadingRef.current = uploading;
  }, [uploading, vm.error]);

  async function handleReextractWithGuard() {
    if (!vm.selectedDoc) return;
    if (vm.selectedDoc.lockedAt) {
      const typed = window.prompt("This spec is locked. Type REEXTRACT to confirm force re-extract.");
      if (typed !== "REEXTRACT") return;
    }
    await reextractSelected();
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
      <div className="grid min-w-0 gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />

      <div className="pointer-events-none fixed right-4 top-4 z-50 grid gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={"pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-sm " + toneCls(t.tone)}>
            {t.text}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Specifications</h1>
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-900">
              Register
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!!vm.busy}
              className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
            >
              {headerBusy === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setUploadOpen((prev) => !prev)}
              disabled={uploading}
              className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              {uploadOpen ? "Hide upload" : "Upload specs"}
            </button>
            <button
              type="button"
              onClick={() => void handleExtract()}
              disabled={!canExtract}
              title={!vm.selectedDoc ? "Select a specification first." : isLocked ? "Selected specification is locked." : ""}
              className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              {headerBusy === "extract" ? "Extracting..." : "Extract selected"}
            </button>
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              {uploading ? uploadStatus : vm.busy ? `Processing: ${vm.busy}` : "Ready"}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {[
            ["Total", totalDocs],
            ["Extracted", extractedDocs],
            ["Needs review", needsReviewDocs],
            ["Locked", lockedDocs],
            ["Failed", failedDocs],
            ["Health", `${docsWithWarnings} warnings · ${docsMissingFiles} missing`],
          ].map(([label, value]) => (
            <span
              key={String(label)}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-700"
            >
              <span className="text-zinc-500">{label}</span>
              <span className="text-zinc-900">{value}</span>
            </span>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <span className="font-semibold text-zinc-900">Next best action:</span> {nextAction}
          {nextFocusDocId ? (
            <button
              type="button"
              onClick={() => vm.setSelectedDocId(nextFocusDocId)}
              className="ml-2 inline-flex rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Focus item
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (tab === "library" ? "bg-cyan-700 text-white" : "text-zinc-700 hover:bg-zinc-100")
            }
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setTab("extract")}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (tab === "extract" ? "bg-cyan-700 text-white" : "text-zinc-700 hover:bg-zinc-100")
            }
          >
            Extract
          </button>
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
              disabled={uploading}
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
                uploadFiles(files);
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
                disabled={uploading}
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

      {tab === "library" ? (
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
                {headerBusy === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => void handleExtract()}
                disabled={!canExtract}
                title={isLocked ? "This document is locked. Use Force re-extract to update extracted data." : ""}
                className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
              >
                {headerBusy === "extract" ? "Extracting..." : "Extract"}
              </button>
              <button
                type="button"
                onClick={() => void handleReextractWithGuard()}
                disabled={!vm.selectedDoc || !!vm.busy}
                className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-50"}
              >
                {isLocked ? "Force re-extract" : "Re-extract"}
              </button>
              <button
                type="button"
                onClick={() => void handleLock()}
                disabled={!vm.selectedDoc || !!vm.busy}
                className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
              >
                {headerBusy === "lock" ? "Locking..." : "Lock"}
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
                    onClick={archiveSelected}
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
              documents={visibleDocuments}
              selectedDocId={selectedDocId}
              onSelect={setSelectedDocId}
              onExtract={(id) => void handleExtract(id)}
              onLock={(id) => void handleLock(id)}
              q={filters.q}
              status={filters.status}
              quickFilter={quickFilter}
              quickCounts={quickCounts}
              rowBusy={rowBusy}
              onQueryChange={(next) => setFilters({ ...filters, q: next })}
              onStatusChange={(next) => setFilters({ ...filters, status: (next as any) || "" })}
              onQuickFilterChange={setQuickFilter}
              counts={{ shown: visibleDocuments.length, total: counts.total }}
              searchInputRef={searchInputRef}
            />
            <div className="grid min-w-0 gap-4">
              <UnitEditorPanel selectedDoc={vm.selectedDoc} learningOutcomes={learningOutcomes} />
              <SpecViewer selectedDoc={vm.selectedDoc} learningOutcomes={learningOutcomes} />
            </div>
          </section>
        </section>
      )}
      </div>
    </div>
  );
}
