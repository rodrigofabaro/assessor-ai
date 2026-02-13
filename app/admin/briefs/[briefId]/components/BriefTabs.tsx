"use client";

export type BriefTabKey = "overview" | "tasks" | "versions" | "iv" | "rubric";

export function BriefTabs({ tab, onChange }: { tab: BriefTabKey; onChange: (next: BriefTabKey) => void }) {
  const tabBtn = (active: boolean) =>
    "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition " +
    (active
      ? "border-zinc-300 bg-zinc-100 text-zinc-900"
      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50");

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className={tabBtn(tab === "overview")} onClick={() => onChange("overview")}>
        Overview
      </button>
      <button type="button" className={tabBtn(tab === "tasks")} onClick={() => onChange("tasks")}>
        Tasks
      </button>
      <button type="button" className={tabBtn(tab === "versions")} onClick={() => onChange("versions")}>
        Versions
      </button>
      <button type="button" className={tabBtn(tab === "iv")} onClick={() => onChange("iv")}>
        IV
      </button>
      <button type="button" className={tabBtn(tab === "rubric")} onClick={() => onChange("rubric")}>
        Rubric
      </button>
    </div>
  );
}
