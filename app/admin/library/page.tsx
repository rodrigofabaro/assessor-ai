"use client";

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin/specs");
}


import { badge, formatDate, useLibraryAdmin } from "./library.logic";

export default function LibraryAdminPage() {
  const vm = useLibraryAdmin();

  return (
    <div className="grid gap-4 min-w-0 overflow-x-hidden">
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

        <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr] min-w-0">
          {/* Left: units list */}
          <div className="rounded-2xl border border-zinc-200 min-w-0">
            <div className="border-b border-zinc-200 p-4">
              <div className="text-sm font-semibold text-zinc-900">Locked units</div>
              <div className="mt-1 text-xs text-zinc-600">
                {vm.filtered.length} items • click one to view details & bindings
              </div>
            </div>

            <div className="max-h-[640px] overflow-auto">
              <ul className="divide-y divide-zinc-100">
                {vm.filtered.map((u) => {
                  const active = u.id === vm.selectedUnitId;
                  const b = badge(u.archived ? "ARCHIVED" : "ACTIVE");
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => vm.setSelectedUnitId(u.id)}
                        className={
                          "w-full text-left px-4 py-3 transition hover:bg-zinc-50 " +
                          (active ? "bg-zinc-50" : "bg-white")
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-zinc-900 truncate">
                              {u.unitCode} — {u.unitTitle}
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-600">
                              {u.specVersionLabel || u.specIssue || "No issue label"} • LO {u.learningOutcomeCount} •{" "}
                              {u.criteriaCount} criteria
                            </div>
                          </div>
                          <span
                            className={
                              "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " +
                              b.cls
                            }
                          >
                            {b.text}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {vm.filtered.length === 0 ? (
                <div className="p-4 text-sm text-zinc-600">No locked units match your search.</div>
              ) : null}
            </div>
          </div>

          {/* Right: spec viewer + management drawer */}
          <div className="rounded-2xl border border-zinc-200">
            {!vm.selected ? (
              <div className="p-4 text-sm text-zinc-600">Select a locked unit to view the spec.</div>
            ) : (
              <div className="grid gap-4 p-4 xl:grid-cols-[1fr_420px] min-w-0">
                {/* Spec viewer (read-only) */}
                <div className="rounded-2xl border border-zinc-200 bg-white min-w-0">
                  <div className="border-b border-zinc-200 p-4">
                    <div className="text-xs text-zinc-600">Spec viewer (locked)</div>
                    <div className="mt-1 text-base font-semibold text-zinc-900 break-words">
                      {vm.selected.unitCode} — {vm.selected.unitTitle}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-zinc-700">
                        {vm.selected.specVersionLabel || vm.selected.specIssue || "(spec label not set)"}
                      </span>
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " +
                          badge(vm.selected.archived ? "ARCHIVED" : "ACTIVE").cls
                        }
                      >
                        {badge(vm.selected.archived ? "ARCHIVED" : "ACTIVE").text}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[640px] overflow-auto p-4">
                    <SpecDocument unit={vm.selected} />
                  </div>
                </div>

                {/* Management drawer */}
                <div className="rounded-2xl border border-zinc-200 bg-white min-w-0">
                  <div className="border-b border-zinc-200 p-4">
                    <div className="text-xs text-zinc-600">Selected unit</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-900 break-words">
                      {vm.selected.unitCode} — {vm.selected.unitTitle}
                    </div>
                    <div className="mt-1 text-sm text-zinc-700">
                      {vm.selected.specVersionLabel || vm.selected.specIssue || "(spec label not set)"}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={vm.saveEdits}
                        disabled={!!vm.busy}
                        className={
                          "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                          (vm.busy
                            ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                            : "bg-zinc-900 text-white hover:bg-zinc-800")
                        }
                      >
                        Save
                      </button>

                      <button
                        onClick={vm.toggleArchive}
                        disabled={!!vm.busy}
                        className={
                          "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                          (vm.busy
                            ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                            : "bg-amber-700 text-white hover:bg-amber-600")
                        }
                      >
                        {vm.selected.archived ? "Unarchive" : "Archive"}
                      </button>

                      <button
                        onClick={vm.safeDelete}
                        disabled={!!vm.busy}
                        className={
                          "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                          (vm.busy
                            ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                            : "bg-red-700 text-white hover:bg-red-600")
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
                        <div className="mt-0.5 text-sm font-semibold text-zinc-900 break-words">
                          {formatDate(vm.selected.lockedAt)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs text-zinc-600">Bound briefs</div>
                        <div className="mt-0.5 text-sm font-semibold text-zinc-900 break-words">
                          {String(vm.selected.boundBriefsCount ?? 0)}
                        </div>
                      </div>

                      <div className="col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs text-zinc-600">Spec doc id</div>
                        <div className="mt-0.5 font-mono text-xs text-zinc-900 break-all">
                          {vm.selected.specDocumentId || "-"}
                        </div>
                      </div>
                    </div>

                    <details className="rounded-xl border border-zinc-200 bg-white p-3">
                      <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-900">
                        Edit labels
                      </summary>
                      <div className="mt-3 grid gap-3">
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
                    </details>
                    <div className="border-t border-zinc-200 pt-4">
                      <div className="text-sm font-semibold text-zinc-900">Briefs/assignments bound to this unit</div>
                      <div className="mt-1 text-xs text-zinc-600">
                        This is what makes a spec “in use”. Safe delete blocks removal if anything is bound.
                      </div>

                      <div className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-zinc-200 p-3">
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
                  
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SpecDocument({ unit }: { unit: any }) {
  const los = Array.isArray(unit?.learningOutcomes) ? unit.learningOutcomes : [];
  const loCount = los.length;
  const criteriaCount = los.reduce((n: number, lo: any) => n + (Array.isArray(lo?.criteria) ? lo.criteria.length : 0), 0);

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="text-xs text-zinc-600">Extracted content</div>
        <div className="mt-0.5 text-sm text-zinc-900">
          {loCount} learning outcomes • {criteriaCount} assessment criteria
        </div>
      </div>

      {los.length === 0 ? (
        <div className="text-sm text-zinc-600">No learning outcomes were stored for this unit.</div>
      ) : (
        <div className="grid gap-3">
          {los.map((lo: any, idx: number) => (
            <LearningOutcomeCard key={lo.id || `${lo.loCode}-${idx}`} lo={lo} />
          ))}
        </div>
      )}
    </div>
  );
}

function LearningOutcomeCard({ lo }: { lo: any }) {
  const criteria = Array.isArray(lo?.criteria) ? lo.criteria : [];

  // group by gradeBand when available (PASS/MERIT/DISTINCTION). If missing, show as one list.
  const groups: Record<string, any[]> = {};
  for (const c of criteria) {
    const raw = String(c?.gradeBand || "").trim().toUpperCase();
    const band = raw || "CRITERIA";
    groups[band] = groups[band] || [];
    groups[band].push(c);
  }

  const order = ["PASS", "P", "MERIT", "M", "DISTINCTION", "D", "CRITERIA"];
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
  });

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-zinc-600">Learning outcome</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-bold text-zinc-900">
              {lo.loCode}
            </span>
            <p className="min-w-0 text-sm font-semibold text-zinc-900 leading-relaxed break-words">
              {lo.description || ""}
            </p>
          </div>
        </div>

        <div className="text-xs text-zinc-600">{criteria.length} criteria</div>
      </div>

      <div className="mt-3 grid gap-3">
        {criteria.length === 0 ? (
          <div className="text-sm text-zinc-600">(no criteria stored)</div>
        ) : (
          keys.map((k) => (
            <div key={k} className="grid gap-2">
              {k !== "CRITERIA" ? (
                <div className="text-xs font-semibold text-zinc-700">
                  {k === "P" ? "PASS" : k === "M" ? "MERIT" : k === "D" ? "DISTINCTION" : k}
                </div>
              ) : null}
              <ul className="grid gap-2">
                {groups[k]
                  .slice()
                  .sort((a, b) => String(a?.acCode || "").localeCompare(String(b?.acCode || "")))
                  .map((c: any, cidx: number) => (
                    <li key={c.id || `${c.acCode}-${cidx}`} className="rounded-xl border border-zinc-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-bold text-zinc-900">
                          {c.acCode || "(no code)"}
                        </span>
                        {c.gradeBand ? <span className="text-xs text-zinc-600">{String(c.gradeBand)}</span> : null}
                      </div>
                      <p className="mt-2 text-sm text-zinc-900 leading-relaxed break-words whitespace-pre-wrap">
                        {c.description || ""}
                      </p>
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}

        {lo.essentialContent ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Essential content (reference)</summary>
            <p className="mt-2 text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{String(lo.essentialContent)}</p>
          </details>
        ) : null}
      </div>
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
