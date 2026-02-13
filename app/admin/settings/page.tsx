"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EndpointOkUsage = {
  available: true;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type EndpointOkCosts = {
  available: true;
  amount: number;
  currency: string;
};

type EndpointOkCredits = {
  available: true;
  totalGranted?: number;
  totalUsed?: number;
  totalAvailable?: number;
};

type EndpointError = {
  available: false;
  status?: number;
  message?: string;
};
type AnyEndpoint = EndpointOkUsage | EndpointOkCosts | EndpointOkCredits | EndpointError;

type UsagePayload = {
  configured: boolean;
  message?: string;
  generatedAt?: string;
  connection?: {
    reachable: boolean;
    status: number;
    message: string;
  };
  window?: {
    startTime: number;
    endTime: number;
    days: number;
  };
  hints?: {
    needsAdminKeyForOrgMetrics?: boolean;
  };
  localUsage?: {
    available: boolean;
    totals: {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    days: Array<{
      date: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;
  };
  usage?: EndpointOkUsage | EndpointError;
  costs?: EndpointOkCosts | EndpointError;
  credits?: EndpointOkCredits | EndpointError;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toLocaleString();
}

function endpointStatusText(value: UsagePayload["usage"] | UsagePayload["costs"] | UsagePayload["credits"]) {
  if (!value) return "Not loaded";
  if (!isEndpointError(value)) return "Available";
  return `Unavailable${value.status ? ` (${value.status})` : ""}`;
}

function endpointMessage(value: UsagePayload["usage"] | UsagePayload["costs"] | UsagePayload["credits"]) {
  if (!value || !isEndpointError(value)) return "";
  return value.message || "";
}

function isEndpointError(value: AnyEndpoint): value is EndpointError {
  return value.available === false;
}

export default function AdminSettingsPage() {
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/openai-usage", {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json()) as UsagePayload;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load OpenAI usage.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const windowLabel = useMemo(() => {
    if (!data?.window) return "Last 30 days";
    return `${formatDate(data.window.startTime)} to ${formatDate(data.window.endTime)}`;
  }, [data?.window]);

  const usageTotal = data?.usage && data.usage.available ? formatNumber(data.usage.totalTokens) : "Unavailable";
  const localUsageTotal = data?.localUsage?.available ? formatNumber(data.localUsage.totals.totalTokens) : "Unavailable";
  const effectiveUsageTotal = data?.usage && data.usage.available ? usageTotal : localUsageTotal;
  const usageSource = data?.usage && data.usage.available ? "OpenAI org metrics" : data?.localUsage?.available ? "Local app telemetry" : "No usage data";
  const costTotal = data?.costs && data.costs.available ? formatMoney(data.costs.amount, data.costs.currency) : "Unavailable";
  const creditRemaining =
    data?.credits && data.credits.available ? formatMoney(data.credits.totalAvailable || 0, "USD") : "Unavailable";

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">System settings</h1>
            <p className="mt-1 text-sm text-zinc-700">OpenAI connectivity, usage metrics, costs, and credit visibility.</p>
          </div>
          <button
            onClick={load}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-900">⚙️</span>
            OpenAI key
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{data?.configured ? "Configured" : "Not configured"}</div>
          <p className="mt-1 text-sm text-zinc-700">{data?.message || "Environment key loaded."}</p>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-900">🔌</span>
            API connection
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">
            {data?.connection?.reachable ? "Connected" : data?.connection ? "Connection issue" : "Checking"}
          </div>
          <p className="mt-1 text-sm text-zinc-700">
            {data?.connection ? `${data.connection.message} (status ${data.connection.status})` : "Probing OpenAI API."}
          </p>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-900">🧮</span>
            Token usage
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{effectiveUsageTotal}</div>
          <p className="mt-1 text-sm text-zinc-700">{windowLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">{usageSource}</p>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-950">💳</span>
            Spend and credits
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{costTotal}</div>
          <p className="mt-1 text-sm text-zinc-700">Remaining credits: {creditRemaining}</p>
        </article>
      </section>

      {data?.hints?.needsAdminKeyForOrgMetrics ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-950">Permission note</h2>
          <p className="mt-2 text-sm text-amber-900">
            This key can reach OpenAI, but org-level usage/cost endpoints returned 403. Use an organization admin key for billing metrics.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Usage breakdown</h2>
        {loading ? <p className="mt-2 text-sm text-zinc-600">Loading usage...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        {!loading && !error && data?.usage?.available ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Requests: {formatNumber(data.usage.requests)}</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Input tokens: {formatNumber(data.usage.inputTokens)}</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Output tokens: {formatNumber(data.usage.outputTokens)}</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Total tokens: {formatNumber(data.usage.totalTokens)}</div>
          </div>
        ) : null}
        {!loading && !error && !(data?.usage && data.usage.available) && data?.localUsage?.available ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Requests: {formatNumber(data.localUsage.totals.requests)}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Input tokens: {formatNumber(data.localUsage.totals.inputTokens)}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Output tokens: {formatNumber(data.localUsage.totals.outputTokens)}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Total tokens: {formatNumber(data.localUsage.totals.totalTokens)}
            </div>
          </div>
        ) : null}
        {!loading && !error && !(data?.usage && data.usage.available) ? (
          <p className="mt-2 text-xs text-zinc-500">Showing local telemetry because org usage scope is unavailable.</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Historical usage</h2>
        {!loading && data?.localUsage?.available && data.localUsage.days.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-600">
                  <th className="px-2 py-1 font-semibold">Date</th>
                  <th className="px-2 py-1 font-semibold">Requests</th>
                  <th className="px-2 py-1 font-semibold">Input</th>
                  <th className="px-2 py-1 font-semibold">Output</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...data.localUsage.days].reverse().slice(0, 30).map((day) => (
                  <tr key={day.date} className="border-t border-zinc-200 text-zinc-700">
                    <td className="px-2 py-1">{day.date}</td>
                    <td className="px-2 py-1">{formatNumber(day.requests)}</td>
                    <td className="px-2 py-1">{formatNumber(day.inputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(day.outputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(day.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">
            No local historical entries yet. History populates after OpenAI-backed operations run in this app.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Endpoint diagnostics</h2>
        <div className="mt-3 grid gap-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <div className="font-medium text-zinc-900">Usage endpoint</div>
            <div className="text-zinc-700">{endpointStatusText(data?.usage)}</div>
            {endpointMessage(data?.usage) ? <div className="text-zinc-600">{endpointMessage(data?.usage)}</div> : null}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <div className="font-medium text-zinc-900">Cost endpoint</div>
            <div className="text-zinc-700">{endpointStatusText(data?.costs)}</div>
            {endpointMessage(data?.costs) ? <div className="text-zinc-600">{endpointMessage(data?.costs)}</div> : null}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <div className="font-medium text-zinc-900">Credits endpoint</div>
            <div className="text-zinc-700">{endpointStatusText(data?.credits)}</div>
            {endpointMessage(data?.credits) ? <div className="text-zinc-600">{endpointMessage(data?.credits)}</div> : null}
          </div>
        </div>
      </section>

      {data?.generatedAt ? <p className="text-xs text-zinc-500">Last updated: {new Date(data.generatedAt).toLocaleString()}</p> : null}
    </div>
  );
}
