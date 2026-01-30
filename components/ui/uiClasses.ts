// components/ui/uiClasses.ts
export const ui = {
  // Primary action buttons (keep the dark look here)
  btnPrimary:
    "inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800",

  btnSecondary:
    "inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50",

  // List row styles (THIS is what you want to soften)
  row:
    "w-full rounded-xl border p-3 text-left transition",

  rowActive:
    "border-zinc-300 bg-zinc-50 text-zinc-900 ring-1 ring-zinc-200",

  rowInactive:
    "border-zinc-200 bg-white hover:bg-zinc-50",
};
