"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
  diagnostics: {
    pollHintMs: number;
    recentErrors: Array<{
      ts: number;
      source: string;
      message: string;
    }>;
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
  const [position, setPosition] = useState<"right" | "left">("right");
  const [clickThrough, setClickThrough] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotStatus, setScreenshotStatus] = useState("");
  const [uploadedShots, setUploadedShots] = useState<Array<{ name: string; path: string }>>([]);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);

  const MIN_KEY = "assessor.devBadge.minimized";
  const EXP_KEY = "assessor.devBadge.expanded";
  const POS_KEY = "assessor.devBadge.position";
  const CLICK_KEY = "assessor.devBadge.clickThrough";
  const AUTO_MIN_IDLE_MS = 3 * 60 * 1000;

  useEffect(() => {
    try {
      const m = window.localStorage.getItem(MIN_KEY);
      const e = window.localStorage.getItem(EXP_KEY);
      const p = window.localStorage.getItem(POS_KEY);
      const c = window.localStorage.getItem(CLICK_KEY);
      if (m === "1") setMinimized(true);
      if (e === "1") setExpanded(true);
      if (p === "left" || p === "right") setPosition(p);
      if (c === "1") setClickThrough(true);
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
    try {
      window.localStorage.setItem(POS_KEY, position);
    } catch {}
  }, [position]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLICK_KEY, clickThrough ? "1" : "0");
    } catch {}
  }, [clickThrough]);

  useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;
    let failBackoffMs = 0;

    const fetchBuildInfo = async () => {
      let nextHintMs = 15000;
      try {
        const res = await fetch("/api/dev/build-info", { cache: "no-store" });
        if (!res.ok) throw new Error("build-info unavailable");
        const json = (await res.json()) as BuildInfo | BuildInfoError;
        if (!cancelled) {
          if (!isBuildInfo(json)) {
            setData(null);
            setApiError(json.error || "unknown error");
            failBackoffMs = Math.min(failBackoffMs ? failBackoffMs * 2 : 20000, 90000);
          } else {
            setData(json);
            setApiError(null);
            failBackoffMs = 0;
            nextHintMs = Math.max(5000, Number(json.diagnostics?.pollHintMs || 15000));
          }
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
        failBackoffMs = Math.min(failBackoffMs ? failBackoffMs * 2 : 20000, 90000);
      } finally {
        if (cancelled) return;
        const hiddenHint = document.hidden ? 60000 : 0;
        const nextMs = Math.max(failBackoffMs || nextHintMs, hiddenHint || 0, 5000);
        if (timerId !== null) window.clearTimeout(timerId);
        timerId = window.setTimeout(fetchBuildInfo, nextMs);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) return;
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(fetchBuildInfo, 1000);
    };

    fetchBuildInfo();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
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
  const statusFlag = offline || apiError ? "[!]" : activeWorkCount > 0 ? "[~]" : "[OK]";
  const dockClass = position === "right" ? "right-3" : "left-3";

  function formatUptime(totalSec: number) {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  useEffect(() => {
    if (minimized) return;
    if (!data) return;
    if (isAttention) return;
    if (activeWorkCount > 0) return;
    const t = window.setTimeout(() => setMinimized(true), AUTO_MIN_IDLE_MS);
    return () => window.clearTimeout(t);
  }, [AUTO_MIN_IDLE_MS, activeWorkCount, data, isAttention, minimized]);

  useEffect(() => {
    if (!copyMsg) return;
    const t = window.setTimeout(() => setCopyMsg(""), 1400);
    return () => window.clearTimeout(t);
  }, [copyMsg]);

  async function copyDiagnostics() {
    if (!data) return;
    const lines = [
      `status=${statusLabel}`,
      `branch=${data.branch}`,
      `commit=${data.commit}`,
      `dirty=${data.dirty}`,
      `queue=runs:${data.queue.extractionRunsRunning},extract:${data.queue.submissionsExtracting},assess:${data.queue.submissionsAssessing},failed:${data.queue.submissionsFailed}`,
      `localAi=enabled:${data.localAi.enabled},reachable:${data.localAi.reachable},status:${data.localAi.status},base:${data.localAi.baseUrl}`,
      `aiMode=global:${data.aiModes.global},cleanup:${data.aiModes.cleanup},ocr:${data.aiModes.ocr},equation:${data.aiModes.equation},graph:${data.aiModes.graph}`,
      `updated=${new Date(data.timestamp).toISOString()}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyMsg("Copied");
    } catch {
      setCopyMsg("Copy failed");
    }
  }

  async function uploadScreenshotFile(file: File) {
    if (!file) return;
    setScreenshotBusy(true);
    setScreenshotStatus("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (typeof window !== "undefined") {
        const page = String(window.location.pathname || "").trim();
        if (page) fd.set("documentId", page);
      }
      const res = await fetch("/api/dev/screenshot", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScreenshotStatus(data?.message || data?.error || "Failed to upload screenshot.");
        return;
      }
      const savedName = String(data?.savedName || file.name);
      const savedPath = String(data?.savedPath || "");
      setUploadedShots((prev) => [{ name: savedName, path: savedPath }, ...prev].slice(0, 5));
      setScreenshotStatus(`Saved: ${savedName}`);
    } catch (e: any) {
      setScreenshotStatus(e?.message || "Failed to upload screenshot.");
    } finally {
      setScreenshotBusy(false);
    }
  }

  async function handleScreenshotInput(e: any) {
    const file = e?.target?.files?.[0];
    if (file) await uploadScreenshotFile(file);
    if (e?.target) e.target.value = "";
  }

  async function handlePasteScreenshot(e: any) {
    const items = Array.from((e?.clipboardData?.items || []) as DataTransferItem[]);
    const imageItem = items.find((it) => String(it?.type || "").startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) await uploadScreenshotFile(file);
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className={`fixed bottom-3 ${dockClass} z-[1000] pointer-events-auto inline-flex h-8 items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-950/58 px-2.5 text-[11px] font-semibold text-zinc-100 shadow-sm backdrop-blur hover:bg-zinc-900/70`}
        title="Show developer status"
      >
        <span className={`h-2 w-2 rounded-full ${statusDot}`} />
        {statusFlag} Dev
      </button>
    );
  }

  return (
    <div className={`fixed bottom-3 ${dockClass} z-[1000] ${clickThrough ? "pointer-events-none" : "pointer-events-auto"}`}>
      <div className="w-[240px] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-700/70 bg-zinc-950/62 p-1.5 text-[11px] leading-4 text-zinc-100 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${statusDot}`} />
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-200">
          {statusFlag} Dev Runtime
        </div>
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

      <div className="mt-1 flex flex-wrap items-center justify-end gap-1 pointer-events-auto">
        <input
          ref={screenshotInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleScreenshotInput}
        />
        <button
          type="button"
          onClick={() => screenshotInputRef.current?.click()}
          disabled={screenshotBusy}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-60"
          title="Upload screenshot"
        >
          {screenshotBusy ? "Uploading..." : "Shot"}
        </button>
        <button
          type="button"
          onClick={() => setPosition((v) => (v === "right" ? "left" : "right"))}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
          title="Toggle badge side"
        >
          {position === "right" ? "Left" : "Right"}
        </button>
        <button
          type="button"
          onClick={() => setClickThrough((v) => !v)}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
          title="Pass clicks through info area"
        >
          {clickThrough ? "Interactive" : "Pass-through"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
        >
          {expanded ? "Less" : "More"}
        </button>
        <button
          type="button"
          onClick={copyDiagnostics}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
        >
          {copyMsg || "Copy"}
        </button>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="inline-flex h-6 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
        >
          Minimize
        </button>
      </div>

      <div
        onPaste={handlePasteScreenshot}
        tabIndex={0}
        className="mt-1 rounded-md border border-dashed border-zinc-700 bg-zinc-900/55 px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-sky-400"
        title="Click then paste screenshot (Ctrl+V)"
      >
        Paste screenshot here (Ctrl+V).
      </div>
      {screenshotStatus ? <div className="mt-1 text-[10px] text-sky-300">{screenshotStatus}</div> : null}
      {uploadedShots.length ? (
        <div className="mt-1 max-h-20 overflow-auto rounded-md border border-zinc-700 bg-zinc-900/55 px-2 py-1 text-[10px]">
          {uploadedShots.map((shot, idx) => (
            <div key={`${shot.path}-${idx}`} className="mb-1 flex items-center gap-1.5 last:mb-0">
              <div className="min-w-0 flex-1 truncate text-zinc-300">
                {shot.name}
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shot.path);
                    setScreenshotStatus(`Copied path: ${shot.name}`);
                  } catch {
                    setScreenshotStatus("Failed to copy screenshot path.");
                  }
                }}
                className="inline-flex h-5 items-center rounded border border-zinc-700 px-1.5 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      ) : null}

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
          {data.diagnostics?.recentErrors?.length ? (
            <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Recent Errors</div>
              <div className="mt-1 grid gap-1">
                {data.diagnostics.recentErrors.slice(0, 3).map((e, idx) => (
                  <div key={`${e.ts}-${idx}`} className="text-[10px] text-zinc-300">
                    [{new Date(e.ts).toLocaleTimeString()}] {e.source}: {e.message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {data.dirty && data.changedFiles.length > 0 ? (
            <div className="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 font-mono text-[10px] text-zinc-300">
              {data.changedFiles.join("\n")}
            </div>
          ) : null}
          <Link
            href="/admin/settings#ai-usage"
            className="pointer-events-auto inline-flex h-6 items-center justify-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
          >
            Open full diagnostics
          </Link>
        </div>
      ) : null}
      </div>
    </div>
  );
}
