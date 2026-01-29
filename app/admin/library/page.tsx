"use client";

import { badge, formatDate, useLibraryAdmin } from "./library.logic";

export default function LibraryAdminPage() {
  const vm = useLibraryAdmin();

  return (
    <div className="grid gap-4">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reference library</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Manage <span className="font-semibold">LOCKED</span> unit specs (the grading ground truth). Edit labels,
              see which briefs are bound, and archive old issues.
            </p>
          </div>
          <div className="text-xs text-zinc-600">{vm.busy ? <span>⏳ {vm.busy}</span> : <span>Ready</span>}</div>
        </div>

        {vm.error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{vm.error}</div>
        ) : null}
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[240px]">
            <div className="text-xs text-zinc-600">Search</div>
            <input
              value={vm.q}
              onChange={(e) => vm.setQ(e.target.value)}
              placeholder="unit code, title, issue label..."
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={vm.showArchived} onChange={(e) => vm.setShowArchived(e.target.checked)} />
              Show archived
            </label>

            <button
              onClick={vm.refreshAll}
              disabled={!!vm.busy}
              className={
                "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                (vm.busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")
              }
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[520px_1fr]">
          {/* Left: units list */}
          <div className="rounded-2xl border border-zinc-200">
            <div className="border-b border-zinc-200 p-4">
              <div className="text-sm font-semibold text-zinc-900">Locked units</div>
              <div className="mt-1 text-xs text-zinc-600">
                {vm.filtered.length} items • click one to view details & bindings
              </div>
            </div>

            <div className="max-h-[640px] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-zinc-600">
                    <th className="border-b border-zinc-200 px-3 py-2">Unit</th>
                    <th className="border-b border-zinc-200 px-3 py-2">Spec label</th>
                    <th className="border-b border-zinc-200 px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.filtered.map((u) => {
                    const active = u.id === vm.selectedUnitId;
                    const b = badge(u.archived ? "ARCHIVED" : "ACTIVE");
                    return (
                      <tr
                        key={u.id}
                        onClick={() => vm.setSelectedUnitId(u.id)}
                        className={
                          "cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 " +
                          (active ? "bg-zinc-50" : "bg-white")
                        }
                      >
                        <td className="px-3 py-2">
                          <div className="font-semibold text-zinc-900">
                            {u.unitCode} — {u.unitTitle}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-600">
                            LO: {u.learningOutcomeCount} • Criteria: {u.criteriaCount}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{u.specVersionLabel || u.specIssue || "-"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " + b.cls
                            }
                          >
                            {b.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {vm.filtered.length === 0 ? (
                <div className="p-4 text-sm text-zinc-600">No locked units match your search.</div>
              ) : null}
            </div>
          </div>

          {/* Right: details */}
          <div className="rounded-2xl border border-zinc-200">
            {!vm.selected ? (
              <div className="p-4 text-sm text-zinc-600">Select a locked unit to view details.</div>
            ) : (
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-600">Selected unit</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-900 break-words">
                      {vm.selected.unitCode} — {vm.selected.unitTitle}
                    </div>
                    <div className="mt-1 text-sm text-zinc-700">
                      {vm.selected.specVersionLabel || vm.selected.specIssue || "(spec label not set)"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={vm.saveEdits}
                      disabled={!!vm.busy}
                      className={
                        "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                        (vm.busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")
                      }
                    >
                      Save
                    </button>

                    <button
                      onClick={vm.toggleArchive}
                      disabled={!!vm.busy}
                      className={
                        "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                        (vm.busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-amber-700 text-white hover:bg-amber-600")
                      }
                    >
                      {vm.selected.archived ? "Unarchive" : "Archive"}
                    </button>

                    <button
                      onClick={vm.safeDelete}
                      disabled={!!vm.busy}
                      className={
                        "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                        (vm.busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-red-700 text-white hover:bg-red-600")
                      }
                      title="Deletes only if no briefs are bound."
                    >
                      Delete (safe)
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Meta label="Locked at" value={formatDate(vm.selected.lockedAt)} />
                  <Meta label="Spec doc id" value={vm.selected.specDocumentId || "-"} />
                  <Meta label="Bound briefs" value={String(vm.selected.boundBriefsCount ?? 0)} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-zinc-700">Unit title</span>
                    <input
                      value={vm.editUnitTitle}
                      onChange={(e) => vm.setEditUnitTitle(e.target.value)}
                      className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-zinc-700">Spec label (Issue X – Month YYYY)</span>
                    <input
                      value={vm.editSpecLabel}
                      onChange={(e) => vm.setEditSpecLabel(e.target.value)}
                      className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                      placeholder="e.g. Issue 5 – June 2025"
                    />
                  </label>
                </div>

                <div className="mt-5 border-t border-zinc-200 pt-4">
                  <div className="text-sm font-semibold text-zinc-900">Briefs/assignments bound to this unit</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    This is what makes a spec “in use”. Safe delete blocks removal if anything is bound.
                  </div>

                  <div className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-zinc-200 p-3">
                    {vm.boundBriefs.length === 0 ? (
                      <div className="text-sm text-zinc-600">No bindings found for this unit.</div>
                    ) : (
                      <ul className="grid gap-2">
                        {vm.boundBriefs.map((b) => (
                          <li key={b.id} className="rounded-xl border border-zinc-200 p-3">
                            <div className="text-sm font-semibold text-zinc-900">
                              {b.assignmentCode || "(no code)"} • {b.briefTitle || "(brief)"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-600">
                              Bound at: {formatDate(b.createdAt)} • Brief doc id: {b.briefDocumentId || "-"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900 break-words">{value || "-"}</div>
    </div>
  );
}
