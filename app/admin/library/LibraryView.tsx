"use client";

/**
 * LibraryView
 * -----------
 * UI for browsing LOCKED unit specs (ground truth) and viewing LO/AC.
 *
 * Fixes:
 * - ✅ Issue label always visible in the left list (uses specVersionLabel/specIssue on each unit)
 * - ✅ No hooks/imports outside the component (your current file has that mistake)
 * - ✅ No duplicate React imports
 * - ✅ Adds PDF modal + Open link (uses selected.specDocument / specDocumentId if present)
 *
 * NOTE:
 * - This file assumes `useLibraryAdmin()` exposes:
 *   - saveEdits(), toggleArchive(), safeDelete()
 *   - editUnitTitle, setEditUnitTitle
 *   - editSpecLabel, setEditSpecLabel
 *   - (optional) editUnitCode, setEditUnitCode (if you implement unitCode editing)
 */

import { useMemo, useState } from "react";
import { badge, formatDate, useLibraryAdmin } from "./library.logic";

function pickIssueLabel(u: any): string {
  const a = u?.specVersionLabel ? String(u.specVersionLabel).trim() : "";
  const b = u?.specIssue ? String(u.specIssue).trim() : "";
  const c = u?.specLabel ? String(u.specLabel).trim() : ""; // fallback if you still have old field in some places
  return a || b || c || "";
}

function pdfUrlForSelected(selected: any) {
  const id =
    selected?.specDocumentId ||
    selected?.specDocument?.id ||
    selected?.specDocId ||
    selected?.specDocumentID ||
    "";
  if (!id) return "";
  // Adjust if your route is different
  return `/api/reference-documents/${id}/file`;
}

