"use client";

import { useEffect } from "react";
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

  const refresh = async () => {
    if (vm.tab === "extract") {
      await rx.refreshAll();
    } else {
      await vm.refresh();
    }
  };

  return (
    <div className="grid gap-4 min-w-0">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
              🧾 Briefs workspace
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">Briefs</h1>
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
            <Btn kind="secondary" onClick={refresh} disabled={busy}>
              Refresh
            </Btn>
            <div className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-600">
              <span className={"h-2 w-2 rounded-full " + (err ? "bg-rose-500" : "bg-emerald-500")} />
              {busy ? "Working…" : "Ready"}
            </div>
          </div>
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
              rx.refreshAll();
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
            rx.refreshAll();
          }}
        />
      ) : null}

      {vm.tab === "extract" ? <BriefExtractWorkbench rx={rx} /> : null}
    </div>
  );
}
