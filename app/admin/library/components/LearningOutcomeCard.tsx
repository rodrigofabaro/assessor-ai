"use client";

export default function LearningOutcomeCard({ lo }: { lo: any }) {
  const criteria = Array.isArray(lo?.criteria) ? lo.criteria : [];

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
            <p className="min-w-0 text-sm font-semibold text-zinc-900 leading-relaxed break-words">{lo.description || ""}</p>
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
                  .map((c: any, idx: number) => (
                    <li key={c.id || `${c.acCode}-${idx}`} className="rounded-xl border border-zinc-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-bold text-zinc-900">
                          {c.acCode || "(no code)"}
                        </span>
                        {c.gradeBand ? <span className="text-xs text-zinc-600">{String(c.gradeBand)}</span> : null}
                      </div>
                      <p className="mt-2 text-sm text-zinc-900 leading-relaxed break-words whitespace-pre-wrap">{c.description || ""}</p>
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
