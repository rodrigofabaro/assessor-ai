"use client";

import { useMemo, useState } from "react";
import type { Criterion, Unit } from "../../reference/reference.logic";

type Props = {
  draft: any;
  units: Unit[];
  briefUnitId: string;
  setBriefUnitId: (id: string) => void;
  criteria: Criterion[];
  mapSelected: Record<string, boolean>;
  setMapSelected: (x: Record<string, boolean>) => void;
  assignmentCodeInput: string;
  setAssignmentCodeInput: (v: string) => void;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normCode(s: any) {
  return String(s || "").trim().toUpperCase();
}

export default function BriefMappingPanel({
  draft,
  units,
  briefUnitId,
  setBriefUnitId,
  criteria,
  mapSelected,
  setMapSelected,
  assignmentCodeInput,
  setAssignmentCodeInput,
}: Props) {
  const kind = draft?.kind || "";
  const detectedCodes: string[] = (draft?.detectedCriterionCodes || []).map((x: any) => normCode(x));
  const unitGuess = draft?.unitCodeGuess ? String(draft.unitCodeGuess) : "";

  const [critQ, setCritQ] = useState("");
  const [view, setView] = useState<"current" | "all">("current");
  const [band, setBand] = useState<"all" | "PASS" | "MERIT" | "DISTINCTION">("all");

  const stats = useMemo(() => {
    const selected = Object.entries(mapSelected || {}).filter(([, v]) => v).length;
    const detected = detectedCodes.length;
    return { selected, detected };
  }, [mapSelected, detectedCodes.length]);

  const filteredCriteria = useMemo(() => {
    const q = critQ.trim().toLowerCase();
    let list = Array.isArray(criteria) ? [...criteria] : [];

    if (band !== "all") {
      list = list.filter((c: any) => String(c.gradeBand || "").toUpperCase() === band);
    }

    if (q) {
      list = list.filter((c: any) => {
        const hay = `${c.acCode || ""} ${c.gradeBand || ""} ${c.description || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (view === "current") {
      list = list.filter((c: any) => {
        const code = normCode(c.acCode);
        return !!mapSelected?.[code] || detectedCodes.includes(code);
      });
    }

    // Sort: selected first, then detected, then band, then code
    const bandRank: Record<string, number> = { PASS: 1, MERIT: 2, DISTINCTION: 3 };
    list.sort((a: any, b: any) => {
      const aSel = !!mapSelected?.[normCode(a.acCode)];
      const bSel = !!mapSelected?.[normCode(b.acCode)];
      if (aSel !== bSel) return aSel ? -1 : 1;

      const aDet = detectedCodes.includes(normCode(a.acCode));
      const bDet = detectedCodes.includes(normCode(b.acCode));
      if (aDet !== bDet) return aDet ? -1 : 1;

      const ar = bandRank[String(a.gradeBand || "").toUpperCase()] || 9;
      const br = bandRank[String(b.gradeBand || "").toUpperCase()] || 9;
      if (ar !== br) return ar - br;

      return normCode(a.acCode).localeCompare(normCode(b.acCode));
    });

    return list;
  }, [criteria, critQ, view, band, mapSelected, detectedCodes]);

  const loSummary = useMemo(() => {
    const summary = new Map<string, { loCode: string; selected: number; detected: number }>();
    for (const c of criteria || []) {
      const loCode = c.learningOutcome?.loCode || "LO?";
      const entry = summary.get(loCode) || { loCode, selected: 0, detected: 0 };
      const code = normCode(c.acCode);
      if (mapSelected?.[code]) entry.selected += 1;
      if (detectedCodes.includes(code)) entry.detected += 1;
      summary.set(loCode, entry);
    }
    return Array.from(summary.values()).sort((a, b) => a.loCode.localeCompare(b.loCode));
  }, [criteria, mapSelected, detectedCodes]);

  const groupedCriteria = useMemo(() => {
    const groups = new Map<string, Criterion[]>();
    for (const c of filteredCriteria) {
      const loCode = c.learningOutcome?.loCode || "LO?";
      if (!groups.has(loCode)) groups.set(loCode, []);
      groups.get(loCode)!.push(c);
    }
    return Array.from(groups.entries())
      .map(([loCode, items]) => ({
        loCode,
        items: items.sort((a, b) => normCode(a.acCode).localeCompare(normCode(b.acCode))),
      }))
      .sort((a, b) => a.loCode.localeCompare(b.loCode));
  }, [filteredCriteria]);

  const loSummaryByCode = useMemo(() => {
    return new Map(loSummary.map((entry) => [entry.loCode, entry]));
  }, [loSummary]);

  const bandPill = (b: string) => {
    const up = String(b || "").toUpperCase();
    if (up === "PASS") return "border-emerald-200 bg-emerald-50 text-emerald-900";
    if (up === "MERIT") return "border-indigo-200 bg-indigo-50 text-indigo-900";
    if (up === "DISTINCTION") return "border-rose-200 bg-rose-50 text-rose-900";
    return "border-zinc-200 bg-zinc-50 text-zinc-700";
  };

  if (kind !== "BRIEF") {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="text-xs text-zinc-600">Mapping</div>
        <p className="mt-2 text-sm text-zinc-700">No BRIEF draft extracted yet. Click Extract.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Mapping</div>
          <div className="mt-0.5 text-xs text-zinc-600">
            Link this brief to a locked unit spec, then confirm which criteria codes this brief actually targets.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
            {stats.selected} selected
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-800">
            {stats.detected} detected
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <div className="text-xs text-zinc-600">Assignment</div>
          <div className="mt-1 font-semibold text-zinc-900 break-words">
            {draft.assignmentCode || "(missing)"} — {draft.title || "(title not detected)"}
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-zinc-600">Assignment code (required to lock)</div>
            <input
              value={assignmentCodeInput}
              onChange={(e) => setAssignmentCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. A1"
              className="h-10 w-36 rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {draft.assignmentNumber ? (
            <div className="mt-2 text-xs text-zinc-600">
              Assignment {draft.assignmentNumber} of {draft.totalAssignments || "?"}
            </div>
          ) : null}
        </div>

        <div>
          <div className="text-xs text-zinc-600">Detected unit</div>
          <div className="mt-1 font-semibold text-zinc-900">{unitGuess ? `Unit ${unitGuess}` : "(not detected)"}</div>
          {draft.aiasLevel ? <div className="mt-1 text-xs text-zinc-600">AIAS Level {draft.aiasLevel}</div> : null}
        </div>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-4">
        <label className="text-xs text-zinc-600">Link this brief to a unit</label>
        <div className="mt-1">
          <select
            value={briefUnitId}
            onChange={(e) => setBriefUnitId(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">(select unit...)</option>
            {units
              .filter((u: any) => u.status === "LOCKED" && !(u as any)?.sourceMeta?.archived)
              .map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.unitCode} — {u.unitTitle}
                  {(() => {
                    const issue = (u as any)?.specIssue || (u as any)?.specDocument?.sourceMeta?.specIssue;
                    return issue ? ` (${issue})` : "";
                  })()}
                </option>
              ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Only ACTIVE (non-archived) locked specs are shown here.</p>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-semibold text-zinc-900">Criteria mapping</div>
            <p className="mt-1 text-sm text-zinc-700 break-words">
              Detected codes: <span className="font-semibold">{detectedCodes.length ? detectedCodes.join(", ") : "(none)"}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setView("current")}
                className={cx(
                  "h-8 rounded-lg px-3 text-xs font-semibold",
                  view === "current" ? "bg-emerald-600 text-white" : "text-zinc-700 hover:bg-zinc-50"
                )}
              >
                Current brief
              </button>
              <button
                type="button"
                onClick={() => setView("all")}
                className={cx(
                  "h-8 rounded-lg px-3 text-xs font-semibold",
                  view === "all" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50"
                )}
              >
                All unit criteria
              </button>
            </div>

            <select
              value={band}
              onChange={(e) => setBand(e.target.value as any)}
              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All bands</option>
              <option value="PASS">Pass</option>
              <option value="MERIT">Merit</option>
              <option value="DISTINCTION">Distinction</option>
            </select>

            <input
              value={critQ}
              onChange={(e) => setCritQ(e.target.value)}
              placeholder="Search criteria…"
              className="h-9 w-56 max-w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        {!briefUnitId ? (
          <p className="mt-3 text-sm text-zinc-600">Select a unit to view criteria and confirm mapping.</p>
        ) : criteria.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">No criteria found for this unit (spec not extracted/locked?).</p>
        ) : (
          <>
            {loSummary.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {loSummary.map((lo) => (
                  <span
                    key={lo.loCode}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-800"
                  >
                    {lo.loCode}: {lo.selected} selected{lo.detected ? ` · ${lo.detected} detected` : ""}
                  </span>
                ))}
              </div>
            ) : null}

            {filteredCriteria.length === 0 ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                {view === "current"
                  ? "No criteria detected/selected yet. Switch to All unit criteria to browse the full spec."
                  : "No criteria match your filters."}
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                {groupedCriteria.map((group) => {
                  const summary = loSummaryByCode.get(group.loCode);
                  return (
                    <div key={group.loCode} className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-zinc-900">{group.loCode}</div>
                        <div className="text-[11px] text-zinc-600">
                          {summary ? `${summary.selected} selected` : "0 selected"}
                        </div>
                      </div>

                      <div className="mt-2 grid gap-2">
                        {group.items.map((c: any) => {
                          const code = normCode(c.acCode);
                          const checked = !!mapSelected?.[code];
                          const suggested = detectedCodes.includes(code);

                          return (
                            <label
                              key={`${group.loCode}-${c.acCode}`}
                              className={cx(
                                "flex items-start gap-3 rounded-2xl border p-3 text-sm transition",
                                checked
                                  ? "border-zinc-900 bg-zinc-900 text-white"
                                  : suggested
                                  ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-50"
                                  : "border-zinc-200 bg-white hover:bg-zinc-50"
                              )}
                              title={suggested ? "Detected in brief text" : ""}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = { ...(mapSelected || {}) };
                                  if (e.target.checked) next[code] = true;
                                  else delete next[code];
                                  setMapSelected(next);
                                }}
                                className="mt-1"
                              />

                              <div className="min-w-0 flex-1">
                                <div className={cx("flex flex-wrap items-center gap-2", checked ? "text-white" : "text-zinc-900")}>
                                  <span
                                    className={cx(
                                      "rounded-lg border px-2 py-0.5 text-xs font-bold",
                                      checked ? "border-white/30 bg-white/10" : "border-zinc-200 bg-white"
                                    )}
                                  >
                                    {c.acCode}
                                  </span>

                                  <span
                                    className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", bandPill(c.gradeBand))}
                                  >
                                    {String(c.gradeBand || "").toUpperCase()}
                                  </span>

                                  {suggested ? (
                                    <span
                                      className={cx(
                                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                        checked
                                          ? "border-emerald-200/40 bg-emerald-200/10 text-emerald-200"
                                          : "border-emerald-200 bg-emerald-100 text-emerald-900"
                                      )}
                                    >
                                      Detected
                                    </span>
                                  ) : null}

                                  {checked ? (
                                    <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white">
                                      Selected
                                    </span>
                                  ) : null}
                                </div>

                                <div className={cx("mt-1 text-xs leading-relaxed", checked ? "text-zinc-200" : "text-zinc-700")}>
                                  {c.description}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <p className="mt-3 text-xs text-zinc-500">
          Professional default: <span className="font-semibold">Current brief</span> shows only detected/selected criteria, grouped by LO. Switch to{" "}
          <span className="font-semibold">All unit criteria</span> to view the full spec universe.
        </p>

        <p className="mt-2 text-xs text-zinc-500">
          Lock stores the selected criteria mapping and binds this brief PDF to the chosen locked unit spec.
        </p>
      </div>
    </div>
  );
}
