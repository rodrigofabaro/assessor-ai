"use client";

import { badge, formatDate } from "../library.logic";
import SpecDocument from "./SpecDocument";

export function UnitWorkspace(props: {
  selected: any | null;
  busy: string | null;

  boundBriefs: any[];

  editUnitTitle: string;
  setEditUnitTitle: (v: string) => void;

  editSpecLabel: string;
  setEditSpecLabel: (v: string) => void;

  saveEdits: () => Promise<void> | void;
  toggleArchive: () => Promise<void> | void;
  safeDelete: () => Promise<void> | void;
}) {
  const {
    selected,
    busy,
    boundBriefs,
    editUnitTitle,
    setEditUnitTitle,
    editSpecLabel,
    setEditSpecLabel,
    saveEdits,
    toggleArchive,
    safeDelete,
  } = props;

  return (
    <div className="rounded-2xl border border-zinc-200">
      {!selected ? (
        <div className="p-4 text-sm text-zinc-600">Select a locked unit to view the spec.</div>
      ) : (
        <div className="grid gap-4 p-4 xl:grid-cols-[1fr_420px] min-w-0">
          {/* Spec viewer */}
          <div className="rounded-2xl border border-zinc-200 bg-white min-w-0">
            <div className="border-b border-zinc-200 p-4">
              <div className="text-xs text-zinc-600">Spec viewer (locked)</div>
              <div className="mt-1 text-base font-semibold text-zinc-900 break-words">
                {selected.unitCode} — {selected.unitTitle}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-zinc-700">{selected.issueLabel || "(spec label not set)"}</span>
                <span
                  className={
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " +
                    badge(selected.archived ? "ARCHIVED" : "ACTIVE").cls
                  }
                >
                  {badge(selected.archived ? "ARCHIVED" : "ACTIVE").text}
                </span>
              </div>
            </div>

            <div className="max-h-[640px] overflow-auto p-4">
              <SpecDocument unit={selected} />
            </div>
          </div>

          {/* Management drawer */}
          <div className="rounded-2xl border border-zinc-200 bg-white min-w-0">
            <div className="border-b border-zinc-200 p-4">
              <div className="text-xs text-zinc-600">Selected unit</div>
              <div className="mt-1 text-lg font-semibold text-zinc-900 break-words">
                {selected.unitCode} — {selected.unitTitle}
              </div>
              <div className="mt-1 text-sm text-zinc-700">{selected.issueLabel || "(spec label not set)"}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => saveEdits()}
                  disabled={!!busy}
                  className={
                    "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                    (busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")
                  }
                >
                  Save
                </button>

                <button
                  onClick={() => toggleArchive()}
                  disabled={!!busy}
                  className={
                    "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                    (busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-amber-700 text-white hover:bg-amber-600")
                  }
                >
                  {selected.archived ? "Unarchive" : "Archive"}
                </button>

                <button
                  onClick={() => safeDelete()}
                  disabled={!!busy}
                  className={
                    "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                    (busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-red-700 text-white hover:bg-red-600")
                  }
                  title="Deletes only if no briefs are bound."
                >
                  Delete (safe)
                </button>
              </div>
            </div>

            <div className="p-4 grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-600">Locked at</div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-900 break-words">{formatDate(selected.lockedAt)}</div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-600">Bound briefs</div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-900 break-words">{String(selected.boundBriefsCount ?? 0)}</div>
                </div>

                <div className="col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-600">Spec doc id</div>
                  <div className="mt-0.5 font-mono text-xs text-zinc-900 break-all">{selected.specDocumentId || "-"}</div>
                </div>
              </div>

              <details className="rounded-xl border border-zinc-200 bg-white p-3">
                <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-900">Edit labels</summary>

                <div className="mt-3 grid gap-3">
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-zinc-700">Unit title</span>
                    <input
                      value={editUnitTitle}
                      onChange={(e) => setEditUnitTitle(e.target.value)}
                      className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-zinc-700">Spec label (Issue X – Month YYYY)</span>
                    <input
                      value={editSpecLabel}
                      onChange={(e) => setEditSpecLabel(e.target.value)}
                      className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                      placeholder="e.g. Issue 5 – June 2025"
                    />
                  </label>
                </div>
              </details>

              <div className="border-t border-zinc-200 pt-4">
                <div className="text-sm font-semibold text-zinc-900">Briefs/assignments bound to this unit</div>
                <div className="mt-1 text-xs text-zinc-600">
                  This is what makes a spec “in use”. Safe delete blocks removal if anything is bound.
                </div>

                <div className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-zinc-200 p-3">
                  {boundBriefs.length === 0 ? (
                    <div className="text-sm text-zinc-600">No bindings found for this unit.</div>
                  ) : (
                    <ul className="grid gap-2">
                      {boundBriefs.map((b) => (
                        <li key={b.id} className="rounded-xl border border-zinc-200 p-3">
                          <div className="text-sm font-semibold text-zinc-900">
                            {b.assignmentCode || "(no code)"} • {b.briefTitle || "(brief)"}
                          </div>
                          <div className="mt-1 text-xs text-zinc-600">
                            Brief doc id: {b.briefDocumentId || "-"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
