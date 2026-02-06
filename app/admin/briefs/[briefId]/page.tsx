"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBriefDetail } from "./briefDetail.logic";
import { TasksTab } from "./components/TasksTab";
import { VersionsTab } from "./components/VersionsTab";
import { OverviewTab } from "./components/OverviewTab";
import { IvTab } from "./components/IvTab";
import { RubricTab } from "./components/RubricTab";
import { BriefHeader } from "./components/BriefHeader";
import { BriefTabs, BriefTabKey } from "./components/BriefTabs";

export default function BriefDetailPage() {
  const params = useParams<{ briefId: string }>();
  const router = useRouter();
  const vm = useBriefDetail(params?.briefId || "");

  const [tab, setTab] = useState<BriefTabKey>("overview");

  return (
    <div className="grid gap-4 min-w-0">
      <BriefHeader vm={vm} onBack={() => router.push("/admin/briefs")}>
        <BriefTabs tab={tab} onChange={setTab} />
      </BriefHeader>

      {!vm.brief ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-700">Brief not found. It may have been deleted or is not linked to a unit.</div>
          <div className="mt-2 text-xs text-zinc-600">
            ID: <span className="font-mono">{params?.briefId}</span>
          </div>
        </section>
      ) : null}

      {vm.brief && tab === "overview" ? <OverviewTab vm={vm} pdfHref={vm.pdfHref} /> : null}

      {vm.brief && tab === "tasks" ? <TasksTab vm={vm} onGoToExtract={() => router.push("/admin/briefs#extract")} /> : null}

      {vm.brief && tab === "versions" ? <VersionsTab vm={vm} /> : null}

      {vm.brief && tab === "iv" ? <IvTab vm={vm} /> : null}

      {vm.brief && tab === "rubric" ? <RubricTab vm={vm} /> : null}
    </div>
  );
}
