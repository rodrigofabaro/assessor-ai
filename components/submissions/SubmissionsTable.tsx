"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { isReadyToUpload } from "@/lib/submissionReady";
import type { SubmissionRow } from "@/lib/submissions/types";
import { deriveNextAction } from "@/lib/submissions/logic";
import { safeDate, cx } from "@/lib/submissions/utils";
import type { LaneGroup, LaneKey } from "@/lib/submissions/useSubmissionsList";
import { ActionPill, StatusPill } from "./Pills";

const LANE_TONES: Record<LaneKey, string> = {
  AUTO_READY: "border-emerald-200 bg-emerald-50",
  NEEDS_HUMAN: "border-sky-200 bg-sky-50",
  BLOCKED: "border-amber-200 bg-amber-50",
  COMPLETED: "border-zinc-200 bg-zinc-50",
};

export function SubmissionsTable({
  laneGroups,
  batchBusy,
  unlinkedOnly,
  onBatchGradeLane,
  onRetryFailedLane,
  onRunGradeSingle,
  onOpenResolve,
  onCopySummary,
  onDownloadMarkedFile,
  onBulkCopyFeedback,
  onBulkDownloadMarked,
  showColWorkflow,
  showColUploaded,
  showColGrade,
  showColAssignmentTitle,
  copiedKey,
}: {
  laneGroups: LaneGroup[];
  batchBusy: boolean;
  unlinkedOnly: boolean;
  onBatchGradeLane: (laneKey: LaneKey) => void;
  onRetryFailedLane: (laneKey: LaneKey) => void;
  onRunGradeSingle: (submissionId: string) => void;
  onOpenResolve: (submissionId: string) => void;
  onCopySummary: (s: SubmissionRow) => void;
  onDownloadMarkedFile: (s: SubmissionRow) => void;
  onBulkCopyFeedback: (rows: SubmissionRow[]) => void;
  onBulkDownloadMarked: (rows: SubmissionRow[]) => void;
  showColWorkflow: boolean;
  showColUploaded: boolean;
  showColGrade: boolean;
  showColAssignmentTitle: boolean;
  copiedKey: string | null;
}) {
  const [collapsed, setCollapsed] = useState<Record<LaneKey, boolean>>({
    AUTO_READY: false,
    NEEDS_HUMAN: false,
    BLOCKED: false,
    COMPLETED: false,
  });

  const failedByLane = useMemo(() => {
    const out = new Map<LaneKey, number>();
    for (const lane of laneGroups) {
      out.set(
        lane.key,
        lane.rows.filter((r) => String(r.status || "").toUpperCase() === "FAILED").length
      );
    }
    return out;
  }, [laneGroups]);

  const [selectedCompleted, setSelectedCompleted] = useState<Record<string, boolean>>({});

  function gradeTone(gradeRaw: string) {
    const g = String(gradeRaw || "").toUpperCase();
    if (g === "DISTINCTION") return "border-violet-200 bg-violet-50 text-violet-900";
    if (g === "MERIT") return "border-cyan-200 bg-cyan-50 text-cyan-900";
    if (g === "PASS") return "border-emerald-200 bg-emerald-50 text-emerald-900";
    if (g === "PASS_ON_RESUBMISSION") return "border-amber-200 bg-amber-50 text-amber-900";
    if (g === "REFER") return "border-rose-200 bg-rose-50 text-rose-900";
    return "border-zinc-200 bg-zinc-50 text-zinc-800";
  }

  const totalRows = laneGroups.reduce((acc, lane) => acc + lane.rows.length, 0);

  if (totalRows === 0) {
    return (
      <div className="px-4 py-10 text-sm text-zinc-600">
        {unlinkedOnly ? "No unlinked submissions." : "No submissions yet."}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {laneGroups.map((lane) => (
        <div key={lane.key} className={cx("overflow-hidden rounded-2xl border", LANE_TONES[lane.key])}>
          <div className="border-b border-black/5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{lane.label}</div>
                <div className="mt-0.5 text-xs text-zinc-700">{lane.description}</div>
              </div>
              <div className="flex items-center gap-2">
                {lane.key === "AUTO_READY" ? (
                  <button
                    type="button"
                    onClick={() => onBatchGradeLane(lane.key)}
                    disabled={batchBusy || lane.rows.length === 0}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-xs font-semibold",
                      batchBusy || lane.rows.length === 0
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                        : "bg-emerald-700 text-white hover:bg-emerald-800"
                    )}
                    title="Grade this lane"
                  >
                    Grade lane
                  </button>
                ) : null}
                {lane.key === "BLOCKED" ? (
                  <button
                    type="button"
                    onClick={() => onRetryFailedLane(lane.key)}
                    disabled={batchBusy || (failedByLane.get(lane.key) || 0) === 0}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-xs font-semibold",
                      batchBusy || (failedByLane.get(lane.key) || 0) === 0
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                        : "bg-amber-600 text-white hover:bg-amber-700"
                    )}
                    title="Retry failed rows in this lane"
                  >
                    Retry failed ({failedByLane.get(lane.key) || 0})
                  </button>
                ) : null}
                {lane.key === "COMPLETED" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const rows = lane.rows.filter((r) => selectedCompleted[r.id]);
                        onBulkCopyFeedback(rows);
                      }}
                      disabled={batchBusy || lane.rows.filter((r) => selectedCompleted[r.id]).length === 0}
                      className={cx(
                        "rounded-lg px-2.5 py-1 text-xs font-semibold",
                        batchBusy || lane.rows.filter((r) => selectedCompleted[r.id]).length === 0
                          ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                          : "bg-emerald-700 text-white hover:bg-emerald-800"
                      )}
                      title="Copy feedback for selected completed rows"
                    >
                      Bulk feedback
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const rows = lane.rows.filter((r) => selectedCompleted[r.id]);
                        onBulkDownloadMarked(rows);
                      }}
                      disabled={batchBusy || lane.rows.filter((r) => selectedCompleted[r.id]).length === 0}
                      className={cx(
                        "rounded-lg px-2.5 py-1 text-xs font-semibold",
                        batchBusy || lane.rows.filter((r) => selectedCompleted[r.id]).length === 0
                          ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                          : "bg-sky-700 text-white hover:bg-sky-800"
                      )}
                      title="Download marked PDFs for selected completed rows"
                    >
                      Bulk files
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [lane.key]: !prev[lane.key] }))
                  }
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  title={collapsed[lane.key] ? "Expand lane" : "Collapse lane"}
                >
                  {collapsed[lane.key] ? "Expand" : "Collapse"}
                </button>
                <div className="text-xs text-zinc-500">
                  {lane.rows.length} submission{lane.rows.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          </div>

          {collapsed[lane.key] ? (
            <div className="bg-white px-4 py-3 text-sm text-zinc-500">Lane collapsed.</div>
          ) : null}

          {!collapsed[lane.key] && lane.dayGroups.length === 0 ? (
            <div className="bg-white px-4 py-4 text-sm text-zinc-500">No rows in this lane.</div>
          ) : null}

          {!collapsed[lane.key] ? (
            <div className="overflow-x-auto bg-white">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs font-semibold text-zinc-700">
                    {lane.key === "COMPLETED" ? (
                      <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-3">Pick</th>
                    ) : null}
                    <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-3">Candidate & Assignment</th>
                    {showColGrade ? <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-3">Grade</th> : null}
                    {showColWorkflow ? <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-3">Workflow</th> : null}
                    {showColUploaded ? <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-3">{lane.key === "COMPLETED" ? "Completed" : "Uploaded"}</th> : null}
                    <th className="sticky right-0 top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lane.dayGroups.map(([day, rows]) => (
                    <Fragment key={`${lane.key}-${day}`}>
                      <tr key={`${lane.key}-${day}-header`}>
                        <td colSpan={2 + (lane.key === "COMPLETED" ? 1 : 0) + (showColGrade ? 1 : 0) + (showColWorkflow ? 1 : 0) + (showColUploaded ? 1 : 0)} className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          {day} · {rows.length} submission{rows.length === 1 ? "" : "s"}
                        </td>
                      </tr>
                      {rows.map((s) => {
                        const ready = isReadyToUpload(s);
                        const a = deriveNextAction(s);
                        const gradeLabel = String(s.grade || s.overallGrade || "—").toUpperCase();
                        return (
                          <tr key={s.id} className="text-sm transition hover:bg-zinc-50/70">
                            {lane.key === "COMPLETED" ? (
                              <td className="border-b border-zinc-100 px-4 py-3 align-top">
                                <input
                                  type="checkbox"
                                  checked={!!selectedCompleted[s.id]}
                                  onChange={(e) => setSelectedCompleted((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                                />
                              </td>
                            ) : null}
                            <td className="border-b border-zinc-100 px-4 py-3 align-top text-zinc-800">
                              {s.studentId && s.student?.fullName ? (
                                <Link className="font-medium underline underline-offset-4 hover:opacity-80" href={`/students/${s.studentId}`}>
                                  {s.student.fullName}
                                </Link>
                              ) : (
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                                  Unlinked student
                                </span>
                              )}
                              <div className="mt-1 text-xs text-zinc-600">
                                Unit: {String(s.assignment?.unitCode || "—")}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-600">
                                Assignment: {String(s.assignment?.assignmentRef || "—")}
                              </div>
                              {showColAssignmentTitle ? (
                                <div className="mt-1 text-xs text-zinc-600" title={s.assignment?.title || ""}>
                                  {s.assignment?.title || s.assignmentId || "No assignment linked"}
                                </div>
                              ) : null}
                            </td>

                            {showColGrade ? (
                              <td className="border-b border-zinc-100 px-4 py-3 align-top text-zinc-800">
                                <span className={cx("inline-flex rounded-full border px-2 py-1 text-xs font-semibold", gradeTone(gradeLabel))}>
                                  {gradeLabel}
                                </span>
                              </td>
                            ) : null}

                            {showColWorkflow ? (
                              <td className="border-b border-zinc-100 px-4 py-3 align-top">
                                {lane.key === "COMPLETED" ? (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <StatusPill>{s.status}</StatusPill>
                                      <ActionPill tone="ok">Completed</ActionPill>
                                      {s.qaFlags?.shouldReview ? <ActionPill tone="warn">QA review</ActionPill> : null}
                                    </div>
                                    {s.qaFlags?.shouldReview ? (
                                      <div className="mt-1 text-xs text-amber-700">
                                        QA: {s.qaFlags.reasons.join(" · ")}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <StatusPill>{s.status}</StatusPill>
                                      <ActionPill tone={a.tone}>{a.label}</ActionPill>
                                      {s.extractionMode ? (
                                        <span className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-700">
                                          {s.extractionMode}
                                        </span>
                                      ) : null}
                                      {s.coverReady ? (
                                        <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700">
                                          COVER_READY
                                        </span>
                                      ) : null}
                                      {typeof s.extractionQuality?.score === "number" ? (
                                        <span className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-700">
                                          Q{Math.round(s.extractionQuality.score)} · {s.extractionQuality.band}
                                        </span>
                                      ) : null}
                                      {s.automationExceptionCode ? (
                                        <span className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-700">
                                          {s.automationExceptionCode}
                                        </span>
                                      ) : null}
                                      {s.qaFlags?.shouldReview ? (
                                        <span
                                          className="inline-flex rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-rose-800"
                                          title={s.qaFlags.reasons.join(" · ")}
                                        >
                                          QA REVIEW
                                        </span>
                                      ) : null}
                                      {Number.isFinite(Number(s.turnitin?.aiWritingPercentage)) ? (
                                        <span
                                          className="inline-flex rounded-md border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-fuchsia-800"
                                          title="Turnitin AI-writing indicator"
                                        >
                                          AI {Number(s.turnitin?.aiWritingPercentage)}%
                                        </span>
                                      ) : String(s.turnitin?.turnitinSubmissionId || "").trim() ? (
                                        <span className="inline-flex rounded-md border border-fuchsia-100 bg-fuchsia-50/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-fuchsia-700">
                                          AI pending
                                        </span>
                                      ) : null}
                                    </div>
                                    {s.automationReason ? <div className="mt-1 text-xs text-zinc-500">{s.automationReason}</div> : null}
                                    {s.qaFlags?.shouldReview ? (
                                      <div className="mt-1 text-xs text-rose-700">
                                        QA: {s.qaFlags.reasons.join(" · ")}
                                      </div>
                                    ) : null}
                                    {s.automationRecommendedAction ? (
                                      <div className="mt-1 text-xs text-zinc-700">Recommended: {s.automationRecommendedAction}</div>
                                    ) : null}
                                  </>
                                )}
                              </td>
                            ) : null}

                            {showColUploaded ? (
                              <td className="border-b border-zinc-100 px-4 py-3 align-top text-zinc-700">
                                <div>{safeDate(lane.key === "COMPLETED" ? (s.gradedAt || s.updatedAt || s.uploadedAt) : s.uploadedAt)}</div>
                                <div className="mt-1 text-xs text-zinc-500">
                                  {lane.key === "COMPLETED"
                                    ? `Assessor: ${String((s as any)?.assessmentActor || "—")}`
                                    : `${s._count?.extractionRuns ?? 0} extraction run${(s._count?.extractionRuns ?? 0) === 1 ? "" : "s"} · ${s._count?.assessments ?? 0} assessment${(s._count?.assessments ?? 0) === 1 ? "" : "s"}`}
                                </div>
                              </td>
                            ) : null}

                            <td className="sticky right-0 border-b border-zinc-100 bg-white px-4 py-3 align-top">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/submissions/${s.id}`}
                                  className="inline-flex h-9 min-w-[96px] items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                                  title="Open submission"
                                >
                                  Open record
                                </Link>

                                {lane.key === "AUTO_READY" ? (
                                  <button
                                    type="button"
                                    onClick={() => onRunGradeSingle(s.id)}
                                    disabled={batchBusy}
                                    className={cx(
                                      "inline-flex h-9 min-w-[96px] items-center justify-center rounded-lg border px-3 text-xs font-semibold",
                                      batchBusy
                                        ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                                    )}
                                    title="Run grading for this submission"
                                  >
                                    Run grading
                                  </button>
                                ) : null}

                                {ready ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => onCopySummary(s)}
                                      className={cx(
                                        "inline-flex h-9 min-w-[96px] items-center justify-center rounded-lg border px-3 text-xs font-semibold",
                                        copiedKey === `summary-${s.id}`
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                          : "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"
                                      )}
                                      title="Copy overall feedback for Totara"
                                    >
                                      {copiedKey === `summary-${s.id}` ? "Copied ✓" : "Feedback"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDownloadMarkedFile(s)}
                                      className={cx(
                                        "inline-flex h-9 min-w-[96px] items-center justify-center rounded-lg border px-3 text-xs font-semibold",
                                        copiedKey === `file-${s.id}`
                                          ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                                          : "border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-50"
                                      )}
                                      title="Download marked PDF"
                                    >
                                      {copiedKey === `file-${s.id}` ? "Done ✓" : "File"}
                                    </button>
                                  </>
                                ) : null}

                                {!s.studentId ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenResolve(s.id)}
                                    className="inline-flex h-9 min-w-[96px] items-center justify-center rounded-lg border border-amber-300 bg-amber-100 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                                    title="Resolve student"
                                  >
                                    Resolve student
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
