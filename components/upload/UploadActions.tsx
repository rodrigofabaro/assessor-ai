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
          canUpload ? "bg-zinc-900 text-white hover:bg-zinc-800" : "cursor-not-allowed bg-zinc-300 text-zinc-600"
        )}
      >
        {busy ? "Uploading…" : "Upload"}
      </button>

      <Link href="/submissions" className="text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700">
        View submissions
      </Link>

      <Link href="/students" className="text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800">
        Manage students
      </Link>
    </div>
  );
}
