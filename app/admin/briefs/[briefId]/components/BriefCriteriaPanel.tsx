"use client";

import { Pill } from "../../components/ui";
import { tone } from "./briefStyles";

type CriterionItem = {
  acCode: string;
  description?: string;
  source: "spec" | "brief";
};

function rankFromCode(code: string) {
  const up = String(code || "").toUpperCase();
  if (up.startsWith("P")) return 1;
  if (up.startsWith("M")) return 2;
  if (up.startsWith("D")) return 3;
  return 9;
}

function codeNum(code: string) {
  const m = String(code || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function sortByCode(a: CriterionItem, b: CriterionItem) {
  return rankFromCode(a.acCode) - rankFromCode(b.acCode) || codeNum(a.acCode) - codeNum(b.acCode) || a.acCode.localeCompare(b.acCode);
}

function toneWrap(tone: "pass" | "merit" | "dist") {
  if (tone === "pass") return "border-emerald-200 bg-emerald-50/60";
  if (tone === "merit") return "border-cyan-200 bg-cyan-50/60";
  return "border-violet-200 bg-violet-50/60";
}

function toneHeader(tone: "pass" | "merit" | "dist") {
  if (tone === "pass") return "border-emerald-200 bg-emerald-100/60 text-emerald-900";
  if (tone === "merit") return "border-cyan-200 bg-cyan-100/60 text-cyan-900";
  return "border-violet-200 bg-violet-100/60 text-violet-900";
}

function toneDot(tone: "pass" | "merit" | "dist") {
  if (tone === "pass") return "bg-emerald-600";
  if (tone === "merit") return "bg-cyan-600";
  return "bg-violet-600";
}

function CriteriaColumn({ title, toneKind, items }: { title: string; toneKind: "pass" | "merit" | "dist"; items: CriterionItem[] }) {
  return (
    <div className={"rounded-2xl border overflow-hidden min-w-0 " + toneWrap(toneKind)}>
      <div className={"border-b px-3 py-2 " + toneHeader(toneKind)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={"h-2 w-2 rounded-full " + toneDot(toneKind)} aria-hidden="true" />
            <div className="text-xs font-semibold uppercase tracking-wide truncate">{title}</div>
          </div>
          <div className="text-[11px] opacity-80">{items.length} criteria</div>
        </div>
      </div>

      <div className="p-3 grid gap-2">
        {items.length ? (
          items.map((c) => (
            <div key={c.acCode} className="rounded-xl border border-zinc-200 bg-white/80 p-3 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">{c.acCode}</div>
              <div className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap break-words leading-6">
                {c.description || "(from brief)"}
              </div>
              {c.source === "brief" ? (
                <div className="mt-2">
                  <Pill cls={tone("muted")}>FROM BRIEF</Pill>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white/70 p-3 text-sm text-zinc-600">None</div>
        )}
      </div>
    </div>
  );
}

export function BriefCriteriaPanel({
  codes,
  specCriteria,
  hasSpec,
}: {
  codes: string[];
  specCriteria: Array<{ acCode: string; description?: string }>;
  hasSpec: boolean;
}) {
  const criteria = (codes || [])
    .map((code) => {
      const hit = (specCriteria || []).find((c) => String(c.acCode || "").toUpperCase() === String(code || "").toUpperCase());
      return {
        acCode: String(code || "").toUpperCase(),
        description: hit?.description || "",
        source: hit ? "spec" : "brief",
      } as CriterionItem;
    })
    .sort(sortByCode);

  const pass = criteria.filter((c) => c.acCode.startsWith("P"));
  const merit = criteria.filter((c) => c.acCode.startsWith("M"));
  const dist = criteria.filter((c) => c.acCode.startsWith("D"));

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Criteria in this brief</h2>
        {!hasSpec ? <Pill cls={tone("warn")}>SPEC NOT LINKED</Pill> : null}
      </div>

      {codes.length === 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No criteria codes in this extract. Re-extract brief.
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <CriteriaColumn title="Pass" toneKind="pass" items={pass} />
          <CriteriaColumn title="Merit" toneKind="merit" items={merit} />
          <CriteriaColumn title="Distinction" toneKind="dist" items={dist} />
        </div>
      )}
    </section>
  );
}
