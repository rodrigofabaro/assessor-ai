/* eslint-disable react-hooks/refs */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBriefsAdmin, ivTone, statusTone, tone } from "./briefs.logic";
import { badge, useReferenceAdmin, type ReferenceDocument, type Unit, type Criterion } from "../reference/reference.logic";

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
  // Library/register VM (your new briefs register)
  const vm = useBriefsAdmin();

  // ✅ Extract Inbox/Workbench VM (reuses the proven Spec inbox, hard-scoped to BRIEF)
  const rx = useReferenceAdmin({
    context: "briefs",
    fixedInboxType: "BRIEF",
    fixedUploadType: "BRIEF",
  });

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

  const busy = vm.tab === "extract" ? !!rx.busy : vm.busy;
  const err = vm.tab === "extract" ? rx.error : vm.error;

  const refresh = async () => {
    if (vm.tab === "extract") {
      await rx.refreshAll();
    } else {
      await vm.refresh();
    }
  };

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
            <Btn kind="ghost" onClick={refresh} disabled={busy}>
              Refresh
            </Btn>
            <div className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-600">
              <span className={"h-2 w-2 rounded-full " + (err ? "bg-rose-500" : "bg-emerald-500")} />
              {busy ? "Working…" : "Ready"}
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
              rx.refreshAll();
            }}
          >
            Extract tools
          </Btn>
        </div>

        {err ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{err}</div> : null}
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

              <Btn
                kind="ghost"
                onClick={() => {
                  vm.setTab("extract");
                  if (typeof window !== "undefined") window.location.hash = "extract";
                  rx.refreshAll();
                }}
              >
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
                  <th className="px-3 py-2 text-left font-semibold">Readiness</th>
                  <th className="px-3 py-2 text-left font-semibold">IV</th>
                  <th className="px-3 py-2 text-left font-semibold">PDF</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vm.libraryRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-zinc-600">
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
                            {doc ? (
                              <Pill cls={statusTone(doc.status)}>{(doc.status || "").toUpperCase()}</Pill>
                            ) : (
                              <Pill cls={tone("warn")}>NO DOC</Pill>
                            )}
                            {doc?.lockedAt ? <Pill cls={tone("ok")}>DOC LOCKED</Pill> : <Pill cls={tone("warn")}>DOC NOT LOCKED</Pill>}
                            <span className="truncate">{doc?.originalFilename || "—"}</span>
                          </div>
                        </td>

                        <td className="px-3 py-3 text-zinc-700">{r.headerYear || "—"}</td>
                        <td className="px-3 py-3 text-zinc-700">{r.issueDate || "—"}</td>
                        <td className="px-3 py-3 text-zinc-700">{r.finalSubmissionDate || "—"}</td>

                        <td className="px-3 py-3">
                          <Pill cls={r.readiness === "READY" ? tone("ok") : r.readiness === "BLOCKED" ? tone("bad") : tone("warn")}>
                            <span title={r.readinessReason || ""}>{r.readiness || "—"}</span>
                          </Pill>
                        </td>

                        <td className="px-3 py-3">
                          {iv ? <Pill cls={ivTone(iv.outcome)}>{iv.outcome.replaceAll("_", " ")}</Pill> : <Pill cls={tone("warn")}>MISSING</Pill>}
                        </td>

                        <td className="px-3 py-3">
                          {doc ? (
                            <a
                              href={pdfHref}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-semibold text-zinc-900 underline decoration-zinc-300 hover:decoration-zinc-900"
                            >
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

      {vm.tab === "extract" ? <BriefExtractWorkbench rx={rx} /> : null}
    </div>
  );
}

/* --------------------------- Extract tools (Inbox + Review) --------------------------- */

