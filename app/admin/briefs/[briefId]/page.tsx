"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBriefDetail } from "./briefDetail.logic";

import { Btn, Pill } from "../components/ui";
import { tone, statusTone } from "./components/briefStyles";

import { OverviewTab } from "./components/OverviewTab";
import { VersionsTab } from "./components/VersionsTab";
import { TasksTab } from "./components/TasksTab";
import { IvTab } from "./components/IvTab";
import { RubricTab } from "./components/RubricTab";

export default function BriefDetailPage() {
  const params = useParams<{ briefId: string }>();
  const router = useRouter();
  const vm = useBriefDetail(params?.briefId || "");

  const [tab, setTab] = useState<"overview" | "versions" | "tasks" | "iv" | "rubric">("overview");

  const title = useMemo(() => {
    if (!vm.brief) return "Brief detail";
    return `${vm.brief.unit?.unitCode || ""} ${vm.brief.assignmentCode} — ${vm.brief.title}`;
  }, [vm.brief]);

  const pdfHref = vm.linkedDoc ? `/api/reference-documents/${vm.linkedDoc.id}/file` : "";

  return (
    <div className="grid gap-4 min-w-0">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate">{title}</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Inspector for a single brief. Versions, PDF link, and QA fields live here — not on the library page.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Btn kind="ghost" onClick={() => router.push("/admin/briefs")}>
              Back to briefs
            </Btn>

            {vm.linkedDoc ? (
              <a
                href={pdfHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
              >
                Open PDF
              </a>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 opacity-50 cursor-not-allowed">
                Open PDF
              </span>
            )}

            <Btn kind="primary" onClick={vm.refresh} disabled={vm.busy}>
              Refresh
            </Btn>

            <div className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-600">
              <span className={"h-2 w-2 rounded-full " + (vm.error ? "bg-rose-500" : "bg-emerald-500")} />
              {vm.busy ? "Working…" : "Ready"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn kind={tab === "overview" ? "primary" : "ghost"} onClick={() => setTab("overview")}>
            Overview
          </Btn>
          <Btn kind={tab === "versions" ? "primary" : "ghost"} onClick={() => setTab("versions")}>
            Versions
          </Btn>
          <Btn kind={tab === "tasks" ? "primary" : "ghost"} onClick={() => setTab("tasks")}>
            Tasks
          </Btn>
          <Btn kind={tab === "iv" ? "primary" : "ghost"} onClick={() => setTab("iv")}>
            IV
          </Btn>
          <Btn kind={tab === "rubric" ? "primary" : "ghost"} onClick={() => setTab("rubric")}>
            Rubric
          </Btn>
        </div>

        {vm.error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{vm.error}</div>
        ) : null}
      </header>

      {!vm.brief ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-700">Brief not found. It may have been deleted or is not linked to a unit.</div>
          <div className="mt-2 text-xs text-zinc-600">
            ID: <span className="font-mono">{params?.briefId}</span>
          </div>
        </section>
      ) : null}

      {vm.brief ? (
        <>
          {tab === "overview" ? <OverviewTab vm={vm} pdfHref={pdfHref} /> : null}
          {tab === "versions" ? <VersionsTab vm={vm} /> : null}
          {tab === "tasks" ? <TasksTab vm={vm} /> : null}
          {tab === "iv" ? <IvTab vm={vm} /> : null}
          {tab === "rubric" ? <RubricTab /> : null}
        </>
      ) : null}
    </div>
  );
}
