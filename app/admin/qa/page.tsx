"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TinyIcon } from "@/components/ui/TinyIcon";

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
  qaFlags?: {
    shouldReview?: boolean;
    reasons?: string[];
    metrics?: {
      decisionChangedCount?: number;
      decisionStricterCount?: number;
      decisionLenientCount?: number;
    };
    overrideSummary?: {
      count?: number;
      reasonCodes?: string[];
      criteriaCodes?: string[];
    };
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
      const res = await fetch("/api/submissions?view=qa&qa=1&includeFeedback=0", { cache: "no-store" });
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

  const overrideInsights = useMemo(() => {
    const reasonCounts = new Map<string, number>();
    const criterionCounts = new Map<string, number>();
    const briefCounts = new Map<string, number>();
    let runsWithOverrides = 0;
    let totalOverrides = 0;

    for (const r of filtered) {
      const summary = r.qaFlags?.overrideSummary;
      const count = Math.max(0, Number(summary?.count || 0));
      if (count <= 0) continue;
      runsWithOverrides += 1;
      totalOverrides += count;

      const reasonCodes = Array.isArray(summary?.reasonCodes) ? summary.reasonCodes : [];
      for (const code of reasonCodes) {
        const key = String(code || "").trim().toUpperCase();
        if (!key) continue;
        reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
      }

      const criteriaCodes = Array.isArray(summary?.criteriaCodes) ? summary.criteriaCodes : [];
      for (const code of criteriaCodes) {
        const key = String(code || "").trim().toUpperCase();
        if (!key) continue;
        criterionCounts.set(key, (criterionCounts.get(key) || 0) + 1);
      }

      const unitCode = String(r.assignment?.unitCode || "Unknown").trim();
      const assignmentRef = String(r.assignment?.assignmentRef || "Unknown").trim();
      const briefKey = `${unitCode} ${assignmentRef}`.trim();
      briefCounts.set(briefKey, (briefCounts.get(briefKey) || 0) + count);
    }

    const byCountDesc = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
    return {
      runsWithOverrides,
      totalOverrides,
      topReasons: Array.from(reasonCounts.entries()).sort(byCountDesc).slice(0, 8),
      topCriteria: Array.from(criterionCounts.entries()).sort(byCountDesc).slice(0, 8),
      topBriefs: Array.from(briefCounts.entries()).sort(byCountDesc).slice(0, 8),
    };
  }, [filtered]);

  function exportFiltered() {
    downloadCsv(
      "qa-filtered-submissions.csv",
      ["Submission ID", "Filename", "Student", "Course", "Unit", "AB", "Status", "Grade", "Uploaded", "Graded", "QA Review Reasons"],
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
        Array.isArray(r.qaFlags?.reasons) ? r.qaFlags!.reasons!.join(" | ") : "",
      ])
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900">
              <TinyIcon name="qa" />
              QA Analytics
            </div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900">QA Research</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Query students, courses, AB numbers, grade spread by course, and compare grade outcomes within the same unit.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
            <TinyIcon name="status" className="mr-1 h-3 w-3" />
            {busy ? "Loading..." : "Ready"}
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-7">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, course, unit, AB, filename..." className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
          <select value={course} onChange={(e) => setCourse(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.courses.map((v) => <option key={v} value={v}>Course: {v}</option>)}</select>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.units.map((v) => <option key={v} value={v}>Unit: {v}</option>)}</select>
          <select value={assignment} onChange={(e) => setAssignment(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.assignments.map((v) => <option key={v} value={v}>AB: {v}</option>)}</select>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{["ALL", ...GRADE_BANDS, "UNGRADED"].map((v) => <option key={v} value={v}>Grade: {v}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">{optionList.statuses.map((v) => <option key={v} value={v}>Status: {v}</option>)}</select>
          <button type="button" onClick={load} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800"><TinyIcon name="refresh" className="h-3.5 w-3.5" />Refresh</button>
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
          <button type="button" onClick={exportFiltered} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
            <TinyIcon name="submissions" className="h-3 w-3" />
            Export filtered report
          </button>
          <Link href="/admin/audit" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
            <TinyIcon name="audit" className="h-3 w-3" />
            Open audit log
          </Link>
        </div>
      </section>

      {error ? <section className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</section> : null}

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900">Assessor Override Breakdown</div>
          <div className="mt-1 text-xs text-zinc-600">
            Runs with overrides: <span className="font-semibold text-zinc-900">{overrideInsights.runsWithOverrides}</span> ·
            Total overridden criteria: <span className="font-semibold text-zinc-900"> {overrideInsights.totalOverrides}</span>
          </div>
        </div>
        <div className="grid gap-3 p-3 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Top Reason Codes</div>
            <div className="mt-2 space-y-1">
              {overrideInsights.topReasons.length ? (
                overrideInsights.topReasons.map(([code, count]) => (
                  <div key={`or-${code}`} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-800">{code}</span>
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">{count}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500">No override reasons in current filter.</div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Top Criteria Overridden</div>
            <div className="mt-2 space-y-1">
              {overrideInsights.topCriteria.length ? (
                overrideInsights.topCriteria.map(([code, count]) => (
                  <div key={`oc-${code}`} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-800">{code}</span>
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">{count}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500">No overridden criteria in current filter.</div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Top Unit/AB Hotspots</div>
            <div className="mt-2 space-y-1">
              {overrideInsights.topBriefs.length ? (
                overrideInsights.topBriefs.map(([brief, count]) => (
                  <div key={`ob-${brief}`} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-800">{brief}</span>
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">{count}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500">No hotspot data in current filter.</div>
              )}
            </div>
          </div>
        </div>
      </section>

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
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">QA Flags</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Uploaded</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Graded</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-zinc-600">No submissions found for this filter.</td></tr>
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
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">
                      {r.qaFlags?.shouldReview ? (
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold text-amber-800">Review</div>
                          <div className="text-[11px] text-zinc-600">
                            {(Array.isArray(r.qaFlags?.reasons) ? r.qaFlags!.reasons!.slice(0, 2) : []).join(" · ") || "Flagged"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-700">Clear</span>
                      )}
                    </td>
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
