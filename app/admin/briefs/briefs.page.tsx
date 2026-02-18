"use client";

import { useEffect, useState } from "react";
import { useBriefsAdmin } from "./briefs.logic";
import { useReferenceAdmin } from "../reference/reference.logic";

import { Btn } from "./components/ui";
import BriefExtractWorkbench from "./components/BriefExtractWorkbench";
import BriefLibraryTable from "./components/BriefLibraryTable";

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{value}</div>
      <div className="mt-1 text-xs text-zinc-600">{hint}</div>
    </div>
  );
}

export default function AdminBriefsPage() {
  // Library/register VM (your briefs register)
  const vm = useBriefsAdmin();

  // Extract Inbox/Workbench VM (reuses the proven Spec inbox, hard-scoped to BRIEF)
  const rx = useReferenceAdmin({
    context: "briefs",
    fixedInboxType: "BRIEF",
    fixedUploadType: "BRIEF",
  });

  // Keep tab in sync with hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "extract") vm.setTab("extract");
      if (h === "library") vm.setTab("library");
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = vm.tab === "extract" ? !!rx.busy : vm.busy;
  const err = vm.tab === "extract" ? rx.error : vm.error;
  const [refreshing, setRefreshing] = useState(false);
  const totalBriefs = vm.rows.length;
  const lockedBriefs = vm.libraryRows.length;
  const readyBriefs = vm.rows.filter((r) => r.readiness === "READY").length;
  const attentionBriefs = vm.rows.filter((r) => r.readiness === "ATTN" || r.readiness === "BLOCKED").length;
  const mappedDocs = vm.rows.filter((r) => !!r.linkedDoc).length;

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (vm.tab === "extract") {
        await rx.refreshAll({ keepSelection: true });
        if (typeof window !== "undefined") window.location.hash = "extract";
      } else {
        await vm.refresh();
        if (typeof window !== "undefined") window.location.hash = "library";
      }
    } finally {
      setRefreshing(false);
    }
  };
  const onResetFilters = () => rx.resetFilters();

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
      <div className="grid gap-4 min-w-0">
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Briefs</h1>
              <p className="mt-2 text-sm text-zinc-700">
                A <span className="font-semibold">Brief</span> is the assignment question paper + context. A{" "}
                <span className="font-semibold">Spec</span> is the criteria universe (the law). Locking binds a brief to a
                locked spec version for audit-ready grading.
              </p>
              <p className="mt-2 text-xs text-zinc-600">
                Later, submissions link to a locked brief + locked spec, and IV records attach to the brief version.
              </p>
            </div>

          <div className="flex items-center gap-2">
            <Btn kind="secondary" onClick={refresh} disabled={busy || refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Btn>
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              {busy ? "Working..." : "Ready"}
            </span>
          </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Total briefs" value={totalBriefs} hint="Brief rows in the current register." />
            <MetricCard label="Mapped docs" value={mappedDocs} hint="Rows with a linked brief document." />
            <MetricCard label="Ready" value={readyBriefs} hint="Rows that meet readiness policy." />
            <MetricCard label="Attention" value={attentionBriefs} hint="Rows blocked or needing intervention." />
            <MetricCard label="Locked" value={lockedBriefs} hint="Reference-locked briefs in library view." />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Btn
              kind={vm.tab === "library" ? "primary" : "ghost"}
              onClick={() => {
                vm.setTab("library");
                if (typeof window !== "undefined") window.location.hash = "library";
              }}
            >
              Library
            </Btn>
            <Btn
              kind={vm.tab === "extract" ? "primary" : "ghost"}
              onClick={() => {
                vm.setTab("extract");
                if (typeof window !== "undefined") window.location.hash = "extract";
                rx.refreshAll({ keepSelection: true });
              }}
            >
              Extract tools
            </Btn>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{err}</div>
          ) : null}
        </section>

        {vm.tab === "library" ? (
          <BriefLibraryTable
            vm={vm}
            goToInbox={() => {
              vm.setTab("extract");
              if (typeof window !== "undefined") window.location.hash = "extract";
              rx.refreshAll({ keepSelection: true });
            }}
          />
        ) : null}

        {vm.tab === "extract" ? <BriefExtractWorkbench rx={rx} onResetFilters={onResetFilters} /> : null}
      </div>
    </div>
  );
}
