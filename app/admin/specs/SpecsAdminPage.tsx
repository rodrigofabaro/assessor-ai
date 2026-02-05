"use client";

import { useMemo, useRef, useState } from "react";
import LibraryView from "../library/LibraryView";
import { badge, useReferenceAdmin } from "../reference/reference.logic";
import { LoCriteriaGrid } from "@/components/spec/LoCriteriaGrid";

type UploadResult = {
  fileName: string;
  ok: boolean;
  reason?: string;
};

type ToastMessage = {
  id: number;
  tone: "success" | "error" | "warn";
  text: string;
};

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function toneCls(tone: ToastMessage["tone"]): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

export default function SpecsAdminPage() {
  const [tab, setTab] = useState<"library" | "extract">("library");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const vm = useReferenceAdmin({
    context: "specs",
    fixedInboxType: "SPEC",
    fixedUploadType: "SPEC",
  });

  const pushToast = (tone: ToastMessage["tone"], text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const openPicker = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const uploadFiles = async (incoming: File[]) => {
    if (!incoming.length || uploading) return;

    const valid = incoming.filter(isPdf);
    const skipped = incoming.filter((f) => !isPdf(f));
    const suspicious = valid.filter((f) => !/(unit|spec)/i.test(f.name));

    if (skipped.length) {
      pushToast("warn", skipped.length === incoming.length ? "Only PDF files are supported." : `Skipped ${skipped.length} file(s). Only PDF files are supported.`);
    }
    if (suspicious.length) {
      pushToast("warn", `${suspicious.length} filename(s) did not include “Unit” or “Spec”. Uploaded anyway.`);
    }
    if (!valid.length) return;

    setUploading(true);
    setUploadStatus(`Uploading ${valid.length} file${valid.length > 1 ? "s" : ""}...`);
    setUploadResults([]);

    try {
      const settled = await Promise.all(
        valid.map(async (file): Promise<UploadResult> => {
          const fd = new FormData();
          fd.set("type", "SPEC");
          fd.set("title", file.name);
          fd.set("version", "1");
          fd.set("file", file);

          const res = await fetch("/api/reference-documents", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              fileName: file.name,
              ok: false,
              reason: (data as any)?.error || (data as any)?.message || "Upload failed",
            };
          }
          return { fileName: file.name, ok: true };
        })
      );

      setUploadResults(settled);
      const okCount = settled.filter((r) => r.ok).length;
      const failCount = settled.length - okCount;

      if (okCount > 0) {
        await vm.refreshAll({ keepSelection: false });
        pushToast("success", `Uploaded ${okCount} spec${okCount > 1 ? "s" : ""}. Ready to extract.`);
      }
      if (failCount > 0) {
        const reason = settled.find((r) => !r.ok)?.reason || "Upload failed";
        pushToast("error", `Upload failed: ${reason}`);
      }
    } finally {
      setUploading(false);
      setUploadStatus("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="grid min-w-0 gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
      />

      <div className="pointer-events-none fixed right-4 top-4 z-50 grid gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={"pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-sm " + toneCls(t.tone)}>
            {t.text}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Specs</h1>
            <p className="mt-1 text-sm text-zinc-700">Specs define the criteria universe. Upload/extract, then lock the authoritative issue used by grading.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openPicker}
              disabled={uploading}
              className="rounded-xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
            >
              Upload spec
            </button>
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              {uploading ? uploadStatus : vm.busy ? `⏳ ${vm.busy}` : "Ready"}
            </span>
          </div>
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

        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            if (!uploading) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (uploading) return;
            uploadFiles(Array.from(e.dataTransfer.files || []));
          }}
          disabled={uploading}
          className={
            "mt-4 w-full rounded-2xl border-2 border-dashed px-4 py-6 text-left transition " +
            (uploading
              ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
              : dragActive
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-300 bg-white hover:border-zinc-500 hover:bg-zinc-50")
          }
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">📄</span>
            <div>
              <div className="text-sm font-semibold text-zinc-900">Drag &amp; drop SPEC PDFs here (or click to browse)</div>
              <div className="mt-1 text-xs text-zinc-600">PDF only • multi-file upload supported</div>
            </div>
            {uploading ? <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden="true" /> : null}
          </div>
        </button>

        {uploadResults.length ? (
          <div className="mt-3 grid gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
            {uploadResults.map((r) => (
              <div key={r.fileName + r.ok} className={r.ok ? "text-emerald-800" : "text-rose-800"}>
                {r.ok ? "✅" : "❌"} {r.fileName}
                {r.ok ? " uploaded" : ` failed: ${r.reason || "Upload failed"}`}
              </div>
            ))}
          </div>
        ) : null}
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
