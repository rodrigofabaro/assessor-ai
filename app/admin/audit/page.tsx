"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TinyIcon } from "@/components/ui/TinyIcon";

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

type OpsEvent = {
  ts?: string;
  type?: string;
  details?: {
    requestId?: string;
    dryRun?: boolean;
    targeted?: number;
    succeeded?: number;
    failed?: number;
    previewContext?: {
      linkedPreviewRequestId?: string | null;
      linkedPreviewAt?: string | null;
      queueSizeAtPreview?: number | null;
    };
  };
};

type OpsEventsResponse = {
  ok?: boolean;
  events?: OpsEvent[];
};

type QaIntegrityRow = {
  commitRequestId: string;
  commitTs: string;
  previewRequestId: string;
  previewTs: string | null;
  previewFound: boolean;
  targeted: number;
  succeeded: number;
  failed: number;
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
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AuditResponse | null>(null);
  const [opsEvents, setOpsEvents] = useState<OpsEvent[]>([]);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        type,
        take: String(take),
      });
      const [res, opsRes] = await Promise.all([
        fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/admin/ops/events?limit=400", { cache: "no-store" }),
      ]);
      const json = (await res.json()) as AuditResponse & { error?: string };
      if (!res.ok) throw new Error(json?.error || `Audit fetch failed (${res.status})`);
      const opsJson = (await opsRes.json().catch(() => ({}))) as OpsEventsResponse & { error?: string };
      setData(json);
      setOpsEvents(Array.isArray(opsJson?.events) ? opsJson.events : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load audit events.");
      setData(null);
      setOpsEvents([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || hydratedFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    const nextQ = params.get("q");
    const nextType = params.get("type");
    const nextTake = Number(params.get("take") || "");
    if (nextQ !== null) setQ(nextQ);
    if (nextType !== null) setType(nextType || "ALL");
    if (Number.isFinite(nextTake) && nextTake >= 20 && nextTake <= 300) setTake(nextTake);
    setHydratedFromUrl(true);
  }, [hydratedFromUrl]);

  useEffect(() => {
    if (!hydratedFromUrl) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydratedFromUrl]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydratedFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    if (q.trim()) params.set("q", q.trim()); else params.delete("q");
    if (type && type !== "ALL") params.set("type", type); else params.delete("type");
    if (take !== 120) params.set("take", String(take)); else params.delete("take");
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState({}, "", next);
  }, [hydratedFromUrl, q, type, take]);

  const events = data?.events || [];
  const typeOptions = useMemo(() => ["ALL", ...(data?.typeOptions || [])], [data?.typeOptions]);
  const qaIntegrityRows = useMemo<QaIntegrityRow[]>(() => {
    const batchRuns = opsEvents.filter((e) => String(e?.type || "") === "BATCH_GRADE_RUN");
    const previewByRequestId = new Map<string, OpsEvent>();
    for (const e of batchRuns) {
      const rid = String(e?.details?.requestId || "").trim();
      if (!rid) continue;
      if (e?.details?.dryRun) previewByRequestId.set(rid, e);
    }
    const rows: QaIntegrityRow[] = [];
    for (const e of batchRuns) {
      if (e?.details?.dryRun) continue;
      const commitRequestId = String(e?.details?.requestId || "").trim();
      const previewRequestId = String(e?.details?.previewContext?.linkedPreviewRequestId || "").trim();
      if (!previewRequestId) continue;
      const preview = previewByRequestId.get(previewRequestId) || null;
      rows.push({
        commitRequestId,
        commitTs: String(e?.ts || ""),
        previewRequestId,
        previewTs: preview?.ts || null,
        previewFound: !!preview,
        targeted: Number(e?.details?.targeted || 0),
        succeeded: Number(e?.details?.succeeded || 0),
        failed: Number(e?.details?.failed || 0),
      });
    }
    rows.sort((a, b) => new Date(b.commitTs).getTime() - new Date(a.commitTs).getTime());
    return rows.slice(0, 40);
  }, [opsEvents]);
  const missingPreviewLinks = qaIntegrityRows.filter((r) => !r.previewFound).length;

  return (
    <div className="grid min-w-0 gap-4">
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              <TinyIcon name="audit" />
              Operational Evidence
            </div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Audit Log</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Operational event stream for extraction, grading, linking, overrides, and reference lock actions.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
            <TinyIcon name="status" className="mr-1 h-3 w-3" />
            {busy ? "Loading..." : "Ready"}
          </span>
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
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800"
          >
            <TinyIcon name="refresh" className="h-3.5 w-3.5" />
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
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">QA Preview to Commit Integrity</h2>
            <div className="text-xs text-zinc-600">
              Linked commits: {qaIntegrityRows.length} · Missing preview link: {missingPreviewLinks}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold text-zinc-700">
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Commit run</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Preview run</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Batch outcome</th>
                <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {qaIntegrityRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-600">
                    No linked QA commit runs found yet.
                  </td>
                </tr>
              ) : (
                qaIntegrityRows.map((row) => (
                  <tr key={`${row.commitRequestId}-${row.previewRequestId}`} className="text-sm">
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <div className="font-medium text-zinc-900">{fmtDate(row.commitTs)}</div>
                      <div className="mt-1 font-mono text-xs text-zinc-600">{row.commitRequestId || "—"}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <div className="font-medium text-zinc-900">{row.previewTs ? fmtDate(row.previewTs) : "Not found"}</div>
                      <div className="mt-1 font-mono text-xs text-zinc-600">{row.previewRequestId}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">
                      targeted {row.targeted} · success {row.succeeded} · failed {row.failed}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <span
                        className={
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " +
                          (row.previewFound
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-red-200 bg-red-50 text-red-800")
                        }
                      >
                        {row.previewFound ? "LINKED" : "MISSING_PREVIEW"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
