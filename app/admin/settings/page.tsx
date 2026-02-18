"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

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

type EndpointError = {
  available: false;
  status?: number;
  message?: string;
};
type AnyEndpoint = EndpointOkUsage | EndpointOkCosts | EndpointError;

type UsagePayload = {
  configured: boolean;
  keyType?: "admin" | "standard";
  model?: string;
  modelSource?: "env" | "settings";
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
      estimatedCostUsd?: number;
    };
    days: Array<{
      date: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd?: number;
    }>;
    recentEvents?: Array<{
      ts: number;
      model: string;
      op: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd?: number;
    }>;
  };
  usage?: EndpointOkUsage | EndpointError;
  costs?: EndpointOkCosts | EndpointError;
};

type ModelPayload = {
  model: string;
  autoCleanupApproved?: boolean;
  source: "env" | "settings";
  allowedModels: string[];
};

type GradingConfigPayload = {
  model: string;
  tone: "supportive" | "professional" | "strict";
  strictness: "lenient" | "balanced" | "strict";
  useRubricIfAvailable: boolean;
  maxFeedbackBullets: number;
  feedbackTemplate: string;
};

type AppUser = {
  id: string;
  fullName: string;
  email?: string | null;
  role: string;
  isActive: boolean;
};

type AppConfigPayload = {
  id: number;
  activeAuditUserId?: string | null;
  faviconUpdatedAt?: string | null;
  activeAuditUser?: AppUser | null;
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

function endpointStatusText(value: UsagePayload["usage"] | UsagePayload["costs"]) {
  if (!value) return "Not loaded";
  if (!isEndpointError(value)) return "Available";
  return `Unavailable${value.status ? ` (${value.status})` : ""}`;
}

function endpointMessage(value: UsagePayload["usage"] | UsagePayload["costs"]) {
  if (!value || !isEndpointError(value)) return "";
  return value.message || "";
}

function isEndpointError(value: AnyEndpoint): value is EndpointError {
  return value.available === false;
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<"ai" | "grading" | "app">("ai");
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("");
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [savingModel, setSavingModel] = useState(false);
  const [modelMessage, setModelMessage] = useState<string>("");
  const [autoCleanupApproved, setAutoCleanupApproved] = useState(false);
  const [gradingCfg, setGradingCfg] = useState<GradingConfigPayload | null>(null);
  const [gradingSaving, setGradingSaving] = useState(false);
  const [gradingMsg, setGradingMsg] = useState("");
  const [appCfg, setAppCfg] = useState<AppConfigPayload | null>(null);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [appSaving, setAppSaving] = useState(false);
  const [appMsg, setAppMsg] = useState("");
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconBusy, setFaviconBusy] = useState(false);

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
      if (json.model) setModel(json.model);

      const modelRes = await fetch("/api/admin/openai-model", { method: "GET", cache: "no-store" });
      if (modelRes.ok) {
        const modelJson = (await modelRes.json()) as ModelPayload;
        setAllowedModels(modelJson.allowedModels || []);
        setAutoCleanupApproved(!!modelJson.autoCleanupApproved);
        if (!json.model && modelJson.model) setModel(modelJson.model);
      }

      const gradingRes = await fetch("/api/admin/grading-config", { method: "GET", cache: "no-store" });
      if (gradingRes.ok) {
        const gradingJson = (await gradingRes.json()) as GradingConfigPayload;
        setGradingCfg(gradingJson);
      }

      const [appCfgRes, appUsersRes] = await Promise.all([
        fetch("/api/admin/app-config", { method: "GET", cache: "no-store" }),
        fetch("/api/admin/users", { method: "GET", cache: "no-store" }),
      ]);
      if (appCfgRes.ok) {
        const appCfgJson = (await appCfgRes.json()) as AppConfigPayload;
        setAppCfg(appCfgJson);
      }
      if (appUsersRes.ok) {
        const usersJson = (await appUsersRes.json()) as { users?: AppUser[] };
        setAppUsers(Array.isArray(usersJson.users) ? usersJson.users : []);
      }
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
  const localEstimatedCost = typeof data?.localUsage?.totals?.estimatedCostUsd === "number" ? data.localUsage.totals.estimatedCostUsd : 0;
  const costTotal =
    data?.costs && data.costs.available
      ? formatMoney(data.costs.amount, data.costs.currency)
      : localEstimatedCost > 0
        ? `${formatMoney(localEstimatedCost, "usd")} (local estimate)`
        : "Unavailable";
  const saveModel = useCallback(async () => {
    if (!model) return;
    setSavingModel(true);
    setModelMessage("");
    try {
      const res = await fetch("/api/admin/openai-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, autoCleanupApproved }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save model");
      setModelMessage("Model saved.");
      await load();
    } catch (e) {
      setModelMessage(e instanceof Error ? e.message : "Failed to save model.");
    } finally {
      setSavingModel(false);
    }
  }, [autoCleanupApproved, load, model]);

  const saveGradingConfig = useCallback(async () => {
    if (!gradingCfg) return;
    setGradingSaving(true);
    setGradingMsg("");
    try {
      const res = await fetch("/api/admin/grading-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gradingCfg),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save grading config.");
      setGradingMsg("Grading config saved.");
      await load();
    } catch (e) {
      setGradingMsg(e instanceof Error ? e.message : "Failed to save grading config.");
    } finally {
      setGradingSaving(false);
    }
  }, [gradingCfg, load]);

  const saveAppConfig = useCallback(async () => {
    if (!appCfg) return;
    setAppSaving(true);
    setAppMsg("");
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeAuditUserId: appCfg.activeAuditUserId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save app config.");
      setAppMsg("App settings saved.");
      await load();
    } catch (e) {
      setAppMsg(e instanceof Error ? e.message : "Failed to save app config.");
    } finally {
      setAppSaving(false);
    }
  }, [appCfg, load]);

  const uploadFavicon = useCallback(async () => {
    if (!faviconFile) return;
    setFaviconBusy(true);
    setAppMsg("");
    try {
      const fd = new FormData();
      fd.append("file", faviconFile);
      const res = await fetch("/api/admin/favicon", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to upload favicon.");
      setAppMsg("Favicon uploaded. Hard refresh may be required.");
      setFaviconFile(null);
      await load();
    } catch (e) {
      setAppMsg(e instanceof Error ? e.message : "Failed to upload favicon.");
    } finally {
      setFaviconBusy(false);
    }
  }, [faviconFile, load]);

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">System settings</h1>
            <p className="mt-1 text-sm text-zinc-700">Separate controls for AI telemetry and grading behavior.</p>
          </div>
          <button
            onClick={load}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="mt-4 inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={() => setTab("ai")}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition " +
              (tab === "ai" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")
            }
          >
            AI Usage
          </button>
          <button
            type="button"
            onClick={() => setTab("grading")}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition " +
              (tab === "grading" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")
            }
          >
            Grading
          </button>
          <button
            type="button"
            onClick={() => setTab("app")}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition " +
              (tab === "app" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")
            }
          >
            App
          </button>
        </div>
      </section>

      {tab === "ai" ? (
      <>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-900">⚙️</span>
            OpenAI key
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{data?.configured ? "Configured" : "Not configured"}</div>
          <p className="mt-1 text-sm text-zinc-700">{data?.message || "Environment key loaded."}</p>
          <p className="mt-1 text-xs text-zinc-500">Using {data?.keyType === "admin" ? "admin key" : "standard key"}</p>
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
            Spend / cost
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{costTotal}</div>
          <p className="mt-1 text-sm text-zinc-700">{windowLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {data?.costs && data.costs.available ? "OpenAI org metrics" : localEstimatedCost > 0 ? "Local telemetry estimate" : "No cost data"}
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Agent model</h2>
        <p className="mt-1 text-sm text-zinc-600">Select which OpenAI model the agent should use.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-10 min-w-[220px] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            {(allowedModels.length ? allowedModels : ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o", "gpt-5-mini"]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={saveModel}
            disabled={savingModel || !model}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          >
            {savingModel ? "Saving..." : "Save model"}
          </button>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={autoCleanupApproved}
            onChange={(e) => setAutoCleanupApproved(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Approve automatic OpenAI cleanup for warning tasks
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Current: {data?.model || model || "unknown"} ({data?.modelSource || "env"})
        </p>
        {modelMessage ? <p className="mt-1 text-xs text-zinc-600">{modelMessage}</p> : null}
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
        <h2 className="text-sm font-semibold text-zinc-900">Recent OpenAI logs</h2>
        {!loading && data?.localUsage?.available && (data.localUsage.recentEvents || []).length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-600">
                  <th className="px-2 py-1 font-semibold">Time</th>
                  <th className="px-2 py-1 font-semibold">Operation</th>
                  <th className="px-2 py-1 font-semibold">Model</th>
                  <th className="px-2 py-1 font-semibold">Input</th>
                  <th className="px-2 py-1 font-semibold">Output</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                  <th className="px-2 py-1 font-semibold">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {(data.localUsage.recentEvents || []).slice(0, 25).map((evt, i) => (
                  <tr key={`${evt.ts}-${evt.op}-${i}`} className="border-t border-zinc-200 text-zinc-700">
                    <td className="px-2 py-1">{new Date(evt.ts * 1000).toLocaleString()}</td>
                    <td className="px-2 py-1">{evt.op}</td>
                    <td className="px-2 py-1">{evt.model}</td>
                    <td className="px-2 py-1">{formatNumber(evt.inputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(evt.outputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(evt.totalTokens)}</td>
                    <td className="px-2 py-1">{evt.estimatedCostUsd ? formatMoney(evt.estimatedCostUsd, "usd") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">No local OpenAI logs yet.</p>
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
        </div>
      </section>

      {data?.generatedAt ? <p className="text-xs text-zinc-500">Last updated: {new Date(data.generatedAt).toLocaleString()}</p> : null}
      </>
      ) : null}

      {tab === "grading" ? (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Grading defaults</h2>
        <p className="mt-1 text-sm text-zinc-600">Controls default tone/strictness/rubric behavior when tutors run grading.</p>
        {gradingCfg ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-700">
              Tone
              <select
                value={gradingCfg.tone}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, tone: e.target.value as any } : v))}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="supportive">Supportive</option>
                <option value="professional">Professional</option>
                <option value="strict">Strict</option>
              </select>
            </label>
            <label className="text-sm text-zinc-700">
              Strictness
              <select
                value={gradingCfg.strictness}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, strictness: e.target.value as any } : v))}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="lenient">Lenient</option>
                <option value="balanced">Balanced</option>
                <option value="strict">Strict</option>
              </select>
            </label>
            <label className="text-sm text-zinc-700">
              Feedback bullets
              <input
                type="number"
                min={3}
                max={12}
                value={gradingCfg.maxFeedbackBullets}
                onChange={(e) =>
                  setGradingCfg((v) => (v ? { ...v, maxFeedbackBullets: Math.max(3, Math.min(12, Number(e.target.value || 6))) } : v))
                }
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={gradingCfg.useRubricIfAvailable}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, useRubricIfAvailable: e.target.checked } : v))}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Use rubric when attached to brief
            </label>
            <label className="md:col-span-2 text-sm text-zinc-700">
              Feedback template
              <textarea
                value={gradingCfg.feedbackTemplate || ""}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, feedbackTemplate: e.target.value } : v))}
                rows={9}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Placeholders: {"{studentFirstName}"}, {"{feedbackSummary}"}, {"{feedbackBullets}"}, {"{overallGrade}"}, {"{assessorName}"}, {"{date}"}.
                Required: {"{overallGrade}"} and {"{feedbackBullets}"}.
              </div>
            </label>
            <div className="md:col-span-2">
              <button
                onClick={saveGradingConfig}
                disabled={gradingSaving}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
              >
                {gradingSaving ? "Saving..." : "Save grading defaults"}
              </button>
              {gradingMsg ? <p className="mt-2 text-xs text-zinc-600">{gradingMsg}</p> : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">Loading grading settings…</p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">What this affects</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          <li>Tutor-facing tone and strictness defaults on submission grading runs.</li>
          <li>Whether rubric hints are included when a rubric is attached to the locked brief.</li>
          <li>Maximum number of feedback bullets saved into audit output and marked PDF overlay.</li>
          <li>Feedback template used to build feedback text and assessor/date signature blocks.</li>
        </ul>
      </section>
      </>
      ) : null}

      {tab === "app" ? (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">App identity & audit actor</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Choose who appears as actor in upload/link/grading audit records when no explicit actor is provided.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <select
            value={appCfg?.activeAuditUserId || ""}
            onChange={(e) =>
              setAppCfg((v) =>
                v
                  ? { ...v, activeAuditUserId: e.target.value || null }
                  : v
              )
            }
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            <option value="">system (no active user)</option>
            {appUsers
              .filter((u) => u.isActive)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} {u.role ? `(${u.role})` : ""}
                </option>
              ))}
          </select>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={saveAppConfig}
              disabled={appSaving || !appCfg}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              {appSaving ? "Saving..." : "Save actor setting"}
            </button>
            <Link
              href="/admin/users"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Manage users
            </Link>
          </div>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          Need to add or edit users? Use the <span className="font-medium text-zinc-700">Manage users</span> button.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Branding: favicon</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Upload an icon used by browser tabs (`/favicon.ico`). Supported: ICO/PNG/SVG (max 2MB).
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".ico,image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml"
            onChange={(e) => setFaviconFile(e.target.files?.[0] || null)}
            className="block text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border file:border-zinc-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-900 hover:file:bg-zinc-50"
          />
          <button
            onClick={uploadFavicon}
            disabled={!faviconFile || faviconBusy}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          >
            {faviconBusy ? "Uploading..." : "Upload favicon"}
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          Last updated: {appCfg?.faviconUpdatedAt ? new Date(appCfg.faviconUpdatedAt).toLocaleString() : "Never"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Preview:
          <Image src="/favicon.ico" alt="Current favicon" width={16} height={16} className="ml-2 inline-block align-middle" />
        </p>
        {appMsg ? <p className="mt-2 text-xs text-zinc-600">{appMsg}</p> : null}
      </section>
      </>
      ) : null}
    </div>
  );
}
