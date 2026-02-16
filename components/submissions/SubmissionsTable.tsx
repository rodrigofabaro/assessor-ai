"use client";

import Link from "next/link";
import { isReadyToUpload } from "@/lib/submissionReady";
import type { SubmissionRow } from "@/lib/submissions/types";
import { deriveNextAction } from "@/lib/submissions/logic";
import { safeDate, cx } from "@/lib/submissions/utils";
import type { LaneGroup } from "@/lib/submissions/useSubmissionsList";
import { ActionPill, StatusPill } from "./Pills";

export function SubmissionsTable({
  laneGroups,
  unlinkedOnly,
  onOpenResolve,
  onCopySummary,
  copiedId,
}: {
  laneGroups: LaneGroup[];
  unlinkedOnly: boolean;
  onOpenResolve: (submissionId: string) => void;
  onCopySummary: (s: SubmissionRow) => void;
  copiedId: string | null;
}) {
  const totalRows = laneGroups.reduce((acc, lane) => acc + lane.rows.length, 0);

  if (totalRows === 0) {
    return (
      <div className="px-4 py-10 text-sm text-zinc-600">
        {unlinkedOnly ? "No unlinked submissions." : "No submissions yet."}
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-200">
      {laneGroups.map((lane) => (
        <div key={lane.key}>
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">{lane.label}</div>
              <div className="text-xs text-zinc-500">
                {lane.rows.length} submission{lane.rows.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="mt-1 text-xs text-zinc-600">{lane.description}</div>
          </div>

          {lane.dayGroups.length === 0 ? (
            <div className="px-4 py-4 text-sm text-zinc-500">No rows in this lane.</div>
          ) : null}

          {lane.dayGroups.map(([day, rows]) => (
            <div key={`${lane.key}-${day}`}>
              <div className="flex items-center justify-between gap-3 bg-white px-4 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{day}</div>
                <div className="text-xs text-zinc-500">
                  {rows.length} submission{rows.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-zinc-700">
                      <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">File</th>
                      <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Student</th>
                      <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Assignment</th>
                      <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Status</th>
                      <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Next action</th>
                      <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Uploaded</th>
                      <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => {
                      const ready = isReadyToUpload(s);

                      return (
                        <tr key={s.id} className="text-sm transition hover:bg-zinc-50/70">
                          <td className="border-b border-zinc-100 px-4 py-3 font-medium text-zinc-900">
                            <Link className="underline underline-offset-4 hover:opacity-80" href={`/submissions/${s.id}`}>
                              {s.filename}
                            </Link>
                          </td>

                          <td className="border-b border-zinc-100 px-4 py-3 text-zinc-800">
                            {s.studentId && s.student?.fullName ? (
                              <Link className="underline underline-offset-4 hover:opacity-80" href={`/students/${s.studentId}`}>
                                {s.student.fullName}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                                  Unlinked
                                </span>
                              </span>
                            )}
                          </td>

                          <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">
                            {s.assignment?.title || s.assignmentId || "—"}
                          </td>

                          <td className="border-b border-zinc-100 px-4 py-3">
                            <StatusPill>{s.status}</StatusPill>
                          </td>

                          <td className="border-b border-zinc-100 px-4 py-3">
                            {(() => {
                              const a = deriveNextAction(s);
                              return <ActionPill tone={a.tone}>{a.label}</ActionPill>;
                            })()}
                          </td>

                          <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{safeDate(s.uploadedAt)}</td>

                          <td className="border-b border-zinc-100 px-4 py-3">
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
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
