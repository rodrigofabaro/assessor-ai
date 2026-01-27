"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Submission = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  student?: { name: string } | null;
  assignment?: { unitCode: string; assignmentRef?: string | null; title: string } | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

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

                  <td className="py-3 pr-4 text-zinc-700">{s.student?.name ?? "-"}</td>

                  <td className="py-3 pr-4 text-zinc-700">{unitCode}</td>

                  <td className="py-3 pr-4 text-zinc-700">{assignmentText}</td>

                  <td className="py-3 pr-4">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800">
                      {s.status}
                    </span>
                  </td>

                  <td className="py-3 pr-4 text-zinc-700">{new Date(s.uploadedAt).toLocaleString()}</td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td className="py-10 text-center text-sm text-zinc-500" colSpan={6}>
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
