"use client";

import { useMemo, useRef, useState } from "react";
import BriefReviewCard from "./BriefReviewCard";
import { badge } from "../../reference/reference.logic";
import { ui } from "@/components/ui/uiClasses";

export default function BriefExtractWorkbench({ rx }: { rx: any }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const f = rx.filters;
  const setF = rx.setFilters;

  const counts = useMemo(() => {
    const total = rx.documents.length;
    const shown = rx.filteredDocuments.length;
    const byStatus: Record<string, number> = {};
    for (const d of rx.documents) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    return { total, shown, byStatus };
  }, [rx.documents, rx.filteredDocuments]);

  const dragTone = dragActive
    ? "border-sky-400 bg-sky-50 text-sky-900"
    : "border-dashed border-zinc-200 bg-zinc-50 text-zinc-600";

  const isUploading = String(rx.busy || "").toLowerCase().includes("upload");
  const uploadStatus = rx.busy ? String(rx.busy) : "Ready";

  const handleFiles = (files: File[]) => {
    if (!files.length) return;
    rx.uploadFiles?.(files);
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-5 min-w-0">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => {
          handleFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Brief extraction</div>
          <p className="mt-1 text-xs text-zinc-600">
            Inbox is <span className="font-semibold">BRIEF</span>-only. Select a PDF, then Extract → review mapping → Lock.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={rx.resetFilters} className={ui.btnSecondary + " text-xs"}>
            Reset filters
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Upload briefs</h2>
            <p className="mt-1 text-xs text-zinc-500">Drag-and-drop brief PDFs or use the upload button.</p>
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
              disabled={isUploading}
              className={ui.btnPrimary + " text-xs disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              Upload brief
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
                handleFiles(files);
              }}
            >
              <div className="text-sm font-semibold text-zinc-900">Drop PDFs here</div>
              <div className="text-xs text-zinc-600">Files upload immediately and appear in the Brief inbox list.</div>
              <div className="text-xs text-zinc-500">Accepted: PDF only · Multiple files supported</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className={ui.btnSecondary + " text-xs disabled:cursor-not-allowed disabled:opacity-60"}
              >
                Choose files
              </button>
              <span className="text-xs text-zinc-500">Uploads start immediately after selection.</span>
              <span className={"text-xs " + (isUploading ? "text-sky-700" : "text-zinc-400")}>{uploadStatus}</span>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Upload is collapsed. Click “Upload brief” to add PDFs.
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[420px_1fr] min-w-0">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Inbox</h2>
              <p className="mt-1 text-xs text-zinc-500">BRIEF documents only.</p>
            </div>

            <button
              onClick={rx.resetFilters}
              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Reset
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              value={f.q}
              onChange={(e: any) => setF({ ...f, q: e.target.value })}
              placeholder="Search title, filename, unit code…"
              className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm flex items-center">Type: BRIEF</div>

              <select
                value={f.status}
                onChange={(e: any) => setF({ ...f, status: (e.target.value as any) || "" })}
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!f.onlyLocked}
                  onChange={(e: any) =>
                    setF({ ...f, onlyLocked: e.target.checked, onlyUnlocked: e.target.checked ? false : f.onlyUnlocked })
                  }
                />
                Only locked
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!f.onlyUnlocked}
                  onChange={(e: any) =>
                    setF({ ...f, onlyUnlocked: e.target.checked, onlyLocked: e.target.checked ? false : f.onlyLocked })
                  }
                />
                Only unlocked
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={f.sort}
                onChange={(e: any) => setF({ ...f, sort: e.target.value as any })}
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

          <div className="mt-4 grid gap-2 max-h-[55vh] overflow-auto pr-1">
            {rx.filteredDocuments.map((d: any) => {
              const active = rx.selectedDocId === d.id;
              const b = badge(d.status);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => rx.setSelectedDocId(d.id)}
                  className={
                    "w-full rounded-xl border p-3 text-left transition " +
                    (active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={"inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold " + b.cls}>
                      {b.text}
                    </span>
                    <span className={"text-xs " + (active ? "text-zinc-200" : "text-zinc-500")}>v{d.version}</span>
                  </div>

                  <div className="mt-2 text-sm font-semibold leading-5">{d.title}</div>
                  <div className={"mt-1 text-xs " + (active ? "text-zinc-200" : "text-zinc-600")}>{d.originalFilename}</div>
                </button>
              );
            })}

            {rx.filteredDocuments.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No docs match your filters.</div>
            ) : null}
          </div>
        </section>

        <BriefReviewCard rx={rx} />
      </div>
    </section>
  );
}