export default function LibraryView({ showHeader = true }: { showHeader?: boolean }) {
  const vm = useLibraryAdmin();

  // Normalise (avoids layout weirdness during first paint)
  const units = vm.filtered ?? [];
  const selected = vm.selected ?? null;
  const learningOutcomes = selected?.learningOutcomes ?? [];

  // PDF
  const [showPdf, setShowPdf] = useState(false);
  const pdfUrl = useMemo(() => pdfUrlForSelected(selected), [selected]);

  // Selected issue label: prefer persisted value, fallback to current edit value (if any)
  const selectedIssueLabel =
    pickIssueLabel(selected) || (vm.editSpecLabel && String(vm.editSpecLabel).trim()) || "";

  const selectedDocId =
    (selected as any)?.specDocumentId ||
    (selected as any)?.specDocument?.id ||
    (selected as any)?.specDocId ||
    "";

  const selectedOriginalFilename =
    (selected as any)?.specDocument?.originalFilename ||
    (selected as any)?.specDocument?.storedFilename ||
    "—";

  return (
    <div className="grid gap-4 min-w-0 overflow-x-hidden">
      {showHeader ? (
        <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Specs library</h1>
              <p className="mt-1 text-sm text-zinc-700">
                Manage <span className="font-semibold">LOCKED</span> unit specs (the grading ground truth).
              </p>
            </div>
            <div className="text-xs text-zinc-600">{vm.busy ? <span>⏳ {vm.busy}</span> : <span>Ready</span>}</div>
          </div>

          {vm.error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{vm.error}</div>
          ) : null}
        </header>
      ) : null}

      {/* Main layout */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[420px_1fr]">
        {/* Unit index */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Units</div>
              <div className="text-xs text-zinc-600">Locked unit specs and issues</div>
            </div>
            <div className="text-xs text-zinc-500">{units.length}</div>
          </div>

          <div className="mt-3 grid gap-2">
            <input
              value={vm.q}
              onChange={(e) => vm.setQ(e.target.value)}
              placeholder="Search unit code or title…"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          </div>

          <div className="mt-4 grid gap-2 max-h-[70vh] overflow-auto pr-1">
            {units.map((u: any) => {
              const active = vm.selectedUnitId === u.id;
              const issue = pickIssueLabel(u);

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => vm.setSelectedUnitId(u.id)}
                  className={
                    "w-full rounded-xl border p-3 text-left transition " +
                    (active
                      ? "border-zinc-300 bg-white ring-2 ring-zinc-900/10 shadow-sm"
                      : "border-zinc-200 bg-white hover:bg-zinc-50")
                  }
                >
                  <div className="text-sm font-semibold leading-5 text-zinc-900">
                    {u.unitCode} — {u.unitTitle}
                  </div>

                  {/* ✅ always visible */}
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                    <span
                      className={
                        "inline-flex h-5 w-5 items-center justify-center rounded-md " +
                        (active ? "bg-zinc-900 text-white" : "bg-zinc-100")
                      }
                      aria-hidden="true"
                    >
                      🏷️
                    </span>
                    <span className="truncate">{issue ? `Issue: ${issue}` : "Issue: —"}</span>
                  </div>
                </button>
              );
            })}

            {units.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                No units match your search.
              </div>
            ) : null}
          </div>
        </div>

        {/* Right side */}
        <div className="grid min-w-0 gap-4">
          {/* Viewer */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm min-w-0 overflow-hidden">
            <div className="border-b border-zinc-200 p-4">
              <div className="text-xs text-zinc-500">Spec viewer</div>
              <div className="mt-1 text-lg font-semibold">
                {selected ? `${selected.unitCode} — ${selected.unitTitle}` : "Select a unit"}
              </div>

              <div className="mt-1 flex items-center gap-2 text-sm text-zinc-700">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100"
                  aria-hidden="true"
                >
                  🏷️
                </span>
                <span>{selected ? (selectedIssueLabel ? selectedIssueLabel : "—") : "—"}</span>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto p-4">
              {selected ? (
                <div className="grid gap-5">
                  {learningOutcomes.map((lo: any) => (
                    <section key={lo.id} className="grid gap-2">
                      <div>
                        <div className="text-sm font-semibold">Learning Outcome {lo.loCode}</div>
                        <div className="text-sm text-zinc-700 whitespace-pre-wrap break-words">{lo.description}</div>
                      </div>

                      <div className="grid gap-2">
                        {(lo.criteria || []).map((c: any) => (
                          <div key={c.id} className="rounded-xl border border-zinc-200 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold">{c.acCode}</div>
                              <span
                                className={
                                  "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold " +
                                  badge(c.gradeBand).cls
                                }
                              >
                                {badge(c.gradeBand).text}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap break-words">{c.description}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                  Choose a unit on the left to view its locked spec content.
                </div>
              )}
            </div>
          </div>

          {/* Inspector */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
            <div className="text-sm font-semibold">Selected unit</div>

            {selected ? (
              <div className="mt-3 grid gap-3">
                <div>
                  <div className="text-xs text-zinc-500">Identity</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {selected.unitCode} — {selected.unitTitle}
                  </div>
                  <div className="mt-1 text-sm text-zinc-700">{selectedIssueLabel ? selectedIssueLabel : "—"}</div>
                </div>

                {/* Uploaded PDF block */}
                <div className="rounded-xl border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Uploaded spec</div>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-900 truncate">{selectedOriginalFilename}</div>
                      <div className="text-xs text-zinc-500">
                        Doc id: <span className="font-mono">{selectedDocId || "—"}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!pdfUrl}
                        onClick={() => setShowPdf(true)}
                        className={
                          "rounded-xl px-3 py-2 text-xs font-semibold border " +
                          (!pdfUrl
                            ? "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed"
                            : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
                        }
                      >
                        View PDF
                      </button>

                      {pdfUrl ? (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl px-3 py-2 text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => vm.saveEdits?.()}
                    className="rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    Save
                  </button>

                  <button
                    type="button"
                    onClick={() => vm.toggleArchive?.()}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Archive
                  </button>

                  <button
                    type="button"
                    onClick={() => vm.safeDelete?.()}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
                  >
                    Delete (safe)
                  </button>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <div className="text-xs text-zinc-500">Locked at</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">{formatDate(selected.lockedAt)}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <div className="text-xs text-zinc-500">Bound briefs</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">{selected.boundBriefsCount ?? 0}</div>
                  </div>
                  <div className="col-span-2 rounded-xl border border-zinc-200 p-3">
                    <div className="text-xs text-zinc-500">Spec doc id</div>
                    <div className="mt-1 break-all font-mono text-xs text-zinc-900">{selectedDocId || "—"}</div>
                  </div>
                </div>

                {/* Edit labels */}
                <details className="rounded-xl border border-zinc-200 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Edit labels</summary>

                  <div className="mt-3 grid gap-3">
                    {/* Optional: only render if implemented in vm */}
                    {"editUnitCode" in (vm as any) && "setEditUnitCode" in (vm as any) ? (
                      <div>
                        <label className="text-xs text-zinc-500">Unit code</label>
                        <input
                          value={(vm as any).editUnitCode || ""}
                          onChange={(e) => (vm as any).setEditUnitCode(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        />
                      </div>
                    ) : null}

                    <div>
                      <label className="text-xs text-zinc-500">Unit title</label>
                      <input
                        value={vm.editUnitTitle || ""}
                        onChange={(e) => vm.setEditUnitTitle?.(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-500">Spec label (Issue X – Month YYYY)</label>
                      <input
                        value={vm.editSpecLabel || ""}
                        onChange={(e) => vm.setEditSpecLabel?.(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                      />
                    </div>

                    <p className="text-xs text-zinc-500">
                      Briefs/assignments bound to this unit make a spec “in use”. Safe delete blocks removal if anything
                      is bound.
                    </p>
                  </div>
                </details>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                Select a unit to inspect details.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF modal */}
      {showPdf ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowPdf(false)}
            aria-label="Close PDF viewer"
          />
          <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold">Spec PDF</div>
              <button
                type="button"
                onClick={() => setShowPdf(false)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="h-[75vh] bg-zinc-50">
              {pdfUrl ? (
                <iframe src={pdfUrl} className="h-full w-full" title="Spec PDF viewer" />
              ) : (
                <div className="p-4 text-sm text-zinc-700">No PDF available.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
