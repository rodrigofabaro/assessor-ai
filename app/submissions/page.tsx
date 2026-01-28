"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  fullName: string | null;
  email: string | null;
  externalRef: string | null;
  courseName: string | null;
};

type Submission = {
  id: string;
  filename: string;
  uploadedAt: string;
  status: string;
  extractedText?: string | null;
  assignmentId: string | null;
  assignment?: { title: string | null } | null;
  studentId: string | null;
  student?: Student | null;
  _count?: { extractionRuns: number; assessments: number };
};

type TriageResponse = {
  submission: Submission;
  triage: {
    studentName: string | null;
    email: string | null;
    sampleLines: string[];
    warnings: string[];
    coverage?: any;
  };
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700">
      {children}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
        "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {children}
    </button>
  );
}

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [timeframe, setTimeframe] = useState<"today" | "week" | "all">("today");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Resolve drawer
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);
  const [triage, setTriage] = useState<TriageResponse | null>(null);
  const [triageErr, setTriageErr] = useState<string>("");

  // Student search inside drawer
  const [studentQuery, setStudentQuery] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentResults, setStudentResults] = useState<Student[]>([]);

  async function refresh() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const list = await jsonFetch<Submission[]>("/api/submissions", { cache: "no-store" });
      setItems(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const byLink = unlinkedOnly ? list.filter((s) => !s.studentId) : list;

    const q = (query || "").trim().toLowerCase();
    const byQuery = q
      ? byLink.filter((s) => {
          const hay = [
            s.filename,
            s.student?.fullName,
            s.student?.email,
            s.student?.externalRef,
            s.assignment?.title,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : byLink;

    const byStatus = statusFilter ? byQuery.filter((s) => String(s.status) === statusFilter) : byQuery;

    if (timeframe === "all") return byStatus;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    if (timeframe === "today") {
      return byStatus.filter((s) => {
        const t = new Date(s.uploadedAt).getTime();
        return !Number.isNaN(t) && t >= startOfToday && t < endOfToday;
      });
    }

    // "This week" = week starting Monday.
    const day = now.getDay(); // 0=Sun
    const offsetToMonday = (day + 6) % 7;
    const startOfWeek = startOfToday - offsetToMonday * 24 * 60 * 60 * 1000;
    const endOfWeek = startOfWeek + 7 * 24 * 60 * 60 * 1000;

    return byStatus.filter((s) => {
      const t = new Date(s.uploadedAt).getTime();
      return !Number.isNaN(t) && t >= startOfWeek && t < endOfWeek;
    });
  }, [items, unlinkedOnly, timeframe, query, statusFilter]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const s of items) set.add(String(s.status));
    return Array.from(set).sort();
  }, [items]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, Submission[]>();
    for (const s of filtered) {
      const d = new Date(s.uploadedAt);
      const key = Number.isNaN(d.getTime()) ? "Unknown date" : d.toLocaleDateString();
      const arr = groups.get(key) || [];
      arr.push(s);
      groups.set(key, arr);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  function deriveNextAction(s: Submission) {
    const st = String(s.status || "");
    if (st === "FAILED") return { label: "Attention needed", tone: "danger" as const };
    if (st === "NEEDS_OCR") return { label: "Needs OCR", tone: "warn" as const };

    const extractionRuns = s._count?.extractionRuns ?? 0;
    const assessments = s._count?.assessments ?? 0;
    const hasExtraction = extractionRuns > 0 && (st === "EXTRACTED" || st === "DONE" || st === "ASSESSING" || st === "MARKING");

    if (!hasExtraction || st === "UPLOADED" || st === "EXTRACTING") {
      return { label: st === "EXTRACTING" ? "Extraction running" : "Needs extraction", tone: "warn" as const };
    }

    if (assessments === 0) {
      return { label: "Needs grading", tone: "warn" as const };
    }

    return { label: "Ready to upload to Totara", tone: "ok" as const };
  }

  function ActionPill({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral"; children: string }) {
    const base = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold";
    const cls =
      tone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : tone === "danger"
            ? "border-red-200 bg-red-50 text-red-900"
            : "border-zinc-200 bg-white text-zinc-700";
    return <span className={cx(base, cls)}>{children}</span>;
  }

  async function openResolve(submissionId: string) {
    setResolveId(submissionId);
    setResolveOpen(true);
    setTriage(null);
    setTriageErr("");
    setStudentQuery("");
    setStudentResults([]);

    setTriageBusy(true);
    try {
      const data = await jsonFetch<TriageResponse>(`/api/submissions/${submissionId}/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setTriage(data);

      const seed = data?.triage?.email || data?.triage?.studentName || "";
      if (seed) {
        setStudentQuery(seed);
        await searchStudents(seed);
      }
    } catch (e: any) {
      setTriageErr(e?.message || String(e));
    } finally {
      setTriageBusy(false);
    }
  }

  async function searchStudents(q: string) {
    const query = (q || "").trim();
    if (!query) {
      setStudentResults([]);
      return;
    }
    setStudentBusy(true);
    try {
      const list = await jsonFetch<Student[]>(`/api/students?query=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      setStudentResults(Array.isArray(list) ? list : []);
    } catch {
      setStudentResults([]);
    } finally {
      setStudentBusy(false);
    }
  }

  async function linkStudent(studentId: string) {
    if (!resolveId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await jsonFetch(`/api/submissions/${resolveId}/link-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      setMsg("Student linked.");
      setResolveOpen(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Upload log and processing status. When a submission is unlinked, use <span className="font-medium">Resolve</span> to read the file hints and attach the correct student.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IconButton title="Refresh" onClick={refresh} disabled={busy}>
            ↻ <span>Refresh</span>
          </IconButton>
          <Link
            href="/submissions/new"
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
            title="Upload"
          >
            ⬆ <span>Upload</span>
          </Link>
        </div>
      </div>

      {(err || msg) && (
        <div
          className={cx(
            "mb-4 rounded-xl border p-3 text-sm",
            err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {err || msg}
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300"
              checked={unlinkedOnly}
              onChange={(e) => setUnlinkedOnly(e.target.checked)}
            />
            Unlinked only
            </label>

            <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <button
                type="button"
                onClick={() => setTimeframe("today")}
                className={cx(
                  "px-3 py-2 text-sm font-semibold",
                  timeframe === "today" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"
                )}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("week")}
                className={cx(
                  "px-3 py-2 text-sm font-semibold",
                  timeframe === "week" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"
                )}
              >
                This week
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("all")}
                className={cx(
                  "px-3 py-2 text-sm font-semibold",
                  timeframe === "all" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"
                )}
              >
                All
              </button>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: filename, student, email, AB number…"
              className="h-9 w-[280px] rounded-xl border border-zinc-300 px-3 text-sm"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {statuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-zinc-500">Tip: unlinked items usually need a quick resolve after batch uploads.</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-sm text-zinc-600">
            {unlinkedOnly ? "No unlinked submissions." : "No submissions yet."}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {dayGroups.map(([day, rows]) => (
              <div key={day}>
                <div className="flex items-center justify-between gap-3 bg-zinc-50 px-4 py-3">
                  <div className="text-sm font-semibold text-zinc-900">{day}</div>
                  <div className="text-xs text-zinc-500">{rows.length} submission{rows.length === 1 ? "" : "s"}</div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-zinc-700">
                        <th className="border-b border-zinc-200 bg-white px-4 py-3">File</th>
                        <th className="border-b border-zinc-200 bg-white px-4 py-3">Student</th>
                        <th className="border-b border-zinc-200 bg-white px-4 py-3">Assignment</th>
                        <th className="border-b border-zinc-200 bg-white px-4 py-3">Status</th>
                        <th className="border-b border-zinc-200 bg-white px-4 py-3">Next action</th>
                        <th className="border-b border-zinc-200 bg-white px-4 py-3">Uploaded</th>
                        <th className="border-b border-zinc-200 bg-white px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.id} className="text-sm">
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
                              {!s.studentId ? (
                                <button
                                  type="button"
                                  onClick={() => openResolve(s.id)}
                                  className="rounded-xl border border-zinc-200 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                                  title="Resolve student"
                                >
                                  Resolve
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {resolveOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : setResolveOpen(false))} />

          <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-zinc-500">Resolve student</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-900">Link this submission</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Use hints extracted from the file to find the right student record.
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  onClick={() => (busy ? null : setResolveOpen(false))}
                  aria-label="Close"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4">
              {triageErr ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{triageErr}</div>
              ) : null}

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">File hints</div>
                  {triageBusy ? <div className="text-xs text-zinc-500">Reading…</div> : null}
                </div>

                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">Detected name</span>
                    <span className="font-semibold text-zinc-900">{triage?.triage?.studentName || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">Detected email</span>
                    <span className="font-semibold text-zinc-900">{triage?.triage?.email || "—"}</span>
                  </div>
                </div>

                {!!triage?.triage?.warnings?.length ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="text-xs font-semibold uppercase tracking-wide">Warnings</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {triage.triage.warnings.slice(0, 5).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!!triage?.triage?.sampleLines?.length ? (
                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preview</div>
                    <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800">
                      {triage.triage.sampleLines.slice(0, 30).map((line, i) => (
                        <div key={i} className="whitespace-pre-wrap">
                          {line}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      This is a lightweight preview, not a full render. Use <span className="font-medium">Open</span> if you need to inspect the full submission.
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold">Find matching student</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Search by name, email, AB number…"
                    className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => searchStudents(studentQuery)}
                    className={cx(
                      "h-10 rounded-xl px-4 text-sm font-semibold",
                      "border border-zinc-200 bg-white hover:bg-zinc-50",
                      studentBusy && "opacity-60"
                    )}
                  >
                    Search
                  </button>
                </div>

                <div className="mt-3">
                  {studentResults.length === 0 ? (
                    <div className="text-sm text-zinc-600">No results yet.</div>
                  ) : (
                    <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200">
                      {studentResults.slice(0, 12).map((st) => (
                        <div key={st.id} className="flex items-start justify-between gap-3 p-3">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">{st.fullName || "—"}</div>
                            <div className="mt-1 text-xs text-zinc-600">
                              {[st.email, st.externalRef, st.courseName].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => linkStudent(st.id)}
                            className="h-9 rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-800"
                          >
                            Link
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 text-xs text-zinc-500">
                  Not finding them? Create the student first in <Link className="underline underline-offset-4" href="/admin/students">Students</Link>, then come back and link.
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <Link
                  href={resolveId ? `/submissions/${resolveId}` : "/submissions"}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
                >
                  Open full submission
                </Link>
                <button
                  type="button"
                  onClick={() => setResolveOpen(false)}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
                >
                  Done
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
