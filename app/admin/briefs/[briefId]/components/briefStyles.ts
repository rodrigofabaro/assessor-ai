"use client";

export function tone(kind: "ok" | "warn" | "bad" | "info" | "muted") {
  switch (kind) {
    case "ok":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "warn":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    case "bad":
      return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
    case "info":
      return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
    default:
      return "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200";
  }
}

export function statusTone(s: string) {
  const u = (s || "").toUpperCase();
  if (u.includes("LOCK")) return tone("ok");
  if (u.includes("FAIL") || u.includes("ERROR")) return tone("bad");
  if (u.includes("MAP") || u.includes("RUN")) return tone("info");
  if (u.includes("DRAFT") || u.includes("PEND") || u.includes("UPLOADED")) return tone("warn");
  return tone("muted");
}
