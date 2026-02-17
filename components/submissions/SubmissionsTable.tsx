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
  onOpenResolve,
  onCopySummary,
  copiedId,
}: {
  laneGroups: LaneGroup[];
  batchBusy: boolean;
  unlinkedOnly: boolean;
  onBatchGradeLane: (laneKey: LaneKey) => void;
  onRetryFailedLane: (laneKey: LaneKey) => void;
  onOpenResolve: (submissionId: string) => void;
  onCopySummary: (s: SubmissionRow) => void;
  copiedId: string | null;
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
                    <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Submission</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Candidate & Assignment</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Workflow</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Uploaded</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lane.dayGroups.map(([day, rows]) => (
                    <Fragment key={`${lane.key}-${day}`}>
                      <tr key={`${lane.key}-${day}-header`}>
                        <td colSpan={5} className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          {day} · {rows.length} submission{rows.length === 1 ? "" : "s"}
                        </td>
                      </tr>
                      {rows.map((s) => {
                        const ready = isReadyToUpload(s);
                        const a = deriveNextAction(s);
                        return (
                          <tr key={s.id} className="text-sm transition hover:bg-zinc-50/70">
                            <td className="border-b border-zinc-100 px-4 py-3 align-top">
                              <Link className="font-medium text-zinc-900 underline underline-offset-4 hover:opacity-80" href={`/submissions/${s.id}`}>
                                {s.filename}
                              </Link>
                              <div className="mt-1 font-mono text-[11px] text-zinc-500">{s.id.slice(0, 8)}</div>
                            </td>

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
                              <div className="mt-1 text-xs text-zinc-600">{s.assignment?.title || s.assignmentId || "No assignment linked"}</div>
                            </td>

                            <td className="border-b border-zinc-100 px-4 py-3 align-top">
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
                              </div>
                              {s.automationReason ? <div className="mt-1 text-xs text-zinc-500">{s.automationReason}</div> : null}
                              {s.automationRecommendedAction ? (
                                <div className="mt-1 text-xs text-zinc-700">Recommended: {s.automationRecommendedAction}</div>
                              ) : null}
                            </td>

                            <td className="border-b border-zinc-100 px-4 py-3 align-top text-zinc-700">
                              <div>{safeDate(s.uploadedAt)}</div>
                              <div className="mt-1 text-xs text-zinc-500">
                                {s._count?.extractionRuns ?? 0} extraction run{(s._count?.extractionRuns ?? 0) === 1 ? "" : "s"} ·{" "}
                                {s._count?.assessments ?? 0} assessment{(s._count?.assessments ?? 0) === 1 ? "" : "s"}
                              </div>
                            </td>

                            <td className="border-b border-zinc-100 px-4 py-3 align-top">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/submissions/${s.id}`}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                                  title="Open submission"
                                >
                                  Open
                                </Link>

                                {ready ? (
                                  <button
                                    type="button"
                                    onClick={() => onCopySummary(s)}
                                    className={cx(
                                      "rounded-xl border px-3 py-2 text-sm font-semibold",
                                      copiedId === s.id
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                                    )}
                                    title="Copy summary (Totara notes)"
                                  >
                                    {copiedId === s.id ? "Copied ✓" : "Copy summary"}
                                  </button>
                                ) : null}

                                {!s.studentId ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenResolve(s.id)}
                                    className="rounded-xl border border-zinc-200 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                                    title="Resolve student"
                                  >
                                    Resolve
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
