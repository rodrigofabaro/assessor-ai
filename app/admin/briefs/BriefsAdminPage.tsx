"use client";

import { useState } from "react";
import { useReferenceAdmin } from "../reference/reference.logic";
import PageContainer from "@/components/PageContainer";

export default function BriefsAdminPage() {
  const [tab, setTab] = useState<"library" | "extract">("extract");

  const vm = useReferenceAdmin({
    context: "briefs",
    fixedInboxType: "BRIEF",
    fixedUploadType: "BRIEF",
  });

  return (
    <PageContainer fullWidth>
      <div className="grid gap-6 min-w-0">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Briefs</h1>
              <p className="mt-1 text-sm text-zinc-700">Manage brief extraction and lock-ready review so assignments stay mapped to authoritative specs.</p>
            </div>
            <button
              type="button"
              onClick={() => vm.refreshAll()}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("library")}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold border " +
                (tab === "library" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
              }
            >
              Library
            </button>
            <button
              type="button"
              onClick={() => setTab("extract")}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold border " +
                (tab === "extract" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
              }
            >
              Extract tools
            </button>
            <div className="ml-auto text-xs text-zinc-600">{vm.busy ? `⏳ ${vm.busy}` : "Ready"}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0 text-sm text-zinc-700">
          {tab === "library"
            ? "Brief library viewer lands next (titles, A-code, linked unit issue, mapped criteria, versions)."
            : "Open a BRIEF document from the inbox to review mapping and lock."}
        </section>
      </div>
    </PageContainer>
  );
}
