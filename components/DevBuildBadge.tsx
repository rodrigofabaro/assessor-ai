"use client";

import { useEffect, useState } from "react";

type BuildInfo = {
  branch: string;
  commit: string;
  dirty: boolean;
  changedFilesCount: number;
  changedFiles: string[];
  runtime: {
    node: string;
    pid: number;
    uptimeSec: number;
    rssMb: number;
  };
  queue: {
    extractionRunsRunning: number;
    submissionsExtracting: number;
    submissionsAssessing: number;
    submissionsFailed: number;
  };
  aiModes: {
    global: "openai" | "local" | "hybrid";
    cleanup: "openai" | "local" | "hybrid";
    ocr: "openai" | "local" | "hybrid";
    equation: "openai" | "local" | "hybrid";
    graph: "openai" | "local" | "hybrid";
    localEnabled: boolean;
  };
  localAi: {
    enabled: boolean;
    baseUrl: string;
    reachable: boolean;
    status: number;
    message: string;
    textModel: string;
    visionModel: string;
    modelCount?: number;
  };
  timestamp: number;
};

type BuildInfoError = {
  ok: false;
  error: string;
};

function isBuildInfo(value: BuildInfo | BuildInfoError): value is BuildInfo {
  return !("ok" in value && value.ok === false);
}

export default function DevBuildBadge() {
  const [data, setData] = useState<BuildInfo | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const MIN_KEY = "assessor.devBadge.minimized";
  const EXP_KEY = "assessor.devBadge.expanded";

  useEffect(() => {
    try {
      const m = window.localStorage.getItem(MIN_KEY);
      const e = window.localStorage.getItem(EXP_KEY);
      if (m === "1") setMinimized(true);
      if (e === "1") setExpanded(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MIN_KEY, minimized ? "1" : "0");
    } catch {}
  }, [minimized]);

  useEffect(() => {
    try {
      window.localStorage.setItem(EXP_KEY, expanded ? "1" : "0");
    } catch {}
  }, [expanded]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const POLL_MS = 15000;

    const fetchBuildInfo = async () => {
      try {
        const res = await fetch("/api/dev/build-info", { cache: "no-store" });
        if (!res.ok) throw new Error("build-info unavailable");
        const json = (await res.json()) as BuildInfo | BuildInfoError;
        if (!cancelled) {
          if (!isBuildInfo(json)) {
            setData(null);
            setApiError(json.error || "unknown error");
          } else {
            setData(json);
            setApiError(null);
          }
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    };

    const startPolling = () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      fetchBuildInfo();
      intervalId = window.setInterval(fetchBuildInfo, POLL_MS);
    };

    const onVisibilityChange = () => {
      // Skip polling in hidden tabs to avoid redundant git work.
      if (document.hidden) {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }
      startPolling();
    };

    startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const lastUpdated = data ? new Date(data.timestamp).toLocaleTimeString() : null;
  const activeWorkCount = data
    ? data.queue.extractionRunsRunning + data.queue.submissionsExtracting + data.queue.submissionsAssessing
    : 0;
  const isAttention = !!offline || !!apiError || (data?.queue.submissionsFailed || 0) > 0;
  const statusTone = isAttention ? "text-amber-300" : activeWorkCount > 0 ? "text-emerald-300" : "text-sky-300";
  const statusDot = isAttention ? "bg-amber-400" : activeWorkCount > 0 ? "bg-emerald-400" : "bg-sky-400";
  const statusLabel = offline || apiError ? "attention" : activeWorkCount > 0 ? "processing" : "idle";

  function formatUptime(totalSec: number) {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-3 right-3 z-[1000] inline-flex h-8 items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-950/58 px-2.5 text-[11px] font-semibold text-zinc-100 shadow-sm backdrop-blur hover:bg-zinc-900/70"
        title="Show developer status"
      >
        <span className={`h-2 w-2 rounded-full ${statusDot}`} />
        Dev
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-[1000] w-[240px] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-700/70 bg-zinc-950/62 p-1.5 text-[11px] leading-4 text-zinc-100 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${statusDot}`} />
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-200">Dev Runtime</div>
        <div className={`ml-auto text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>{statusLabel}</div>
      </div>

      {offline ? (
        <div className="mt-1 text-zinc-300">Status service offline.</div>
      ) : apiError ? (
        <div className="mt-1 text-zinc-300">Status error: {apiError}</div>
      ) : data ? (
        <>
          <div className="mt-1 flex items-center justify-between gap-2 text-zinc-200">
            <div className="truncate font-medium">
              {data.branch}@{data.commit}
            </div>
            <div className="text-zinc-400">updated {lastUpdated || "-"}</div>
          </div>
          <div className="mt-1 grid grid-cols-4 gap-1 text-[10px]">
            <div className="rounded-md border border-zinc-700 bg-zinc-900/75 px-1.5 py-1 text-zinc-200">Runs {data.queue.extractionRunsRunning}</div>
            <div className="rounded-md border border-zinc-700 bg-zinc-900/75 px-1.5 py-1 text-zinc-200">Ext {data.queue.submissionsExtracting}</div>
            <div className="rounded-md border border-zinc-700 bg-zinc-900/75 px-1.5 py-1 text-zinc-200">Grd {data.queue.submissionsAssessing}</div>
            <div className={`rounded-md border px-1.5 py-1 ${data.queue.submissionsFailed > 0 ? "border-amber-600/60 bg-amber-900/35 text-amber-200" : "border-zinc-700 bg-zinc-900/75 text-zinc-200"}`}>
              Fail {data.queue.submissionsFailed}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-1 text-zinc-300">Loading status...</div>
      )}

      <div className="mt-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
        >
          {expanded ? "Less" : "More"}
        </button>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
        >
          Minimize
        </button>
      </div>

      {expanded && data ? (
        <div className="mt-2 grid gap-1.5">
          <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Runtime</div>
            <div className="text-zinc-200">
              up {formatUptime(data.runtime.uptimeSec)} · rss {data.runtime.rssMb} MB · pid {data.runtime.pid}
            </div>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">AI Routing</div>
            <div className="text-zinc-200">
              global {data.aiModes.global} · cleanup {data.aiModes.cleanup} · ocr {data.aiModes.ocr}
            </div>
            <div className="text-zinc-400">equation {data.aiModes.equation} · graph {data.aiModes.graph}</div>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Local AI</div>
            <div className={data.localAi.reachable ? "text-emerald-300" : "text-amber-300"}>
              {data.localAi.enabled ? (data.localAi.reachable ? "reachable" : "unreachable") : "disabled"} · {data.localAi.baseUrl}
            </div>
            <div className="text-zinc-400">
              status {data.localAi.status || 0} · models {data.localAi.modelCount ?? "?"}
            </div>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Git</div>
            <div className="text-zinc-200">{data.dirty ? `dirty (${data.changedFilesCount})` : "clean"}</div>
          </div>
          {data.dirty && data.changedFiles.length > 0 ? (
            <div className="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 font-mono text-[10px] text-zinc-300">
              {data.changedFiles.join("\n")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
