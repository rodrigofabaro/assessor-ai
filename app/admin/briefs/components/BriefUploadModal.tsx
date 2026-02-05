"use client";

import { useMemo, useRef, useState } from "react";

export default function BriefUploadModal({ rx, onClose }: { rx: any; onClose: () => void }) {
  // Local state for form fields
  const [docTitle, setDocTitle] = useState("");
  const [docVersion, setDocVersion] = useState("1.0");

  // Track file selection in state (avoid reading ref.current during render)
  const [hasFile, setHasFile] = useState(false);

  // Local DOM ref for the file input (used only inside handlers)
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive busy from rx WITHOUT effects (this avoids react-hooks/set-state-in-effect)
  const busyLabel = useMemo(() => {
    return (rx?.busy?.current ?? rx?.busy ?? null) as string | null;
  }, [rx]);

  const isBusy = !!busyLabel;

  const handleUpload = async () => {
    if (isBusy) return;

    const file = fileInputRef.current?.files?.[0] || null;

    await rx.uploadDoc({
      title: docTitle,
      version: docVersion,
      file,
    });

    await rx.refreshAll?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/30"
        onClick={() => (isBusy ? null : onClose())}
        aria-label="Close upload modal"
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="text-sm font-semibold">Upload brief</div>

          <button
            type="button"
            onClick={() => (isBusy ? null : onClose())}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Title</span>
            <input
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="e.g. U4015 A1 — PLC Design, Operation, and Program Design"
              className="h-10 rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Version</span>
              <input
                value={docVersion}
                onChange={(e) => setDocVersion(e.target.value)}
                className="h-10 rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium">File</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => setHasFile(!!e.target.files?.length)}
                className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
              />
            </label>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isBusy || !docTitle || !hasFile}
              className={
                "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm transition-colors " +
                (isBusy || !docTitle || !hasFile
                  ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                  : "bg-zinc-900 text-white hover:bg-zinc-800")
              }
            >
              {isBusy ? "Uploading..." : "Upload"}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
            >
              Cancel
            </button>

            <div className="ml-auto text-xs text-zinc-600">{busyLabel ? `⏳ ${busyLabel}` : "Ready"}</div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            Uploads go to the <span className="font-semibold">Brief Inbox</span>. Next: Extract → review header/mapping → Lock.
          </div>
        </div>
      </div>
    </div>
  );
}
