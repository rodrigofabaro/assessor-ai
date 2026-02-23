"use client";

function stripEquationTokens(text: string) {
  return String(text || "")
    .replace(/\[\[EQ:[^\]]+\]\]/g, "")
    .replace(/\[\[IMG:[^\]]+\]\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .trim();
}

function gradePill(band: any): { cls: string; text: string } {
  const b = String(band || "").toUpperCase().trim();

  if (b === "PASS") return { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", text: "PASS" };
  if (b === "MERIT") return { cls: "border-cyan-200 bg-cyan-50 text-cyan-900", text: "MERIT" };
  if (b === "DISTINCTION") return { cls: "border-violet-200 bg-violet-50 text-violet-900", text: "DISTINCTION" };

  // fallback (never crash)
  return { cls: "border-zinc-200 bg-zinc-50 text-zinc-700", text: b || "—" };
}

function bandRankFromCode(acCode: string) {
  const c = (acCode || "").toUpperCase();
  if (c.startsWith("P")) return 1;
  if (c.startsWith("M")) return 2;
  if (c.startsWith("D")) return 3;
  return 9;
}

function codeNumber(acCode: string) {
  const m = String(acCode || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function sortCriteriaPearson(a: any, b: any) {
  const ac = String(a?.acCode || a?.code || "");
  const bc = String(b?.acCode || b?.code || "");
  return bandRankFromCode(ac) - bandRankFromCode(bc) || codeNumber(ac) - codeNumber(bc) || ac.localeCompare(bc);
}

function groupCriteria(criteria: any[]) {
  const sorted = [...(criteria || [])].sort(sortCriteriaPearson);
  const codeOf = (c: any) => String(c?.acCode || c?.code || "");
  const pass = sorted.filter((c) => codeOf(c).toUpperCase().startsWith("P"));
  const merit = sorted.filter((c) => codeOf(c).toUpperCase().startsWith("M"));
  const dist = sorted.filter((c) => codeOf(c).toUpperCase().startsWith("D"));
  const other = sorted.filter((c) => !/^[PMD]/i.test(codeOf(c)));
  return { pass, merit, dist, other };
}

function CriteriaColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: any[];
  tone: "pass" | "merit" | "dist";
}) {
  const toneWrap =
    tone === "pass"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "merit"
      ? "border-cyan-200 bg-cyan-50/60"
      : "border-violet-200 bg-violet-50/60";

  const toneHeader =
    tone === "pass"
      ? "border-emerald-200 bg-emerald-100/60 text-emerald-900"
      : tone === "merit"
      ? "border-cyan-200 bg-cyan-100/60 text-cyan-900"
      : "border-violet-200 bg-violet-100/60 text-violet-900";

  const toneDot =
    tone === "pass"
      ? "bg-emerald-600"
      : tone === "merit"
      ? "bg-cyan-600"
      : "bg-violet-600";

  return (
    <div className={"rounded-2xl border overflow-hidden min-w-0 " + toneWrap}>
      <div className={"border-b px-3 py-2 " + toneHeader}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={"h-2 w-2 rounded-full " + toneDot} aria-hidden="true" />
            <div className="text-xs font-semibold uppercase tracking-wide truncate">{title}</div>
          </div>
          <div className="text-[11px] opacity-80">{items.length} criteria</div>
        </div>
      </div>

      <div className="p-3 grid gap-2">
        {items.length ? (
          items.map((c) => (
            <div key={c.id || c.acCode || c.code} className="rounded-xl border border-zinc-200 bg-white/80 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-zinc-900">{c.acCode || c.code}</div>
                {c.gradeBand ? (
                  <span
                    className={
                      "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold " +
                      gradePill(c.gradeBand).cls
                    }
                  >
                   {gradePill(c.gradeBand).text}
                  </span>
                ) : null}
              </div>

              <div className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap break-words leading-6">
                {stripEquationTokens(c.description)}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white/70 p-3 text-sm text-zinc-600">None</div>
        )}
      </div>
    </div>
  );
}

export function LoCriteriaGrid({ learningOutcomes }: { learningOutcomes: any[] }) {
  const los = Array.isArray(learningOutcomes) ? learningOutcomes : [];

  return (
    <div className="grid gap-5">
      {los.map((lo: any, idx: number) => {
        const { pass, merit, dist, other } = groupCriteria(lo.criteria || []);
        return (
          <section key={lo.id || lo.loCode || idx} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 via-white to-zinc-50 px-4 py-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-8 w-1 rounded-full bg-zinc-900" />
                <div>
                  <div className="text-sm font-semibold">Learning Outcome {lo.loCode}</div>
                  <div className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap break-words">
                    {stripEquationTokens(lo.description)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <CriteriaColumn title="Pass" items={pass} tone="pass" />
                <CriteriaColumn title="Merit" items={merit} tone="merit" />
                <CriteriaColumn title="Distinction" items={dist} tone="dist" />
              </div>

              {other.length ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Other criteria detected</div>
                  <div className="mt-2 grid gap-2">
                    {other.map((c: any) => (
                      <div key={c.id || c.acCode || c.code} className="rounded-xl border border-amber-200 bg-white p-3">
                        <div className="text-sm font-semibold text-amber-900">{c.acCode || c.code || "—"}</div>
                        <div className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap break-words leading-6">
                          {stripEquationTokens(c.description)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
