"use client";

import { useEffect, useMemo, useState } from "react";
import { useBriefsAdmin } from "./briefs.logic";
import { useReferenceAdmin } from "../reference/reference.logic";

import { Btn } from "./components/ui";
import BriefExtractWorkbench from "./components/BriefExtractWorkbench";
import BriefLibraryTable from "./components/BriefLibraryTable";

export default function AdminBriefsPage() {
  // Library/register VM (your briefs register)
  const vm = useBriefsAdmin();

  // Extract Inbox/Workbench VM (reuses the proven Spec inbox, hard-scoped to BRIEF)
  const rx = useReferenceAdmin({
    context: "briefs",
    fixedInboxType: "BRIEF",
    fixedUploadType: "BRIEF",
  });

  // Keep tab in sync with URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUrlState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "extract" || tab === "library") {
        vm.setTab(tab);
        return;
      }
      const h = window.location.hash.replace("#", "");
      if (h === "extract" || h === "library") vm.setTab(h);
    };
    window.addEventListener("hashchange", onUrlState);
    onUrlState();
    return () => window.removeEventListener("hashchange", onUrlState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", vm.tab);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [vm.tab]);

  const busy = vm.tab === "extract" ? !!rx.busy : vm.busy;
  const err = vm.tab === "extract" ? rx.error : vm.error;
  const [refreshing, setRefreshing] = useState(false);
  const totalBriefs = vm.rows.length;
  const lockedBriefs = vm.libraryRows.length;
  const readyBriefs = vm.rows.filter((r) => r.readiness === "READY").length;
  const attentionBriefs = vm.rows.filter((r) => r.readiness === "ATTN").length;
  const blockedBriefs = vm.rows.filter((r) => r.readiness === "BLOCKED").length;
  const mappedDocs = vm.rows.filter((r) => !!r.linkedDoc).length;
  const missingIv = vm.rows.filter((r) => !!r.linkedDoc && !r.ivForYear).length;

  const nextAction = useMemo(() => {
    if (blockedBriefs > 0) return "Resolve blocked briefs in Extract tools before locking decisions.";
    if (attentionBriefs > 0) return `Clear attention items for ${attentionBriefs} brief${attentionBriefs === 1 ? "" : "s"}.`;
    if (mappedDocs < totalBriefs) return "Map remaining briefs to uploaded documents.";
    return "Brief register is healthy. Continue locking and audit checks.";
  }, [attentionBriefs, blockedBriefs, mappedDocs, totalBriefs]);

  const goToTab = (tab: "library" | "extract") => {
    vm.setTab(tab);
    if (typeof window !== "undefined") window.location.hash = tab;
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (vm.tab === "extract") {
        await rx.refreshAll({ keepSelection: true });
        goToTab("extract");
      } else {
        await vm.refresh();
        goToTab("library");
      }
    } finally {
      setRefreshing(false);
    }
  };
  const onResetFilters = () => rx.resetFilters();

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
      <div className="grid gap-4 min-w-0">
        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Briefs</h1>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                Workspace
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn kind="secondary" onClick={refresh} disabled={busy || refreshing}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </Btn>
              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                {busy ? "Working..." : "Ready"}
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {[
              ["Total", totalBriefs],
              ["Mapped docs", mappedDocs],
              ["Ready", readyBriefs],
              ["Attention", attentionBriefs],
              ["Blocked", blockedBriefs],
              ["Locked", lockedBriefs],
              ["Health", `IV missing ${missingIv}`],
            ].map(([label, value]) => (
              <span
                key={String(label)}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-700"
              >
                <span className="text-zinc-500">{label}</span>
                <span className="text-zinc-900">{value}</span>
              </span>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <span className="font-semibold text-zinc-900">Next best action:</span> {nextAction}
            {blockedBriefs > 0 || attentionBriefs > 0 ? (
              <button
                type="button"
                onClick={() => goToTab("extract")}
                className="ml-2 inline-flex rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
              >
                Open extract tools
              </button>
            ) : null}
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{err}</div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <Btn
              kind={vm.tab === "library" ? "primary" : "ghost"}
              onClick={() => {
                goToTab("library");
              }}
              className={vm.tab === "library" ? "!bg-emerald-700 hover:!bg-emerald-800" : ""}
            >
              Library
            </Btn>
            <Btn
              kind={vm.tab === "extract" ? "primary" : "ghost"}
              onClick={() => {
                goToTab("extract");
                rx.refreshAll({ keepSelection: true });
              }}
              className={vm.tab === "extract" ? "!bg-emerald-700 hover:!bg-emerald-800" : ""}
            >
              Extract
            </Btn>
          </div>
        </section>

        {vm.tab === "library" ? (
          <BriefLibraryTable
            vm={vm}
            goToInbox={() => {
              goToTab("extract");
              rx.refreshAll({ keepSelection: true });
            }}
          />
        ) : null}

        {vm.tab === "extract" ? (
          <BriefExtractWorkbench
            rx={rx}
            onResetFilters={onResetFilters}
            onLockSuccess={async () => {
              await vm.refresh();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
