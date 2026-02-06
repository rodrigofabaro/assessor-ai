"use client";

import { ui } from "@/components/ui/uiClasses";

export function Pill({ cls, children }: { cls: string; children: any }) {
  return <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " + cls}>{children}</span>;
}

export function Btn({
  kind,
  children,
  onClick,
  disabled,
}: {
  kind: "primary" | "secondary" | "ghost";
  children: any;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls =
    kind === "primary"
      ? ui.btnPrimary
      : kind === "secondary"
      ? ui.btnSecondary
      : "inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="mt-0.5 break-words text-sm font-semibold text-zinc-900">{value || "-"}</div>
    </div>
  );
}
