"use client";

import { ReactNode } from "react";
import { Btn } from "../../components/ui";

export function BriefHeader({ vm, onBack, children }: { vm: any; onBack: () => void; children?: ReactNode }) {
  const usage = vm.docUsage;
  const usageLoading = vm.usageLoading;

  return (
    <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">{vm.title}</h1>
          <p className="mt-1 text-sm text-zinc-700">
            Inspector for a single brief. Versions, PDF link, and QA fields live here — not on the library page.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Btn kind="ghost" onClick={onBack}>
            Back to briefs
          </Btn>

          <a
            href={vm.pdfHref}
            target="_blank"
            rel="noreferrer"
            className={
              "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50" +
              (!vm.linkedDoc ? " opacity-50 cursor-not-allowed pointer-events-none" : "")
            }
          >
            Open PDF
          </a>

          <button
            type="button"
            onClick={vm.unlockLinkedDoc}
            disabled={!vm.canUnlock}
            title={
              usageLoading
                ? "Checking usage…"
                : !vm.linkedDoc?.lockedAt
                  ? "Brief PDF is not locked."
                  : usage?.inUse
                    ? "This brief has submissions attached and cannot be unlocked."
                    : ""
            }
            className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Unlock
          </button>

          <button
            type="button"
            onClick={vm.deleteLinkedDoc}
            disabled={!vm.canDelete}
            title={
              usageLoading
                ? "Checking usage…"
                : vm.linkedDoc?.lockedAt
                  ? "Locked briefs cannot be deleted. Unlock first."
                  : usage?.inUse
                    ? "This brief has submissions attached and cannot be deleted."
                    : ""
            }
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete
          </button>

          <Btn kind="primary" onClick={vm.refresh} disabled={vm.busy}>
            Refresh
          </Btn>

          <div className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-600">
            <span className={"h-2 w-2 rounded-full " + (vm.error ? "bg-rose-500" : "bg-emerald-500")} />
            {vm.busy ? "Working…" : "Ready"}
          </div>
        </div>
      </div>

      {children}
      {vm.error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{vm.error}</div>
      ) : null}
    </header>
  );
}
