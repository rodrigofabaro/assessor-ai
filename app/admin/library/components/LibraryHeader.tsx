"use client";

export function LibraryHeader({ busy, error }: { busy: string | null; error: string | null }) {
  return (
    <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Reference library</h1>
          <p className="mt-1 text-sm text-zinc-700">
            Manage <span className="font-semibold">LOCKED</span> unit specs (the grading ground truth). Edit labels, see which
            briefs are bound, and archive old issues.
          </p>
        </div>
        <div className="text-xs text-zinc-600">{busy ? <span>⏳ {busy}</span> : <span>Ready</span>}</div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
    </header>
  );
}
