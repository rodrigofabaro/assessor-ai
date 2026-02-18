"use client";

import Link from "next/link";
import { cx } from "@/lib/upload/utils";

export function UploadActions({
  busy,
  canUpload,
  onUpload,
}: {
  busy: boolean;
  canUpload: boolean;
  onUpload: () => Promise<void> | void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button
        onClick={onUpload}
        disabled={!canUpload}
        className={cx(
          "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm",
          canUpload ? "bg-sky-700 text-white hover:bg-sky-800" : "cursor-not-allowed bg-zinc-300 text-zinc-600"
        )}
      >
        {busy ? "Uploading…" : "Upload"}
      </button>

      <Link href="/submissions" className="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
        View submissions
      </Link>

      <Link href="/students" className="inline-flex h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-900 hover:bg-sky-100">
        Manage students
      </Link>
    </div>
  );
}
