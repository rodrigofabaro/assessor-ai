"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UsagePayload = {
  configured: boolean;
  message?: string;
  generatedAt?: string;
  window?: {
    startTime: number;
    endTime: number;
    days: number;
  };
  usage?:
    | {
        available: true;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }
    | {
        available: false;
        status?: number;
        message?: string;
      };
  costs?:
    | {
        available: true;
        amount: number;
        currency: string;
      }
    | {
        available: false;
        status?: number;
        message?: string;
      };
  credits?:
    | {
        available: true;
        totalGranted?: number;
        totalUsed?: number;
        totalAvailable?: number;
      }
    | {
        available: false;
        status?: number;
        message?: string;
  };
};

type UsageUnavailable = Extract<NonNullable<UsagePayload["usage"]>, { available: false }>;
type CreditsUnavailable = Extract<NonNullable<UsagePayload["credits"]>, { available: false }>;

function isUsageUnavailable(value: UsagePayload["usage"] | undefined): value is UsageUnavailable {
  return !!value && value.available === false;
}

function isCreditsUnavailable(value: UsagePayload["credits"] | undefined): value is CreditsUnavailable {
  return !!value && value.available === false;
}

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
  const usageError: UsageUnavailable | null = isUsageUnavailable(data?.usage) ? data.usage : null;
  const creditsError: CreditsUnavailable | null = isCreditsUnavailable(data?.credits) ? data.credits : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Settings</h1>
          <p className="mt-1 text-sm text-zinc-700">OpenAI integration health, token usage, and spend visibility.</p>
        </div>
        <button
          onClick={load}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">OpenAI key</div>
          <div className="mt-2 text-lg font-semibold text-zinc-900">{data?.configured ? "Configured" : "Not configured"}</div>
          {data?.message ? <p className="mt-1 text-sm text-zinc-600">{data.message}</p> : null}
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Token usage</div>
          <div className="mt-2 text-lg font-semibold text-zinc-900">
            {data?.usage?.available ? formatNumber(data.usage.totalTokens) : "Unavailable"}
          </div>
          <p className="mt-1 text-sm text-zinc-600">{windowLabel}</p>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cost</div>
          <div className="mt-2 text-lg font-semibold text-zinc-900">
            {data?.costs?.available ? formatMoney(data.costs.amount, data.costs.currency) : "Unavailable"}
          </div>
          <p className="mt-1 text-sm text-zinc-600">{windowLabel}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
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
        {!loading && !error && usageError ? (
          <p className="mt-2 text-sm text-zinc-600">
            Usage endpoint unavailable{usageError.status ? ` (${usageError.status})` : ""}. {usageError.message || ""}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Credits</h2>
        {!loading && !error && data?.credits?.available ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Granted: {formatMoney(data.credits.totalGranted || 0, "USD")}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Used: {formatMoney(data.credits.totalUsed || 0, "USD")}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Remaining: {formatMoney(data.credits.totalAvailable || 0, "USD")}
            </div>
          </div>
        ) : null}
        {!loading && !error && creditsError ? (
          <p className="mt-2 text-sm text-zinc-600">
            Credit endpoint unavailable{creditsError.status ? ` (${creditsError.status})` : ""}. {creditsError.message || ""}
          </p>
        ) : null}
      </section>

      {data?.generatedAt ? <p className="text-xs text-zinc-500">Last updated: {new Date(data.generatedAt).toLocaleString()}</p> : null}
    </div>
  );
}