function BriefExtractWorkbench({ rx }: { rx: ReturnType<typeof useReferenceAdmin> }) {
  const [showUpload, setShowUpload] = useState(false);

  const f = rx.filters;
  const setF = rx.setFilters;

  const counts = useMemo(() => {
    const total = rx.documents.length;
    const shown = rx.filteredDocuments.length;
    const byStatus: Record<string, number> = {};
    for (const d of rx.documents) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    return { total, shown, byStatus };
  }, [rx.documents, rx.filteredDocuments]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Brief extraction</div>
          <p className="mt-1 text-xs text-zinc-600">
            Inbox is <span className="font-semibold">BRIEF</span>-only. Select a PDF, then Extract → review mapping → Lock.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Upload brief PDF
          </button>

          <button
            onClick={rx.resetFilters}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Reset filters
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[420px_1fr] min-w-0">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Inbox</h2>
              <p className="mt-1 text-xs text-zinc-500">BRIEF documents only.</p>
            </div>

            <button
              onClick={rx.resetFilters}
              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Reset
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              placeholder="Search title, filename, unit code, A-code…"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm flex items-center">Type: BRIEF</div>

              <select
                value={f.status}
                onChange={(e) => setF({ ...f, status: (e.target.value as any) || "" })}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              >
                <option value="">All statuses</option>
                <option value="UPLOADED">UPLOADED</option>
                <option value="EXTRACTED">EXTRACTED</option>
                <option value="REVIEWED">REVIEWED</option>
                <option value="LOCKED">LOCKED</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!f.onlyLocked}
                  onChange={(e) => setF({ ...f, onlyLocked: e.target.checked, onlyUnlocked: e.target.checked ? false : f.onlyUnlocked })}
                />
                Only locked
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!f.onlyUnlocked}
                  onChange={(e) => setF({ ...f, onlyUnlocked: e.target.checked, onlyLocked: e.target.checked ? false : f.onlyLocked })}
                />
                Only unlocked
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={f.sort}
                onChange={(e) => setF({ ...f, sort: e.target.value as any })}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              >
                <option value="updated">Sort: updated</option>
                <option value="uploaded">Sort: uploaded</option>
                <option value="title">Sort: title</option>
              </select>

              <div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm flex items-center">
                Showing {counts.shown} of {counts.total}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 max-h-[55vh] overflow-auto pr-1">
            {rx.filteredDocuments.map((d) => {
              const active = rx.selectedDocId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => rx.setSelectedDocId(d.id)}
                  className={
                    "w-full rounded-xl border p-3 text-left transition " +
                    (active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={"inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold " + badge(d.status).cls}>
                      {badge(d.status).text}
                    </span>
                    <span className={"text-xs " + (active ? "text-zinc-200" : "text-zinc-500")}>v{d.version}</span>
                  </div>

                  <div className="mt-2 text-sm font-semibold leading-5">{d.title}</div>
                  <div className={"mt-1 text-xs " + (active ? "text-zinc-200" : "text-zinc-600")}>{d.originalFilename}</div>
                </button>
              );
            })}

            {rx.filteredDocuments.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No docs match your filters.</div>
            ) : null}
          </div>
        </section>

        <BriefReviewCard rx={rx} />
      </div>

      {showUpload ? <BriefUploadModal rx={rx} onClose={() => setShowUpload(false)} /> : null}
    </section>
  );
}


