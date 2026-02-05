"use client";

import { Btn } from "../../components/ui";

export function RubricTab() {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Rubric (optional)</h2>
      <p className="mt-1 text-sm text-zinc-700">
        A brief may include a rubric/guidance block. No rubric versioning — just the rubric used for assessment.
      </p>

      <div className="mt-4 rounded-xl border border-zinc-200 p-4">
        <div className="text-sm text-zinc-700">No rubric attached yet.</div>
        <div className="mt-3 flex gap-2">
          <Btn kind="primary" disabled>
            Add rubric (next)
          </Btn>
          <Btn kind="ghost" disabled>
            Import from PDF (later)
          </Btn>
        </div>
      </div>
    </section>
  );
}
