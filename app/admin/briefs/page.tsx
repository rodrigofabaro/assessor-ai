"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useBriefsAdmin, ivTone, statusTone, tone } from "./briefs.logic";

function Pill({ cls, children }: { cls: string; children: any }) {
  return <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " + cls}>{children}</span>;
}

function Btn({
  kind,
  children,
  onClick,
  disabled,
}: {
  kind: "primary" | "ghost";
  children: any;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls =
    kind === "primary"
      ? "rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900"
      : "rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export default function AdminBriefsPage() {
  const vm = useBriefsAdmin();

  // Keep tab in sync with hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "extract") vm.setTab("extract");
      if (h === "library") vm.setTab("library");
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4 min-w-0">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Briefs</h1>
            <p className="mt-1 text-sm text-zinc-700">
              The <span className="font-semibold">Library</span> is your register of locked briefs ready for grading. The{" "}
              <span className="font-semibold">Inbox</span> is where you extract PDFs, fix metadata, and lock versions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Btn kind="ghost" onClick={vm.refresh} disabled={vm.busy}>
              Refresh
            </Btn>
            <div className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-600">
              <span className={"h-2 w-2 rounded-full " + (vm.error ? "bg-rose-500" : "bg-emerald-500")} />
              {vm.busy ? "Working…" : "Ready"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn
            kind={vm.tab === "library" ? "primary" : "ghost"}
            onClick={() => {
              vm.setTab("library");
              if (typeof window !== "undefined") window.location.hash = "library";
            }}
          >
            Library
          </Btn>
          <Btn
            kind={vm.tab === "extract" ? "primary" : "ghost"}
            onClick={() => {
              vm.setTab("extract");
              if (typeof window !== "undefined") window.location.hash = "extract";
            }}
          >
            Extract tools
          </Btn>
        </div>

        {vm.error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{vm.error}</div>
        ) : null}
      </header>

      {vm.tab === "library" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Locked brief register</h2>
              <p className="mt-1 text-sm text-zinc-700">
                These are the briefs you can safely use for assessment. Each row links to an inspector with the PDF, versions,
                extracted header fields, and IV history.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={vm.q}
                onChange={(e) => vm.setQ(e.target.value)}
                placeholder="Search unit, A-code, title, year…"
                className="w-64 max-w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              />

              <select
                value={vm.unitFilter}
                onChange={(e) => vm.setUnitFilter(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="all">All units</option>
                {vm.unitOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>

              <select
                value={vm.statusFilter}
                onChange={(e) => vm.setStatusFilter(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="all">All statuses</option>
                {vm.statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <Btn kind="ghost" onClick={() => (typeof window !== "undefined" ? (window.location.hash = "extract") : null)}>
                Go to inbox
              </Btn>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 min-w-0">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Brief</th>
                  <th className="px-3 py-2 text-left font-semibold">Year</th>
                  <th className="px-3 py-2 text-left font-semibold">Issue</th>
                  <th className="px-3 py-2 text-left font-semibold">Final submit</th>
                  <th className="px-3 py-2 text-left font-semibold">IV</th>
                  <th className="px-3 py-2 text-left font-semibold">PDF</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vm.libraryRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-zinc-600">
                      No locked briefs yet. Use Extract tools to lock a brief PDF, then it will appear here.
                    </td>
                  </tr>
                ) : (
                  vm.libraryRows.map((r) => {
                    const doc = r.linkedDoc;
                    const iv = r.ivForYear;
                    const pdfHref = doc ? `/api/reference-documents/${doc.id}/file` : "";
                    return (
                      <tr key={r.id} className="border-t border-zinc-100">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-zinc-900">
                            {r.unit?.unitCode} {r.assignmentCode} — {r.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                            <Pill cls={statusTone(r.status)}>{(r.status || "").toUpperCase()}</Pill>
                            {doc ? <Pill cls={statusTone(doc.status)}>{(doc.status || "").toUpperCase()}</Pill> : <Pill cls={tone("warn")}>NO DOC</Pill>}
                            {doc?.lockedAt ? <Pill cls={tone("ok")}>DOC LOCKED</Pill> : <Pill cls={tone("warn")}>DOC NOT LOCKED</Pill>}
                            <span className="truncate">{doc?.originalFilename || "—"}</span>
                          </div>
                        </td>

                        <td className="px-3 py-3 text-zinc-700">{r.headerYear || "—"}</td>
                        <td className="px-3 py-3 text-zinc-700">{r.issueDate || "—"}</td>
                        <td className="px-3 py-3 text-zinc-700">{r.finalSubmissionDate || "—"}</td>

                        <td className="px-3 py-3">
                          {iv ? (
                            <Pill cls={ivTone(iv.outcome)}>{iv.outcome.replaceAll("_", " ")}</Pill>
                          ) : (
                            <Pill cls={tone("warn")}>MISSING</Pill>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {doc ? (
                            <a href={pdfHref} target="_blank" rel="noreferrer" className="text-sm font-semibold text-zinc-900 underline decoration-zinc-300 hover:decoration-zinc-900">
                              Open
                            </a>
                          ) : (
                            <span className="text-sm text-zinc-500">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/admin/briefs/${r.id}`}
                            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                          >
                            Inspect
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-zinc-600">
            Note: “IV = MISSING” means the linked PDF doesn’t yet have an IV record for the same academic year extracted from the PDF header.
          </div>
        </section>
      ) : null}

      {vm.tab === "extract" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-700">
            Extract tools live here (same as Specs). If you don’t see your inbox UI, you may still be on the older patch version.
          </div>
          <div className="mt-3">
            <Btn kind="primary" onClick={() => (typeof window !== "undefined" ? (window.location.hash = "extract") : null)}>
              Stay here
            </Btn>
          </div>
        </section>
      ) : null}
    </div>
  );
}