function BriefUploadModal({ rx, onClose }: { rx: ReturnType<typeof useReferenceAdmin>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/30"
        onClick={() => (rx.busy ? null : onClose())}
        aria-label="Close upload modal"
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="text-sm font-semibold">Upload brief</div>

          <button
            type="button"
            onClick={() => (rx.busy ? null : onClose())}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Title</span>
            <input
              value={rx.docTitle}
              onChange={(e) => rx.setDocTitle(e.target.value)}
              placeholder="e.g. U4015 A1 — PLC Design, Operation, and Program Design (2025-2026)"
              className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Version</span>
              <input
                value={rx.docVersion}
                onChange={(e) => rx.setDocVersion(e.target.value)}
                className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium">File</span>
              <input
                ref={rx.fileRef}
                type="file"
                onChange={(e) => rx.setDocFile(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
              />
            </label>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={async () => {
                await rx.uploadDoc(); // fixedUploadType=BRIEF ensures BRIEF
                await rx.refreshAll();
                onClose();
              }}
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
            >
              Upload
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
            >
              Cancel
            </button>

            <div className="ml-auto text-xs text-zinc-600">Ready</div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            Uploads go to the <span className="font-semibold">Brief Inbox</span>. Next: Extract → review header/mapping → Lock.
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="mt-0.5 break-words text-sm font-semibold text-zinc-900">{value || "-"}</div>
    </div>
  );
}

function BriefReviewCard({ rx }: { rx: ReturnType<typeof useReferenceAdmin> }) {
  const doc = rx.selectedDoc as ReferenceDocument | null;
  const draft: any = doc?.extractedJson || null;

  const canExtract = !!doc && !rx.busy;
  const canLock = !!doc && !rx.busy;

  const header = (draft && draft.kind === "BRIEF" ? draft.header || {} : {}) as any;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm min-w-0 overflow-hidden">
      <div className="border-b border-zinc-200 p-4">
        <div className="text-sm font-semibold">Review</div>
        <div className="mt-1 text-xs text-zinc-600">BRIEF-only review: header fields + mapping + lock.</div>
      </div>

      {!doc ? (
        <div className="p-4 text-sm text-zinc-600">Select a BRIEF PDF from the inbox to review it.</div>
      ) : (
        <div className="p-4 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Type" value={doc.type} />
            <Meta label="Uploaded" value={new Date(doc.uploadedAt).toLocaleString()} />
            <Meta label="Status" value={doc.status} />
            <Meta label="Locked at" value={doc.lockedAt ? new Date(doc.lockedAt).toLocaleString() : ""} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canExtract}
              onClick={rx.extractSelected}
              className={
                "h-10 rounded-xl px-4 text-sm font-semibold " +
                (!canExtract ? "bg-zinc-200 text-zinc-600 cursor-not-allowed" : "bg-zinc-900 text-white hover:bg-zinc-800")
              }
            >
              Extract
            </button>

            <button
              type="button"
              disabled={!canExtract}
              onClick={rx.reextractSelected}
              className={
                "h-10 rounded-xl border px-4 text-sm font-semibold " +
                (!canExtract ? "border-zinc-200 bg-white text-zinc-400 cursor-not-allowed" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
              }
            >
              Re-extract
            </button>

            <button
              type="button"
              disabled={!canLock}
              onClick={rx.lockSelected}
              className={
                "h-10 rounded-xl border px-4 text-sm font-semibold " +
                (!canLock ? "border-zinc-200 bg-white text-zinc-400 cursor-not-allowed" : "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800")
              }
            >
              Lock
            </button>

            <a
              href={`/api/reference-documents/${doc.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="h-10 inline-flex items-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              PDF preview
            </a>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-600">Header snapshot (extracted)</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Meta label="Academic year" value={header.academicYear || ""} />
              <Meta label="IV name" value={header.internalVerifier || ""} />
              <Meta label="IV date" value={header.verificationDate || ""} />
              <Meta label="Issue date" value={header.issueDate || ""} />
              <Meta label="Final submission" value={header.finalSubmissionDate || ""} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              These are stored for audit. If the PDF changes next year, upload a new version and re-lock.
            </p>
          </div>

          <BriefMappingPanel
            draft={draft}
            units={rx.units as unknown as Unit[]}
            briefUnitId={rx.briefUnitId}
            setBriefUnitId={rx.setBriefUnitId}
            criteria={rx.criteriaForSelectedUnit as unknown as Criterion[]}
            mapSelected={rx.mapSelected}
            setMapSelected={rx.setMapSelected}
            assignmentCodeInput={rx.assignmentCodeInput}
            setAssignmentCodeInput={rx.setAssignmentCodeInput}
          />

          <details className="rounded-2xl border border-zinc-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Raw extracted JSON (advanced)</summary>
            <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
              {JSON.stringify(draft, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}

function BriefMappingPanel({
  draft,
  units,
  briefUnitId,
  setBriefUnitId,
  criteria,
  mapSelected,
  setMapSelected,
  assignmentCodeInput,
  setAssignmentCodeInput,
}: {
  draft: any;
  units: Unit[];
  briefUnitId: string;
  setBriefUnitId: (id: string) => void;
  criteria: Criterion[];
  mapSelected: Record<string, boolean>;
  setMapSelected: (x: Record<string, boolean>) => void;
  assignmentCodeInput: string;
  setAssignmentCodeInput: (v: string) => void;
}) {
  const kind = draft?.kind || "";
  const codes: string[] = (draft?.detectedCriterionCodes || []).map((x: string) => String(x).toUpperCase());
  const unitGuess = draft?.unitCodeGuess ? String(draft.unitCodeGuess) : "";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="text-xs text-zinc-600">Mapping</div>

      {kind !== "BRIEF" ? (
        <p className="mt-2 text-sm text-zinc-700">No BRIEF draft extracted yet. Click Extract.</p>
      ) : (
        <>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
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
                  className="h-10 w-36 rounded-xl border border-zinc-300 px-3 text-sm"
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
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
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
            <div className="font-semibold text-zinc-900">Criteria mapping</div>
            <p className="mt-1 text-sm text-zinc-700 break-words">
              Detected codes: <span className="font-semibold">{codes.length ? codes.join(", ") : "(none)"}</span>
            </p>

            {!briefUnitId ? (
              <p className="mt-2 text-sm text-zinc-600">Select a unit to view criteria and confirm mapping.</p>
            ) : criteria.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No criteria found for this unit (spec not extracted/locked?).</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {criteria.map((c: any) => {
                  const checked = !!mapSelected[c.id];
                  const suggested = codes.includes(String(c.acCode || "").toUpperCase());
                  return (
                    <label
                      key={c.id}
                      className={
                        "flex items-start gap-3 rounded-xl border p-3 text-sm " +
                        (checked ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50")
                      }
                      title={suggested ? "Detected in brief text" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = { ...mapSelected, [c.id]: e.target.checked };
                          if (!e.target.checked) delete next[c.id];
                          setMapSelected(next);
                        }}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className={"inline-flex items-center gap-2 " + (checked ? "text-white" : "text-zinc-900")}>
                          <span className={"rounded-lg border px-2 py-0.5 text-xs font-bold " + (checked ? "border-white/30 bg-white/10" : "border-zinc-200 bg-zinc-50")}>
                            {c.acCode}
                          </span>
                          <span className={"text-xs " + (checked ? "text-zinc-200" : "text-zinc-600")}>{c.gradeBand}</span>
                          {suggested ? <span className={"text-xs font-semibold " + (checked ? "text-emerald-200" : "text-emerald-700")}>Detected</span> : null}
                        </div>
                        <div className={"mt-1 text-xs leading-relaxed " + (checked ? "text-zinc-200" : "text-zinc-700")}>
                          {c.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <p className="mt-3 text-xs text-zinc-500">
              Lock will store the selected criteria mapping and bind this brief PDF to the chosen locked unit spec.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
