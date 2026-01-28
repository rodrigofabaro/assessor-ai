"use client";

import { cx } from "@/lib/submissions/utils";

export function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700">
      {children}
    </span>
  );
}

export function ActionPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "neutral";
  children: string;
}) {
  const base = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold";
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-zinc-200 bg-white text-zinc-700";
  return <span className={cx(base, cls)}>{children}</span>;
}
