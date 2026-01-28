"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Submission = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  student?: { id: string; fullName: string; email?: string | null; externalRef?: string | null } | null;
  assignment?: { unitCode: string; assignmentRef?: string | null; title: string } | null;
  extractionRuns: ExtractionRun[];
};

type StudentPick = { id: string; fullName: string | null; email: string | null; externalRef: string | null };


function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  // Link student modal
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForSubmissionId, setLinkForSubmissionId] = useState<string | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentOptions, setStudentOptions] = useState<StudentPick[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [linkBusy, setLinkBusy] = useState(false);

  async function load() {
    setErr("");
    setBusy(true);
    try {
      // cache-bust to avoid "sticky" dev/prod edge caching
      const res = await fetch(`/api/submissions?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to load submissions (${res.status}): ${text}`);
      }
      const data = (await res.json()) as Submission[];
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadStudentOptions(q: string) {
    const res = await fetch(`/api/students?query=${encodeURIComponent(q)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ([]));
    const arr: StudentPick[] = Array.isArray(data) ? data : Array.isArray((data as any)?.students) ? (data as any).students : [];
    setStudentOptions(arr);
  }

  function openLink(submissionId: string) {
    setErr("");
    setLinkForSubmissionId(submissionId);
    setStudentQuery("");
    setStudentOptions([]);
    setSelectedStudentId("");
    setLinkOpen(true);
  }

  async function confirmLink() {
    if (!linkForSubmissionId || !selectedStudentId) return;
    setLinkBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/submissions/${linkForSubmissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selectedStudentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setLinkOpen(false);
      await load();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLinkBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => items ?? [], [items]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Your upload log. Phase 3 adds extraction runs, OCR flags, and confidence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className={classNames(
              "h-10 rounded-xl px-4 text-sm font-semibold",
              busy ? "bg-zinc-200 text-zinc-700" : "border border-zinc-300 bg-white hover:bg-zinc-50"
            )}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            href="/upload"
            className="h-10 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Upload more
          </Link>
        </div>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="py-3 pl-4 pr-4">File</th>
              <th className="py-3 pr-4">Student</th>
              <th className="py-3 pr-4">Unit</th>
              <th className="py-3 pr-4">Assignment</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Uploaded</th>
              <th className="py-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((s) => {
              const unitCode = s.assignment?.unitCode ?? "-";
              const assignmentText = s.assignment
                ? `${s.assignment.assignmentRef ?? "-"} — ${s.assignment.title}`
                : "-";

              return (
                <tr key={s.id} className="border-b border-zinc-100">
                  <td className="py-3 pl-4 pr-4 font-medium">
                    <Link href={`/submissions/${s.id}`} className="underline underline-offset-4 hover:text-zinc-700">
                      {s.filename}
                    </Link>
                  </td>

                  <td className="py-3 pr-4 text-zinc-700">
                    {s.student?.id ? (
                      <Link
                        href={`/students/${s.student.id}`}
                        className="font-medium underline underline-offset-4 hover:text-zinc-900"
                      >
                        {s.student.fullName || "Unnamed"}
                      </Link>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                        Unlinked
                      </span>
                    )}
                  </td>

                  <td className="py-3 pr-4 text-zinc-700">{unitCode}</td>

                  <td className="py-3 pr-4 text-zinc-700">{assignmentText}</td>

                  <td className="py-3 pr-4">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800">
                      {s.status}
                    </span>
                  </td>

                  <td className="py-3 pr-4 text-zinc-700">{new Date(s.uploadedAt).toLocaleString()}</td>

                  <td className="py-3 pr-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/submissions/${s.id}`}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                      >
                        Open
                      </Link>
                      {!s.student?.id ? (
                        <button
                          type="button"
                          onClick={() => openLink(s.id)}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                        >
                          Link student
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td className="py-10 text-center text-sm text-zinc-500" colSpan={7}>
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {linkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => (linkBusy ? null : setLinkOpen(false))} />
          <div className="relative w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Link submission to student</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Search by name, email, or AB number. This keeps your upload log clean and makes grading reports sane.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => (linkBusy ? null : setLinkOpen(false))}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search students..."
                  className="h-10 flex-1 rounded-xl border border-zinc-300 px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => loadStudentOptions(studentQuery).catch(() => setStudentOptions([]))}
                  className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
                >
                  Search
                </button>
              </div>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Select student</span>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                >
                  <option value="">Choose…</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.fullName || "Unnamed") + (s.externalRef ? ` (${s.externalRef})` : "") + (s.email ? ` — ${s.email}` : "")}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-zinc-500">
                  Tip: if you don’t see them, add them in Admin → Students.
                </div>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLinkOpen(false)}
                disabled={linkBusy}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLink}
                disabled={linkBusy || !selectedStudentId}
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {linkBusy ? "Linking…" : "Link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
