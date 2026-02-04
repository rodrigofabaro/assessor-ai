"use client";

export function Pill({ cls, children }: { cls: string; children: any }) {
  return <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " + cls}>{children}</span>;
}

export function Btn({
  kind,
  children,
  onClick,
  disabled,
}: {
  kind: "primary" | "ghost";
  children: any;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls =
    kind === "primary"
      ? "rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900"
      : "rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-50";
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
