"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { jsonFetch } from "@/lib/submissions/api";
import type { Student, TriageResponse } from "@/lib/submissions/types";
import { cx } from "@/lib/submissions/utils";

export function ResolveDrawer({
  open,
  submissionId,
  busyGlobal,
  onClose,
  onLinked,
}: {
  open: boolean;
  submissionId: string | null;
  busyGlobal: boolean;
  onClose: () => void;
  onLinked: () => Promise<void> | void;
}) {
  const [triageBusy, setTriageBusy] = useState(false);
  const [triage, setTriage] = useState<TriageResponse | null>(null);
  const [triageErr, setTriageErr] = useState<string>("");

  const [studentQuery, setStudentQuery] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentResults, setStudentResults] = useState<Student[]>([]);

  // fetch triage when opened
  useEffect(() => {
    if (!open || !submissionId) return;

    let cancelled = false;

    async function run() {
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
        if (cancelled) return;
        setTriage(data);

        const seed = data?.triage?.email || data?.triage?.studentName || "";
        if (seed) {
          setStudentQuery(seed);
          await searchStudents(seed);
        }
      } catch (e: any) {
        if (cancelled) return;
        setTriageErr(e?.message || String(e));
      } finally {
        if (!cancelled) setTriageBusy(false);
      }
    }

    run();
    return () => {
      cancelled = true  
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submissionId]);

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
    if (!submissionId) return;
    await jsonFetch(`/api/submissions/${submissionId}/link-student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    await onLinked();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => (busyGlobal ? null : onClose())} />

      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-zinc-500">Resolve student</div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">Link this submission</div>
              <div className="mt-1 text-sm text-zinc-600">Use hints extracted from the file to find the right student record.</div>
            </div>
            <button
              type="button"
              className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              onClick={() => (busyGlobal ? null : onClose())}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4">
          {triageErr ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{triageErr}</div> : null}

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
              Not finding them? Create the student first in{" "}
              <Link className="underline underline-offset-4" href="/admin/students">
                Students
              </Link>
              , then come back and link.
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Link
              href={submissionId ? `/submissions/${submissionId}` : "/submissions"}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            >
              Open full submission
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            >
              Done
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
