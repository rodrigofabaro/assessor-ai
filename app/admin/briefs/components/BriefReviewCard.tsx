"use client";

import { useState } from "react";
import type { Criterion, ReferenceDocument, Unit } from "../../reference/reference.logic";
import { Meta, Pill } from "./ui";
import BriefMappingPanel from "./BriefMappingPanel";
import { ui } from "@/components/ui/uiClasses";
import { useRouter } from "next/navigation";
import { TaskCard } from "./TaskCard";
import { tone } from "../[briefId]/components/briefStyles";

export default function BriefReviewCard({ rx }: { rx: any }) {
  const router = useRouter();
  const doc = rx.selectedDoc as ReferenceDocument | null;

  // 1. Extract latest draft from props
  const latestDraft: any = doc?.extractedJson || null;

  /**
   * 2. Derive a "safe" draft (replaces lastGoodDraft state/effect)
   * We validate the current latestDraft. If it's empty (e.g. during a re-extract),
   * we show the last persisted truth from the doc object.
   */
  const isValidDraft = (d: any) =>
    d &&
    typeof d === "object" &&
    (d.kind || d.header || d.tasks);

  const draft: any = isValidDraft(latestDraft) 
    ? latestDraft 
    : (doc?.extractedJson ?? null);

  // Avoid reading rx.busy.current during render if it's a ref.
  const isBusy = !!(rx?.busy?.current ?? rx?.busy);
  const usage = rx.selectedDocUsage;
  const usageLoading = rx.usageLoading;
  
  const canExtract = !!doc && !isBusy;
  const canLock = !!doc && !isBusy;
  const canUnlock = !!doc && !isBusy && !!doc.lockedAt && !!usage && !usage.inUse;
  const canDelete = !!doc && !isBusy && !doc.lockedAt && !!usage && !usage.inUse;

  const header = (
    draft && draft.kind === "BRIEF" ? draft.header || {} : {}
  ) as any;

  const draftWarnings = Array.isArray(draft?.warnings) ? draft.warnings : [];
  const taskWarnings = draftWarnings.filter((w: any) => String(w).toLowerCase().includes("task"));
  const pdfTaskHref = doc ? `/api/reference-documents/${doc.id}/file#page=4` : "";
  const lockConflict = rx.lockConflict;
  const [expandAll, setExpandAll] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);
  const readiness = (doc as any)?.readiness as string | undefined;

  const headerRows: Array<{ label: string; value: string; missing: boolean }> = [
    { label: "Qualification", value: header.qualification || "—", missing: !header.qualification },
    { label: "Unit code (Pearson)", value: header.unitCode || "—", missing: !header.unitCode },
    { label: "Assignment title", value: header.assignmentTitle || "—", missing: !header.assignmentTitle },
    { label: "Assignment number", value: header.assignment || "—", missing: !header.assignment },
    { label: "Academic year", value: header.academicYear || "—", missing: !header.academicYear },
    { label: "Issue date", value: header.issueDate || "—", missing: !header.issueDate },
    { label: "Final submission date", value: header.finalSubmissionDate || "—", missing: !header.finalSubmissionDate },
    { label: "Assessor", value: header.assessor || "—", missing: !header.assessor },
    { label: "Internal verifier", value: header.internalVerifier || "—", missing: !header.internalVerifier },
    { label: "Verification date", value: header.verificationDate || "—", missing: !header.verificationDate },
  ];
  const missingHeaderCount = headerRows.filter((row) => row.missing).length;
  const tasks = Array.isArray(draft?.tasks) ? draft.tasks : [];
  const taskWarningCount = tasks.reduce((sum: number, task: any) => sum + (task?.warnings?.length || 0), 0);
  const warningCount = draftWarnings.length + taskWarningCount;
  const endMatter = draft?.endMatter || null;
  const criteriaRefs = Array.isArray(draft?.criteriaRefs) ? draft.criteriaRefs : [];
  const detectedCriterionCodes = Array.isArray(draft?.detectedCriterionCodes) ? draft.detectedCriterionCodes : [];
  const loHeaders = Array.isArray(draft?.loHeaders) ? draft.loHeaders : [];
  const summaryTitle = draft?.title || doc?.title || doc?.originalFilename || "Brief extraction";
  const toggleExpandAll = (next: boolean) => {
    setExpandAll(next);
    setExpandSignal((prev) => prev + 1);
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm min-w-0 overflow-hidden">
      <div className="border-b border-zinc-200 p-4">
        <div className="text-sm font-semibold">Review</div>
        <div className="mt-1 text-xs text-zinc-600">
          BRIEF-only review: header fields + mapping + lock.
        </div>
      </div>

      {!doc ? (
        <div className="p-4 text-sm text-zinc-600">
          Select a BRIEF PDF from the inbox to review it.
        </div>
      ) : (
        <div className="p-4 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Type" value={doc.type} />
            <Meta
              label="Uploaded"
              value={new Date(doc.uploadedAt).toLocaleString()}
            />
            <Meta label="Status" value={doc.status} />
            <Meta
              label="Locked at"
              value={
                doc.lockedAt ? new Date(doc.lockedAt).toLocaleString() : ""
              }
            />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">Brief meaning (audit)</div>
            <div className="mt-1">
              Brief = assignment question paper + context. Spec = criteria universe. Locking fixes the brief-to-spec
              binding and IV record for defensible grading.
            </div>
          </div>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-zinc-600">Extraction summary</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 break-words">{summaryTitle}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                  <Pill cls={tone("ok")}>Status: {doc.status}</Pill>
                  <Pill cls={warningCount ? tone("warn") : tone("ok")}>{warningCount} warning(s)</Pill>
                  {readiness ? (
                    <Pill cls={readiness === "READY" ? tone("ok") : readiness === "BLOCKED" ? tone("bad") : tone("warn")}>
                      {readiness === "READY" ? "Ready" : "Needs review"}
                    </Pill>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canExtract}
                  onClick={rx.extractSelected}
                  className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
                >
                  Extract
                </button>

                <button
                  type="button"
                  disabled={!canExtract}
                  onClick={rx.reextractSelected}
                  className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
                >
                  Re-extract
                </button>

                <button
                  type="button"
                  disabled={!canLock}
                  onClick={rx.lockSelected}
                  className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
                >
                  Lock
                </button>

                <button
                  type="button"
                  disabled={!canUnlock}
                  onClick={rx.unlockSelectedDocument}
                  title={
                    usageLoading
                      ? "Checking usage…"
                      : usage?.inUse
                        ? "This brief has submissions attached and cannot be unlocked."
                        : !doc?.lockedAt
                          ? "Brief is not locked."
                          : ""
                  }
                  className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
                >
                  Unlock
                </button>

                <button
                  type="button"
                  disabled={!canDelete}
                  onClick={rx.deleteSelectedDocument}
                  title={
                    usageLoading
                      ? "Checking usage…"
                      : doc?.lockedAt
                        ? "Locked briefs cannot be deleted. Unlock first."
                        : usage?.inUse
                          ? "This brief has submissions attached and cannot be deleted."
                          : ""
                  }
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete
                </button>

                <a
                  href={`/api/reference-documents/${doc.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className={ui.btnSecondary}
                >
                  PDF preview
                </a>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-zinc-600">Header snapshot (audit)</div>
                <p className="mt-1 text-xs text-zinc-500">Read-only view of the brief cover fields, always visible.</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill cls={header ? tone("ok") : tone("warn")}>{header ? "Extracted" : "Missing"}</Pill>
                <Pill cls={missingHeaderCount ? tone("warn") : tone("ok")}>{missingHeaderCount} missing</Pill>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {headerRows.map((row) => (
                <div key={row.label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-600">
                    <span>{row.label}</span>
                    {row.missing ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Missing</span>
                    ) : null}
                  </div>
                  <div className="mt-1 break-words text-sm font-semibold text-zinc-900">{row.value || "—"}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              These are stored for audit. If the PDF changes next year, upload a new version and re-lock.
            </p>
          </section>

          {draftWarnings.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Extraction warnings</div>
              <ul className="mt-1 list-disc pl-5">
                {draftWarnings.map((w: string, i: number) => (
                  <li key={`${w}-${i}`}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {draft?.kind === "BRIEF" ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Tasks & questions</div>
                  <div className="mt-0.5 text-xs text-zinc-600">
                    Extracted from the brief — used later to check the student answered what was set.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                    {tasks.length} tasks
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExpandAll(true)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpandAll(false)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              {tasks.length ? (
                <div className="mt-3 grid gap-3">
                  {tasks.map((t: any, i: number) => (
                    <TaskCard
                      key={`task-${t?.id ?? ""}-${t?.n ?? ""}-${i}-${expandSignal}`}
                      task={t}
                      defaultExpanded={expandAll}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-semibold">No tasks detected</div>
                  <div className="mt-1">
                    {taskWarnings.length ? (
                      <span>{taskWarnings.join(" ")}</span>
                    ) : (
                      <span>Task headings not found (expected “Task 1”, “Task 2”, …).</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={pdfTaskHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      Open PDF at Task pages
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        rx.setShowRawJson?.(true);
                        document.getElementById("brief-raw-json")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-amber-200 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-300"
                    >
                      Manual override
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {draft?.kind === "BRIEF" ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Detected codes & anchors</div>
                  <div className="mt-0.5 text-xs text-zinc-600">
                    Criteria references, learning outcomes, and end-matter blocks for audit.
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-600">Detected criterion codes</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {detectedCriterionCodes.length ? (
                      detectedCriterionCodes.map((code: string) => (
                        <Pill key={`det-${code}`} cls="bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200">
                          {code}
                        </Pill>
                      ))
                    ) : (
                      <span className="text-zinc-500">None detected</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-600">Criteria refs</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {criteriaRefs.length ? (
                      criteriaRefs.map((code: string) => (
                        <Pill key={`ref-${code}`} cls="bg-violet-50 text-violet-900 ring-1 ring-violet-200">
                          {code}
                        </Pill>
                      ))
                    ) : (
                      <span className="text-zinc-500">None detected</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-600">Learning outcomes</div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-700">
                    {loHeaders.length ? (
                      loHeaders.map((lo: string, idx: number) => <div key={`lo-${idx}`}>{lo}</div>)
                    ) : (
                      <span className="text-zinc-500">None detected</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <details className="rounded-xl border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-700">End-matter: Sources block</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-700">
                    {endMatter?.sourcesBlock || "None detected"}
                  </pre>
                </details>
                <details className="rounded-xl border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-700">End-matter: Criteria block</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-700">
                    {endMatter?.criteriaBlock || "None detected"}
                  </pre>
                </details>
              </div>
            </section>
          ) : null}

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

          <div id="brief-raw-json" className="rounded-2xl border border-zinc-200 bg-white p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <input type="checkbox" checked={!!rx.showRawJson} onChange={(e) => rx.setShowRawJson?.(e.target.checked)} />
              Manual override (raw JSON)
            </label>
            <p className="mt-1 text-xs text-zinc-600">Use only when extraction misses structure. Overrides are logged at lock time.</p>
            {rx.showRawJson ? (
              <textarea
                value={rx.rawJson}
                onChange={(e) => rx.setRawJson?.(e.target.value)}
                className="mt-3 h-[240px] w-full rounded-xl border border-zinc-300 p-3 font-mono text-xs"
                placeholder="Paste adjusted JSON here before locking."
              />
            ) : (
              <pre className="mt-3 max-h-[240px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
                {JSON.stringify(draft, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {lockConflict ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-zinc-900">Brief already locked</div>
            <p className="mt-2 text-sm text-zinc-700">
              A brief for{" "}
              <span className="font-semibold">
                {lockConflict.unitCode ? `Unit ${lockConflict.unitCode}` : "this unit"}{" "}
                {lockConflict.assignmentCode ? lockConflict.assignmentCode : ""}
              </span>{" "}
              is already locked.
            </p>
            {lockConflict.existingTitle ? (
              <p className="mt-2 text-xs text-zinc-600">Existing brief: {lockConflict.existingTitle}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/admin/briefs/${lockConflict.existingBriefId}`)}
                className={ui.btnSecondary}
              >
                Open existing locked brief
              </button>
              <button
                type="button"
                onClick={rx.confirmLockOverwrite}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                Replace it (danger)
              </button>
              <button type="button" onClick={() => rx.setLockConflict(null)} className={ui.btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
