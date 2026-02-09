"use client";

import { useMemo } from "react";
import type { Assignment } from "@/lib/upload/types";
import { filterAssignments, pickByEnter } from "@/lib/upload/search";

export function AssignmentPicker({
  assignments,
  assignmentId,
  setAssignmentId,
  assignmentQuery,
  setAssignmentQuery,
}: {
  assignments: Assignment[];
  assignmentId: string;
  setAssignmentId: (v: string) => void;
  assignmentQuery: string;
  setAssignmentQuery: (v: string) => void;
}) {
  const filtered = useMemo(() => filterAssignments(assignments, assignmentQuery), [assignments, assignmentQuery]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();

    const chosen = pickByEnter(filtered, assignmentQuery, [
  (a) => a.unitCode,
  (a) => a.assignmentRef ?? "",
  (a) => a.title,
]);

    if (!chosen) return;

    setAssignmentId(chosen.id);
    setAssignmentQuery(`${chosen.unitCode} ${chosen.assignmentRef ?? ""}`.trim());
  }

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor="assignment">
        Assignment <span className="text-xs font-normal text-zinc-500">(optional)</span>
      </label>

      <input
        value={assignmentQuery}
        onChange={(e) => setAssignmentQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search assignment… (unit code, A1, title)"
        className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
      />

      <select
        id="assignment"
        value={assignmentId}
        onChange={(e) => setAssignmentId(e.target.value)}
        className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
      >
        <option value="">Auto (from cover page) / Unassigned</option>

        {filtered.length === 0 ? (
          <option value="" disabled>
            No matching assignments
          </option>
        ) : (
          filtered.map((a) => (
            <option key={a.id} value={a.id}>
              {a.unitCode} {a.assignmentRef ? a.assignmentRef : ""} — {a.title}
            </option>
          ))
        )}
      </select>

      <p className="text-xs text-zinc-500">If left unassigned, you’ll confirm it later before grading (audit-safe).</p>
    </div>
  );
}
