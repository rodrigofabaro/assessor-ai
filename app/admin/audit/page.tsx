"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AuditEvent = {
  id: string;
  ts: string;
  type: string;
  severity: "info" | "warn" | "error";
  title: string;
  summary: string;
  actor?: string | null;
  entityKind: "submission" | "reference" | "student" | "assignment" | "system";
  entityId?: string | null;
  entityLabel?: string | null;
  href?: string | null;
  meta?: any;
};

type AuditResponse = {
  events: AuditEvent[];
  total: number;
  typeOptions: string[];
  generatedAt: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function pillClass(severity: AuditEvent["severity"]) {
  if (severity === "error") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}

export default function AdminAuditPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL");
  const [take, setTake] = useState(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AuditResponse | null>(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        type,
        take: String(take),
      });
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as AuditResponse & { error?: string };
      if (!res.ok) throw new Error(json?.error || `Audit fetch failed (${res.status})`);
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load audit events.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = data?.events || [];
  const typeOptions = useMemo(() => ["ALL", ...(data?.typeOptions || [])], [data?.typeOptions]);

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Audit trail</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Unified operational log across linking, extraction, grading, and reference lock events.
            </p>
          </div>
          <div className="text-xs text-zinc-600">{busy ? "Loading..." : "Ready"}</div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_120px_auto]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search filename, actor, event type, grade, IDs..."
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            {typeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          <input
            type="number"
            min={20}
            max={300}
            value={take}
            onChange={(e) => setTake(Number(e.target.value || 120))}
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />

          <button
            type="button"
            onClick={load}
            className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Search
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span>Total results: {data?.total ?? 0}</span>
          <span>Showing: {events.length}</span>
          {data?.generatedAt ? <span>Generated: {fmtDate(data.generatedAt)}</span> : null}
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold text-zinc-700">
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Time</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Event</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Entity</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Actor</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-600">
                    No audit events found for this filter.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="text-sm">
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{fmtDate(e.ts)}</td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={"inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " + pillClass(e.severity)}>
                          {e.type}
                        </span>
                        <span className="font-semibold text-zinc-900">{e.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">{e.summary}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">
                      <div className="text-xs uppercase tracking-wide text-zinc-500">{e.entityKind}</div>
                      <div className="mt-1 font-medium text-zinc-900">{e.entityLabel || e.entityId || "—"}</div>
                      {e.href ? (
                        <Link href={e.href} className="mt-1 inline-flex text-xs font-semibold text-sky-700 hover:underline">
                          Open
                        </Link>
                      ) : null}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{e.actor || "system"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <pre className="max-w-[520px] whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700">
                        {e.meta ? JSON.stringify(e.meta, null, 2) : "—"}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

