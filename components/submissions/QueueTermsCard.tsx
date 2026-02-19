import { QUEUE_TERMS } from "@/lib/submissions/queueTerms";

export function QueueTermsCard({ title = "Queue terms", compact = false }: { title?: string; compact?: boolean }) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{title}</span>
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Expand</span>
      </summary>
      <div className="grid gap-2 border-t border-zinc-200 px-3 py-3">
        {QUEUE_TERMS.map((term) => (
          <article key={term.key} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-700">{term.label}</div>
            <p className={"mt-1 text-zinc-700 " + (compact ? "text-[11px]" : "text-xs")}>{term.meaning}</p>
          </article>
        ))}
      </div>
    </details>
  );
}
