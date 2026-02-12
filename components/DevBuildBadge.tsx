"use client";

import { useEffect, useState } from "react";

type BuildInfo = {
  branch: string;
  commit: string;
  dirty: boolean;
  changedFilesCount: number;
  changedFiles: string[];
  timestamp: number;
};

type BuildInfoError = {
  ok: false;
  error: string;
};

export default function DevBuildBadge() {
  const [data, setData] = useState<BuildInfo | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchBuildInfo = async () => {
      try {
        const res = await fetch("/api/dev/build-info", { cache: "no-store" });
        if (!res.ok) throw new Error("build-info unavailable");
        const json = (await res.json()) as BuildInfo | BuildInfoError;
        if (!cancelled) {
          if ("ok" in json && json.ok === false) {
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

    fetchBuildInfo();
    const intervalId = window.setInterval(fetchBuildInfo, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const lastUpdated = data ? new Date(data.timestamp).toLocaleTimeString() : null;

  return (
    <div className="fixed bottom-3 right-3 z-[1000] max-w-[320px] rounded-md border border-zinc-300 bg-zinc-950/90 px-3 py-2 text-[11px] leading-4 text-zinc-100 shadow-lg">
      {offline ? (
        <div className="font-medium text-amber-300">badge offline</div>
      ) : apiError ? (
        <div className="space-y-0.5">
          <div className="font-semibold text-amber-300">badge error</div>
          <div className="text-zinc-300">{apiError}</div>
        </div>
      ) : data ? (
        <div className="space-y-0.5">
          <div className="font-semibold">
            {data.branch} @ {data.commit}
          </div>
          <div>{data.dirty ? `dirty (${data.changedFilesCount})` : "clean"}</div>
          {data.dirty && data.changedFiles.length > 0 ? (
            <div className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-zinc-200">
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
