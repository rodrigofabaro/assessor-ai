"use client";

import { cx } from "@/lib/submissions/utils";

export function IconButton({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
        "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {children}
    </button>
  );
}
