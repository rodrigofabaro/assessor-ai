"use client";

import { badge } from "../library.logic";

export function UnitList(props: { units: any[]; selectedUnitId: string; onSelect: (id: string) => void }) {
  const { units, selectedUnitId, onSelect } = props;

  return (
    <div className="rounded-2xl border border-zinc-200 min-w-0">
      <div className="border-b border-zinc-200 p-4">
        <div className="text-sm font-semibold text-zinc-900">Locked units</div>
        <div className="mt-1 text-xs text-zinc-600">{units.length} items • click one to view details & bindings</div>
      </div>

      <div className="max-h-[640px] overflow-auto">
        <ul className="divide-y divide-zinc-100">
          {units.map((u) => {
            const active = u.id === selectedUnitId;
            const b = badge(u.archived ? "ARCHIVED" : "ACTIVE");

            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelect(u.id)}
                  className={"w-full text-left px-4 py-3 transition hover:bg-zinc-50 " + (active ? "bg-zinc-50" : "bg-white")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-900 truncate">
                        {u.unitCode} — {u.unitTitle}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-600">
                        {u.issueLabel || "No issue label"} • LO {u.learningOutcomeCount} • {u.criteriaCount} criteria
                      </div>
                    </div>

                    <span className={"shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " + b.cls}>
                      {b.text}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {units.length === 0 ? <div className="p-4 text-sm text-zinc-600">No locked units match your search.</div> : null}
      </div>
    </div>
  );
}
