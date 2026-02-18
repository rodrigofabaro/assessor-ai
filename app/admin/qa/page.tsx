"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const GRADE_BANDS = ["REFER", "PASS", "PASS_ON_RESUBMISSION", "MERIT", "DISTINCTION"] as const;
type GradeBand = (typeof GRADE_BANDS)[number];

type SubmissionResearchRow = {
  id: string;
  filename: string;
  uploadedAt?: string | null;
  gradedAt?: string | null;
  status?: string | null;
  grade?: string | null;
  student?: {
    id?: string | null;
    fullName?: string | null;
    email?: string | null;
    courseName?: string | null;
  } | null;
  assignment?: {
    unitCode?: string | null;
    assignmentRef?: string | null;
    title?: string | null;
  } | null;
};

function asGradeBand(v: unknown): GradeBand | null {
  const up = String(v || "").trim().toUpperCase();
  return (GRADE_BANDS as readonly string[]).includes(up) ? (up as GradeBand) : null;
}

function gradePoints(grade: GradeBand | null) {
  if (!grade) return 0;
  if (grade === "DISTINCTION") return 5;
  if (grade === "MERIT") return 4;
  if (grade === "PASS") return 3;
  if (grade === "PASS_ON_RESUBMISSION") return 2;
  return 1;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminQaPage() {
  const [rows, setRows] = useState<SubmissionResearchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("ALL");
  const [unit, setUnit] = useState("ALL");
  const [assignment, setAssignment] = useState("ALL");
  const [grade, setGrade] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [compareUnit, setCompareUnit] = useState("ALL");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/submissions", { cache: "no-store" });
      const json = (await res.json()) as SubmissionResearchRow[] & { error?: string };
      if (!res.ok) throw new Error((json as any)?.error || `Submissions fetch failed (${res.status})`);
      setRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || "Failed to load QA dataset.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const optionList = useMemo(() => {
    const courses = new Set<string>();
    const units = new Set<string>();
    const assignments = new Set<string>();
    const statuses = new Set<string>();
    for (const r of rows) {
      if (r.student?.courseName) courses.add(r.student.courseName);
      if (r.assignment?.unitCode) units.add(r.assignment.unitCode);
      if (r.assignment?.assignmentRef) assignments.add(r.assignment.assignmentRef);
      if (r.status) statuses.add(r.status);
    }
    return {
      courses: ["ALL", ...Array.from(courses).sort((a, b) => a.localeCompare(b))],
      units: ["ALL", ...Array.from(units).sort((a, b) => a.localeCompare(b))],
      assignments: ["ALL", ...Array.from(assignments).sort((a, b) => a.localeCompare(b))],
      statuses: ["ALL", ...Array.from(statuses).sort((a, b) => a.localeCompare(b))],
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const g = asGradeBand(r.grade);
      if (course !== "ALL" && String(r.student?.courseName || "") !== course) return false;
      if (unit !== "ALL" && String(r.assignment?.unitCode || "") !== unit) return false;
      if (assignment !== "ALL" && String(r.assignment?.assignmentRef || "") !== assignment) return false;
      if (grade !== "ALL" && String(g || "UNGRADED") !== grade) return false;
      if (status !== "ALL" && String(r.status || "") !== status) return false;
      if (!needle) return true;
      const hay = [
        r.filename,
        r.student?.fullName,
        r.student?.email,
        r.student?.courseName,
        r.assignment?.unitCode,
        r.assignment?.assignmentRef,
        r.assignment?.title,
        r.grade,
        r.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, course, unit, assignment, grade, status]);

  const metrics = useMemo(() => {
    const graded = filtered.filter((r) => !!asGradeBand(r.grade));
    const points = graded.reduce((acc, r) => acc + gradePoints(asGradeBand(r.grade)), 0);
    const byGrade: Record<string, number> = {
      REFER: 0,
      PASS: 0,
      PASS_ON_RESUBMISSION: 0,
      MERIT: 0,
      DISTINCTION: 0,
      UNGRADED: 0,
    };
    for (const r of filtered) byGrade[asGradeBand(r.grade) || "UNGRADED"] += 1;
    return {
      total: filtered.length,
      graded: graded.length,
      avgScore: graded.length ? points / graded.length : 0,
      students: new Set(filtered.map((r) => r.student?.id).filter(Boolean)).size,
      units: new Set(filtered.map((r) => r.assignment?.unitCode).filter(Boolean)).size,
      courses: new Set(filtered.map((r) => r.student?.courseName).filter(Boolean)).size,
      byGrade,
    };
  }, [filtered]);

  const byCourse = useMemo(() => {
    const map = new Map<string, { total: number; graded: number; points: number }>();
    for (const r of filtered) {
      const key = String(r.student?.courseName || "Unassigned");
      const row = map.get(key) || { total: 0, graded: 0, points: 0 };
      row.total += 1;
      const g = asGradeBand(r.grade);
      if (g) {
        row.graded += 1;
        row.points += gradePoints(g);
      }
      map.set(key, row);
    }
    return Array.from(map.entries())
      .map(([courseName, row]) => ({ courseName, ...row, avg: row.graded ? row.points / row.graded : 0 }))
      .sort((a, b) => b.total - a.total || a.courseName.localeCompare(b.courseName));
  }, [filtered]);

  const compareRows = useMemo(() => {
    const source = compareUnit === "ALL" ? filtered : filtered.filter((r) => r.assignment?.unitCode === compareUnit);
    const map = new Map<string, { total: number; grades: Record<string, number> }>();
    for (const r of source) {
      const key = String(r.assignment?.assignmentRef || "Unknown");
      const row = map.get(key) || {
        total: 0,
        grades: { REFER: 0, PASS: 0, PASS_ON_RESUBMISSION: 0, MERIT: 0, DISTINCTION: 0 },
      };
      row.total += 1;
      const g = asGradeBand(r.grade);
      if (g) row.grades[g] += 1;
      map.set(key, row);
    }
    return Array.from(map.entries())
      .map(([assignmentRef, row]) => ({ assignmentRef, ...row }))
      .sort((a, b) => a.assignmentRef.localeCompare(b.assignmentRef));
  }, [filtered, compareUnit]);

  function exportFiltered() {
    downloadCsv(
      "qa-filtered-submissions.csv",
      ["Submission ID", "Filename", "Student", "Course", "Unit", "AB", "Status", "Grade", "Uploaded", "Graded"],
      filtered.map((r) => [
        r.id,
        r.filename || "",
        r.student?.fullName || "",
        r.student?.courseName || "",
        r.assignment?.unitCode || "",
        r.assignment?.assignmentRef || "",
        r.status || "",
        r.grade || "",
        r.uploadedAt || "",
        r.gradedAt || "",
      ])
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">QA Research</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Query students, courses, AB numbers, grade spread by course, and compare grade outcomes within the same unit.
            </p>
          </div>
          <div className="text-xs text-zinc-600">{busy ? "Loading..." : "Ready"}</div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-7">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, course, unit, AB, filename..." className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
          <select value={course} onChange={(e) => setCourse(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.courses.map((v) => <option key={v} value={v}>Course: {v}</option>)}</select>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.units.map((v) => <option key={v} value={v}>Unit: {v}</option>)}</select>
          <select value={assignment} onChange={(e) => setAssignment(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.assignments.map((v) => <option key={v} value={v}>AB: {v}</option>)}</select>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{["ALL", ...GRADE_BANDS, "UNGRADED"].map((v) => <option key={v} value={v}>Grade: {v}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.statuses.map((v) => <option key={v} value={v}>Status: {v}</option>)}</select>
          <button type="button" onClick={load} className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">Refresh</button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Filtered submissions" value={metrics.total} />
          <MetricCard label="Graded" value={metrics.graded} />
          <MetricCard label="Students" value={metrics.students} />
          <MetricCard label="Courses" value={metrics.courses} />
          <MetricCard label="Units" value={metrics.units} />
          <MetricCard label="Avg score" value={metrics.avgScore.toFixed(2)} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {Object.entries(metrics.byGrade).map(([g, n]) => (
            <span key={g} className="inline-flex rounded-full border border-zinc-200 bg-white px-2 py-1 font-semibold text-zinc-700">
              {g}: {n}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportFiltered} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
            Export filtered report
          </button>
          <Link href="/admin/audit" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
            Open audit log
          </Link>
        </div>
      </section>

      {error ? <section className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</section> : null}

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">Submission QA dataset</div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold text-zinc-700">
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Student</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Course</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Unit</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">AB</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Grade</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Status</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Uploaded</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Graded</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-600">No submissions found for this filter.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="text-sm">
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-900">
                      <div className="font-medium">{r.student?.fullName || "Unlinked"}</div>
                      <div className="text-xs text-zinc-600">{r.filename}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.student?.courseName || "—"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.assignment?.unitCode || "—"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.assignment?.assignmentRef || "—"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.grade || "UNGRADED"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.status || "—"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{fmtDate(r.uploadedAt)}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{fmtDate(r.gradedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">Grades by course</div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs font-semibold text-zinc-700">
                  <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Course</th>
                  <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Total</th>
                  <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Graded</th>
                  <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Avg</th>
                </tr>
              </thead>
              <tbody>
                {byCourse.map((r) => (
                  <tr key={r.courseName} className="text-sm">
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-900">{r.courseName}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.total}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.graded}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.avg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-900">Compare grades within same unit</div>
            <select value={compareUnit} onChange={(e) => setCompareUnit(e.target.value)} className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm">
              {optionList.units.map((u) => (
                <option key={u} value={u}>Unit: {u}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs font-semibold text-zinc-700">
                  <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">AB</th>
                  <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Total</th>
                  {GRADE_BANDS.map((g) => (
                    <th key={g} className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">{g}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.assignmentRef} className="text-sm">
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-900">{r.assignmentRef}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.total}</td>
                    {GRADE_BANDS.map((g) => (
                      <td key={g} className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{r.grades[g]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

