"use client";

import { useMemo, useState } from "react";

export function PagesTab({ vm }: { vm: any }) {
  const [selectedPage, setSelectedPage] = useState(1);
  const tasks = useMemo(() => (Array.isArray(vm?.linkedDoc?.extractedJson?.tasks) ? vm.linkedDoc.extractedJson.tasks : []), [vm]);

  const maxTaskPage = tasks.reduce((m: number, t: any) => {
    if (!Array.isArray(t?.pages) || !t.pages.length) return m;
    return Math.max(m, ...t.pages);
  }, 1);

  const pageCount = Math.max(Number(vm?.linkedDoc?.extractedJson?.pageCount || 0), maxTaskPage, 1);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  const relatedTasks = tasks.filter((t: any) => Array.isArray(t?.pages) && t.pages.includes(selectedPage));

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Pages</h2>
      <p className="mt-1 text-sm text-zinc-700">Lightweight page viewer with task mapping.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold text-zinc-700">Page thumbnails</div>
          <div className="grid gap-2">
            {pages.map((page) => (
              <button
                type="button"
                key={`page-${page}`}
                onClick={() => setSelectedPage(page)}
                className={`rounded-lg border px-2 py-2 text-left ${selectedPage === page ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:bg-zinc-100"}`}
              >
                <div className="text-xs font-semibold text-zinc-800">Page {page}</div>
                <div className="text-[11px] text-zinc-600">
                  {tasks.filter((t: any) => Array.isArray(t?.pages) && t.pages.includes(page)).length} mapped task(s)
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="grid gap-3">
          <div className="rounded-xl border border-zinc-200 p-2">
            {vm.pdfHref ? (
              <iframe
                title={`brief-page-${selectedPage}`}
                src={`${vm.pdfHref}#page=${selectedPage}`}
                className="h-[70vh] w-full rounded-lg"
              />
            ) : (
              <div className="p-4 text-sm text-zinc-700">No linked PDF available.</div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold text-zinc-700">Blocks mapped to page {selectedPage}</div>
            {relatedTasks.length ? (
              <ul className="mt-1 list-disc pl-5 text-sm text-zinc-800">
                {relatedTasks.map((t: any) => (
                  <li key={`page-map-${t.n}`}>{t.label || `Task ${t.n}`}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-sm text-zinc-600">No extracted task currently mapped to this page.</div>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}
