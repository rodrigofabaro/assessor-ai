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
  const statusTone = offline || apiError ? "text-amber-300" : activeWorkCount > 0 ? "text-emerald-300" : "text-sky-300";
  const statusLabel = offline || apiError ? "attention" : activeWorkCount > 0 ? "processing" : "idle";

  function formatUptime(totalSec: number) {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  return (
    <div className="fixed bottom-3 right-3 z-[1000] w-[380px] max-w-[calc(100vw-16px)] rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2 text-[11px] leading-4 text-zinc-100 shadow-xl">
      {offline ? (
        <div className="font-medium text-amber-300">badge offline</div>
      ) : apiError ? (
        <div className="space-y-0.5">
          <div className="font-semibold text-amber-300">badge error</div>
          <div className="text-zinc-300">{apiError}</div>
        </div>
      ) : data ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-zinc-100">
              {data.branch} @ {data.commit}
            </div>
            <div className={`font-semibold uppercase tracking-wide ${statusTone}`}>{statusLabel}</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Runtime</div>
              <div className="font-medium text-zinc-200">
                up {formatUptime(data.runtime.uptimeSec)} · rss {data.runtime.rssMb} MB
              </div>
              <div className="text-zinc-500">pid {data.runtime.pid} · {data.runtime.node}</div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Queue</div>
              <div className="font-medium text-zinc-200">
                runs {data.queue.extractionRunsRunning} · ext {data.queue.submissionsExtracting} · grd {data.queue.submissionsAssessing}
              </div>
              <div className={data.queue.submissionsFailed > 0 ? "text-amber-300" : "text-zinc-500"}>
                failed {data.queue.submissionsFailed}
              </div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1 col-span-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">AI Routing</div>
              <div className="font-medium text-zinc-200">
                global {data.aiModes.global} · cleanup {data.aiModes.cleanup} · ocr {data.aiModes.ocr}
              </div>
              <div className="text-zinc-500">equation {data.aiModes.equation} · graph {data.aiModes.graph}</div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1 col-span-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Local AI (Llama/Ollama)</div>
              <div className={data.localAi.reachable ? "font-medium text-emerald-300" : "font-medium text-amber-300"}>
                {data.localAi.enabled ? (data.localAi.reachable ? "reachable" : "unreachable") : "disabled"} · status {data.localAi.status || 0}
              </div>
              <div className="text-zinc-400">
                {data.localAi.baseUrl} · models {data.localAi.modelCount ?? "?"}
              </div>
              <div className="text-zinc-500">
                text {data.localAi.textModel} · vision {data.localAi.visionModel}
              </div>
            </div>
          </div>

          <div>{data.dirty ? `git dirty (${data.changedFilesCount})` : "git clean"}</div>
          {data.dirty && data.changedFiles.length > 0 ? (
            <div className="max-h-20 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-zinc-300">
              {data.changedFiles.join("\n")}
            </div>
          ) : null}
          {lastUpdated ? <div className="text-zinc-400">updated {lastUpdated}</div> : null}
        </div>
      ) : (
        <div className="text-zinc-300">loading badge...</div>
      )}
    </div>
  );
}
