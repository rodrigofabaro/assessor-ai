"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TinyIcon } from "@/components/ui/TinyIcon";
import type { PaginatedResponse } from "@/lib/submissions/types";

const GRADE_BANDS = ["REFER", "PASS", "PASS_ON_RESUBMISSION", "MERIT", "DISTINCTION"] as const;
type GradeBand = (typeof GRADE_BANDS)[number];

const CONTROL_CLASS =
  "h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const CONTROL_COMPACT_CLASS =
  "h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_PRIMARY_TALL_CLASS =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-sky-700 bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_NEUTRAL_CLASS = `${BUTTON_BASE_CLASS} border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50`;
const BUTTON_TEAL_CLASS = `${BUTTON_BASE_CLASS} border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100`;
const BUTTON_ROW_BASE_CLASS =
  "inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_ROW_SKY_CLASS = `${BUTTON_ROW_BASE_CLASS} border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100`;
const BUTTON_ROW_TEAL_CLASS = `${BUTTON_ROW_BASE_CLASS} border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100`;
const BUTTON_PAGE_CLASS =
  "inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400";

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
  turnitin?: {
    turnitinSubmissionId?: string | null;
    status?: string | null;
    aiWritingPercentage?: number | null;
    overallMatchPercentage?: number | null;
    internetMatchPercentage?: number | null;
    publicationMatchPercentage?: number | null;
    submittedWorksMatchPercentage?: number | null;
    reportRequestedAt?: string | null;
    reportGeneratedAt?: string | null;
    viewerUrl?: string | null;
    lastError?: string | null;
    updatedAt?: string | null;
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

function asPercent(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
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
  const [debouncedQ, setDebouncedQ] = useState("");
  const [course, setCourse] = useState("ALL");
  const [unit, setUnit] = useState("ALL");
  const [assignment, setAssignment] = useState("ALL");
  const [grade, setGrade] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [compareUnit, setCompareUnit] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [turnitinBusyById, setTurnitinBusyById] = useState<Record<string, boolean>>({});
  const [turnitinBatchBusy, setTurnitinBatchBusy] = useState(false);
  const [turnitinMsg, setTurnitinMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("view", "qa");
      params.set("qa", "1");
      params.set("includeFeedback", "0");
      params.set("paginate", "1");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("timeframe", "all");
      params.set("sortBy", "uploadedAt");
      params.set("sortDir", "desc");
      if (debouncedQ) params.set("q", debouncedQ);
      if (course !== "ALL") params.set("course", course);
      if (unit !== "ALL") params.set("unitCode", unit);
      if (assignment !== "ALL") params.set("assignmentRef", assignment);
      if (grade !== "ALL") params.set("grade", grade);
      if (status !== "ALL") params.set("status", status);

      const res = await fetch(`/api/submissions?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as PaginatedResponse<SubmissionResearchRow> & { error?: string };
      if (!res.ok) throw new Error((json as any)?.error || `Submissions fetch failed (${res.status})`);
      const nextRows = Array.isArray(json?.items) ? json.items : [];
      setRows(nextRows);
      setTotalItems(Math.max(0, Number(json?.pageInfo?.totalItems || 0)));
      setTotalPages(Math.max(1, Number(json?.pageInfo?.totalPages || 1)));
    } catch (e: any) {
      setRows([]);
      setTotalItems(0);
      setTotalPages(1);
      setError(e?.message || "Failed to load QA dataset.");
    } finally {
      setBusy(false);
    }
  }, [page, pageSize, debouncedQ, course, unit, assignment, grade, status]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, course, unit, assignment, grade, status, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function runTurnitinAction(
    submissionId: string,
    action: "send" | "refresh" | "sync" | "viewer" = "sync",
    options?: { reload?: boolean }
  ) {
    const sid = String(submissionId || "").trim();
    if (!sid) return { ok: false as const, error: "Missing submission id.", state: null as any };
    setTurnitinMsg("");
    setTurnitinBusyById((prev) => ({ ...prev, [sid]: true }));
    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(sid)}/turnitin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; state?: any };
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Turnitin action failed (${res.status})`);
      setTurnitinMsg(
        `Turnitin ${action} complete for ${sid}: ${String(json?.state?.status || "updated")} ${
          Number.isFinite(Number(json?.state?.overallMatchPercentage))
            ? `(${Number(json.state.overallMatchPercentage)}%)`
            : ""
        }`
      );
      if (options?.reload !== false) {
        await load();
      }
      return { ok: true as const, state: json?.state || null, error: "" };
    } catch (e: any) {
      const message = e?.message || "Turnitin action failed.";
      setTurnitinMsg(message);
      return { ok: false as const, state: null as any, error: message };
    } finally {
      setTurnitinBusyById((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    }
  }

  async function openTurnitinReport(row: SubmissionResearchRow) {
    const sid = String(row?.id || "").trim();
    const hasSubmissionId = !!String(row?.turnitin?.turnitinSubmissionId || "").trim();
    const turnitinStatus = String(row?.turnitin?.status || "").trim().toUpperCase();
    if (!sid || !hasSubmissionId) {
      setTurnitinMsg("Send to Turnitin first to create a report.");
      return;
    }
    if (turnitinStatus !== "COMPLETE") {
      setTurnitinMsg("Turnitin report is not ready yet. Status must be COMPLETE.");
      return;
    }
    const result = await runTurnitinAction(sid, "viewer", { reload: false });
    if (!result.ok) return;
    const viewerUrl = String(result.state?.viewerUrl || "").trim();
    if (!viewerUrl) {
      setTurnitinMsg("Viewer URL was not returned. Try again in a few seconds.");
      return;
    }
    if (typeof window !== "undefined") {
      window.open(viewerUrl, "_blank", "noopener,noreferrer");
    }
    await load();
  }

  async function sendPageToTurnitin() {
    if (!filtered.length) return;
    const pending = filtered
      .filter((r) => {
        const hasSubmissionId = !!String(r.turnitin?.turnitinSubmissionId || "").trim();
        if (!hasSubmissionId) return true;
        const status = String(r.turnitin?.status || "").trim().toUpperCase();
        return status === "FAILED";
      })
      .map((r) => r.id);
    if (!pending.length) {
      setTurnitinMsg("All visible rows are already queued in Turnitin.");
      return;
    }

    setTurnitinBatchBusy(true);
    setTurnitinMsg(`Queueing ${pending.length} row(s) to Turnitin...`);
    try {
      for (const sid of pending) {
        await runTurnitinAction(sid, "send", { reload: false });
      }
      await load();
      setTurnitinMsg(`Queued ${pending.length} row(s) to Turnitin.`);
    } catch (e: any) {
      setTurnitinMsg(e?.message || "Failed to send page rows to Turnitin.");
    } finally {
      setTurnitinBatchBusy(false);
    }
  }

  const filtered = rows;

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
  
  useEffect(() => {
    if (compareUnit !== "ALL" && !optionList.units.includes(compareUnit)) {
      setCompareUnit("ALL");
    }
  }, [compareUnit, optionList.units]);
  
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, course, unit, AB, filename..." className={CONTROL_CLASS} />
          <select value={course} onChange={(e) => setCourse(e.target.value)} className={CONTROL_CLASS}>{optionList.courses.map((v) => <option key={v} value={v}>Course: {v}</option>)}</select>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={CONTROL_CLASS}>{optionList.units.map((v) => <option key={v} value={v}>Unit: {v}</option>)}</select>
          <select value={assignment} onChange={(e) => setAssignment(e.target.value)} className={CONTROL_CLASS}>{optionList.assignments.map((v) => <option key={v} value={v}>AB: {v}</option>)}</select>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={CONTROL_CLASS}>{["ALL", ...GRADE_BANDS, "UNGRADED"].map((v) => <option key={v} value={v}>Grade: {v}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={CONTROL_CLASS}>{optionList.statuses.map((v) => <option key={v} value={v}>Status: {v}</option>)}</select>
          <button type="button" onClick={load} className={BUTTON_PRIMARY_TALL_CLASS}><TinyIcon name="refresh" className="h-3.5 w-3.5" />Refresh</button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Current page rows" value={metrics.total} />
          <MetricCard label="Graded" value={metrics.graded} />
          <MetricCard label="Students" value={metrics.students} />
          <MetricCard label="Courses" value={metrics.courses} />
          <MetricCard label="Units" value={metrics.units} />
          <MetricCard label="Avg score" value={metrics.avgScore.toFixed(2)} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          <div>
            Server results: <span className="font-semibold text-zinc-900">{totalItems}</span> rows · Page{" "}
            <span className="font-semibold text-zinc-900">{page}</span> of{" "}
            <span className="font-semibold text-zinc-900">{Math.max(1, totalPages)}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1">
              <span className="text-zinc-600">Page size</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Math.max(20, Math.min(200, Number(e.target.value) || 60)))}
                className={CONTROL_COMPACT_CLASS}
              >
                {[40, 60, 100, 150].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={busy || page <= 1}
              className={BUTTON_PAGE_CLASS}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(Math.max(1, totalPages), p + 1))}
              disabled={busy || page >= totalPages}
              className={BUTTON_PAGE_CLASS}
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {Object.entries(metrics.byGrade).map(([g, n]) => (
            <span key={g} className="inline-flex rounded-full border border-zinc-200 bg-white px-2 py-1 font-semibold text-zinc-700">
              {g}: {n}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportFiltered} className={BUTTON_NEUTRAL_CLASS}>
            <TinyIcon name="submissions" className="h-3 w-3" />
            Export filtered report
          </button>
          <button
            type="button"
            onClick={sendPageToTurnitin}
            disabled={busy || turnitinBatchBusy}
            className={BUTTON_TEAL_CLASS}
          >
            <TinyIcon name="refresh" className="h-3 w-3" />
            {turnitinBatchBusy ? "Sending..." : "Send page to Turnitin"}
          </button>
          <Link href="/admin/audit" className={BUTTON_NEUTRAL_CLASS}>
            <TinyIcon name="audit" className="h-3 w-3" />
            Open audit log
          </Link>
        </div>
        {turnitinMsg ? <p className="mt-2 text-xs text-zinc-700">{turnitinMsg}</p> : null}
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
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Turnitin</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Uploaded</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Graded</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-zinc-600">No submissions found for this filter.</td></tr>
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
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">
                      <div className="space-y-1">
                        <div className="text-[11px]">
                          <span className="font-semibold text-zinc-800">
                            Report: {r.turnitin?.status ? String(r.turnitin.status) : "Not sent"}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          <span className="font-semibold text-zinc-800">
                            {(() => {
                              const pct = asPercent(r.turnitin?.overallMatchPercentage);
                              return pct === null ? "—" : `${pct}%`;
                            })()}
                          </span>{" "}
                          Similarity
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          <span className="font-semibold text-zinc-800">
                            {(() => {
                              const pct = asPercent(r.turnitin?.aiWritingPercentage);
                              return pct === null ? "—" : `${pct}%`;
                            })()}
                          </span>{" "}
                          AI writing
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(() => {
                            const hasSubmissionId = !!String(r.turnitin?.turnitinSubmissionId || "").trim();
                            const turnitinStatus = String(r.turnitin?.status || "").trim().toUpperCase();
                            const canOpen = hasSubmissionId && turnitinStatus === "COMPLETE";
                            return (
                              <button
                                type="button"
                                onClick={() => void openTurnitinReport(r)}
                                disabled={!canOpen || Boolean(turnitinBusyById[r.id]) || busy || turnitinBatchBusy}
                                className={BUTTON_ROW_SKY_CLASS}
                                title={
                                  !hasSubmissionId
                                    ? "Send to Turnitin first to create a report"
                                    : turnitinStatus !== "COMPLETE"
                                      ? "Report is not ready yet (Turnitin status must be COMPLETE)"
                                      : "Open Turnitin report (fresh token)"
                                }
                              >
                                {turnitinBusyById[r.id] ? "Opening..." : "Open report"}
                              </button>
                            );
                          })()}
                          {(() => {
                            const hasSubmissionId = !!String(r.turnitin?.turnitinSubmissionId || "").trim();
                            const status = String(r.turnitin?.status || "").trim().toUpperCase();
                            if (!hasSubmissionId) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => void runTurnitinAction(r.id, "send")}
                                  disabled={Boolean(turnitinBusyById[r.id]) || busy || turnitinBatchBusy}
                                  className={BUTTON_ROW_TEAL_CLASS}
                                >
                                  {turnitinBusyById[r.id] ? "Working..." : "Send to Turnitin"}
                                </button>
                              );
                            }

                            if (status === "FAILED") {
                              return (
                                <button
                                  type="button"
                                  onClick={() => void runTurnitinAction(r.id, "send")}
                                  disabled={Boolean(turnitinBusyById[r.id]) || busy || turnitinBatchBusy}
                                  className={BUTTON_ROW_TEAL_CLASS}
                                >
                                  {turnitinBusyById[r.id] ? "Working..." : "Re-send to Turnitin"}
                                </button>
                              );
                            }

                            if (status === "PROCESSING" || status === "CREATED" || status === "UPLOADING") {
                              return (
                                <button
                                  type="button"
                                  onClick={() => void runTurnitinAction(r.id, "refresh")}
                                  disabled={Boolean(turnitinBusyById[r.id]) || busy || turnitinBatchBusy}
                                  className={BUTTON_ROW_TEAL_CLASS}
                                >
                                  {turnitinBusyById[r.id] ? "Working..." : "Check status"}
                                </button>
                              );
                            }

                            return null;
                          })()}
                        </div>
                        {r.turnitin?.lastError ? (
                          <div className="text-[11px] text-rose-700">{String(r.turnitin.lastError)}</div>
                        ) : null}
                      </div>
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
