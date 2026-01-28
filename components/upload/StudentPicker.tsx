"use client";

import { useMemo } from "react";
import type { Student } from "@/lib/upload/types";
import { filterStudents, pickByEnter } from "@/lib/upload/search";

export function StudentPicker({
  students,
  studentId,
  setStudentId,
  studentQuery,
  setStudentQuery,
  onAddStudent,
}: {
  students: Student[];
  studentId: string;
  setStudentId: (v: string) => void;
  studentQuery: string;
  setStudentQuery: (v: string) => void;
  onAddStudent: () => void;
}) {
  const filtered = useMemo(() => filterStudents(students, studentQuery), [students, studentQuery]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();

    const chosen = pickByEnter(filtered, studentQuery, (s) => [s.fullName, s.email ?? "", s.externalRef ?? ""]);
    if (!chosen) return;

    setStudentId(chosen.id);
    setStudentQuery(chosen.fullName);
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" htmlFor="student">
          Student <span className="text-xs font-normal text-zinc-500">(optional)</span>
        </label>
        <button
          type="button"
          onClick={onAddStudent}
          className="text-xs font-medium text-blue-700 hover:underline"
        >
          + Add student
        </button>
      </div>

      <div className="grid gap-2">
        <input
          value={studentQuery}
          onChange={(e) => setStudentQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search student… (name, ref, email)"
          className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
        />
        <div className="text-[11px] text-zinc-500">
          Tip: type to filter, then press Enter to select (exact match preferred; otherwise selects when only one match remains).
        </div>
      </div>

      <select
        id="student"
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
      >
        <option value="">Auto (from cover page) / Unassigned</option>

        {filtered.length === 0 ? (
          <option value="" disabled>
            No matching students
          </option>
        ) : (
          filtered.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
              {s.externalRef ? ` (${s.externalRef})` : ""}
              {s.email ? ` — ${s.email}` : ""}
            </option>
          ))
        )}
      </select>

      <p className="text-xs text-zinc-500">
        You can upload first and assign later. Selecting a student here helps reporting and reduces manual linking.
      </p>
    </div>
  );
}
