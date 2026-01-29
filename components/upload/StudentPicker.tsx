"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Student } from "@/lib/upload/types";
import { filterStudents, pickStudentOnEnter } from "@/lib/upload/search";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  students: Student[];
  studentId: string;
  setStudentId: (v: string) => void;
  studentQuery: string;
  setStudentQuery: (v: string) => void;
  onAddStudent: () => void;
};

/**
 * Combobox-style picker:
 * - As you type, a suggestion list appears (no need to open a <select>).
 * - Matches by first name OR surname prefix.
 * - Enter selects only when unambiguous (single result or exact match).
 * - Click selects instantly.
 */
export function StudentPicker({
  students,
  studentId,
  setStudentId,
  studentQuery,
  setStudentQuery,
  onAddStudent,
}: Props) {
  const filtered = useMemo(() => filterStudents(students, studentQuery), [students, studentQuery]);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep suggestion list open while typing
  useEffect(() => {
    if (!studentQuery.trim()) {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    setOpen(true);
    setActiveIndex(0);
  }, [studentQuery]);

  // Close on outside click
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target && el.contains(e.target as Node)) return;
      setOpen(false);
      setActiveIndex(-1);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function pick(s: Student) {
    setStudentId(s.id);
    setStudentQuery(s.fullName || "");
    setOpen(false);
    setActiveIndex(-1);
    // keep focus for fast keyboard workflows
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min((filtered?.length ?? 0) - 1, (i < 0 ? 0 : i + 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();

      // If a suggestion is highlighted, choose it.
      if (open && activeIndex >= 0 && activeIndex < filtered.length) {
        pick(filtered[activeIndex]);
        return;
      }

      // Otherwise, use safe "unambiguous" selection rule.
      const chosen = pickStudentOnEnter(filtered, studentQuery);
      if (chosen) pick(chosen);
    }
  }

  const top = open ? filtered.slice(0, 8) : [];

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" htmlFor="studentQuery">
          Student <span className="text-xs font-normal text-zinc-500">(optional)</span>
        </label>
        <button type="button" onClick={onAddStudent} className="text-xs font-medium text-blue-700 hover:underline">
          + Add student
        </button>
      </div>

      <div ref={wrapRef} className="relative grid gap-2">
        <input
          id="studentQuery"
          ref={inputRef}
          value={studentQuery}
          onChange={(e) => setStudentQuery(e.target.value)}
          onFocus={() => studentQuery.trim() && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Type first name or surname… (or AB/email)"
          className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
          autoComplete="off"
        />

        <div className="text-[11px] text-zinc-500">
          Start typing and suggestions will appear. Surname works too (prefix matching).
        </div>

        {open && studentQuery.trim() ? (
          <div className="absolute top-[76px] z-20 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
            {top.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-600">No matching students.</div>
            ) : (
              <ul className="max-h-64 overflow-auto py-1">
                {top.map((s, idx) => {
                  const course = (s as unknown as { courseName?: string | null }).courseName ?? null;
                  const meta = [s.externalRef, s.email, course].filter(Boolean).join(" · ");
                  const active = idx === activeIndex;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => pick(s)}
                        className={cx(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left",
                          active ? "bg-zinc-100" : "hover:bg-zinc-50"
                        )}
                      >
                        <span className="text-sm font-semibold text-zinc-900">{s.fullName || "—"}</span>
                        <span className="text-xs text-zinc-600">{meta || "—"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {/* Keep the old select as a fallback / accessibility option */}
      <select
        value={studentId}
        onChange={(e) => {
          const v = e.target.value;
          setStudentId(v);
          const picked = students.find((s) => s.id === v);
          if (picked) setStudentQuery(picked.fullName || "");
        }}
        className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
        aria-label="Student dropdown"
      >
        <option value="">Auto (from cover page) / Unassigned</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.fullName}
            {s.externalRef ? ` (${s.externalRef})` : ""}
            {s.email ? ` — ${s.email}` : ""}
            {(s as unknown as { courseName?: string | null }).courseName ? ` — ${(s as unknown as { courseName?: string | null }).courseName}` : ""}
          </option>
        ))}
      </select>

      <p className="text-xs text-zinc-500">
        This is a combobox: it shows suggestions immediately, so you don’t have to open the dropdown to see matches.
      </p>
    </div>
  );
}
