"use client";

import { Btn } from "../../components/ui";

export type BriefTabKey = "overview" | "tasks" | "pages" | "versions" | "iv" | "rubric";

export function BriefTabs({ tab, onChange }: { tab: BriefTabKey; onChange: (next: BriefTabKey) => void }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Btn kind={tab === "overview" ? "primary" : "ghost"} onClick={() => onChange("overview")}>
        Overview
      </Btn>
      <Btn kind={tab === "tasks" ? "primary" : "ghost"} onClick={() => onChange("tasks")}>
        Tasks
      </Btn>
      <Btn kind={tab === "pages" ? "primary" : "ghost"} onClick={() => onChange("pages")}>
        Pages
      </Btn>
      <Btn kind={tab === "versions" ? "primary" : "ghost"} onClick={() => onChange("versions")}>
        Versions
      </Btn>
      <Btn kind={tab === "iv" ? "primary" : "ghost"} onClick={() => onChange("iv")}>
        IV
      </Btn>
      <Btn kind={tab === "rubric" ? "primary" : "ghost"} onClick={() => onChange("rubric")}>
        Rubric
      </Btn>
    </div>
  );
}
