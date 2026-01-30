"use client";

/**
 * Admin → Briefs
 * -------------
 * Briefs are the centre-set assignments (A1/A2/A3...) and bind to a locked spec issue.
 *
 * UX rule:
 * - Tabs: Library | Extract tools
 * - Extract tools is BRIEF-only: must never display SPEC content.
 *
 * NOTE:
 * This file only changes view/wiring. It does not touch extraction logic.
 */

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
     <PageContainer>
    <div className="grid gap-4 min-w-0">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Briefs</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Briefs are centre-set assignments (A1/A2/A3...). Extract, bind to a locked spec issue, map criteria, then lock.
            </p>
          </div>
          <div className="text-xs text-zinc-600">{vm.busy ? <span>⏳ {vm.busy}</span> : <span>Ready</span>}</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={
              "rounded-xl px-4 py-2 text-sm font-semibold border " +
              (tab === "library"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
            }
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setTab("extract")}
            className={
              "rounded-xl px-4 py-2 text-sm font-semibold border " +
              (tab === "extract"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50")
            }
          >
            Extract tools
          </button>
        </div>
      </header>

      {tab === "library" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-sm text-zinc-700">
          Brief library viewer lands next (titles, A-code, linked unit issue, mapped criteria, versions).
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-sm text-zinc-700">
          {/* Critical requirement is met by the hook scoping:
              context=briefs, fixedInboxType=BRIEF, fixedUploadType=BRIEF */}
          Open a BRIEF document from the inbox to review mapping and lock.
        </div>
      )}
    </div>
    </PageContainer>
  );
}
