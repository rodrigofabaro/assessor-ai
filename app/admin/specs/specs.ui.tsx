"use client";

import { LoCriteriaGrid } from "@/components/spec/LoCriteriaGrid";
import { badge, type ReferenceDocument } from "../reference/reference.logic";

export function StatusPill({ status }: { status: ReferenceDocument["status"] }) {
  const b = badge(status);
  return <span className={"inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " + b.cls}>{b.text}</span>;
}

export function SpecList(props: {
  documents: ReferenceDocument[];
  selectedDocId: string;
  onSelect: (id: string) => void;
  q: string;
  status: string;
  onQueryChange: (next: string) => void;
  onStatusChange: (next: string) => void;
  counts: { shown: number; total: number };
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Units list</h2>
      <div className="mt-3 grid gap-2">
        <input
          value={props.q}
          onChange={(e) => props.onQueryChange(e.target.value)}
          placeholder="Search title, filename, unit code…"
          className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
        />
        <select
          value={props.status}
          onChange={(e) => props.onStatusChange(e.target.value)}
          className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="UPLOADED">UPLOADED</option>
          <option value="EXTRACTED">EXTRACTED</option>
          <option value="REVIEWED">REVIEWED</option>
          <option value="LOCKED">LOCKED</option>
          <option value="FAILED">FAILED</option>
        </select>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Showing {props.counts.shown} of {props.counts.total}
        </div>
      </div>

      <div className="mt-3 grid max-h-[60vh] gap-2 overflow-auto pr-1">
        {props.documents.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No specs yet. Upload a spec to begin.</div>
        ) : (
          props.documents.map((d) => {
            const active = props.selectedDocId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => props.onSelect(d.id)}
                className={
                  "rounded-xl border p-3 text-left " +
                  (active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50")
                }
              >
                <StatusPill status={d.status} />
                <div className="mt-2 text-sm font-semibold">{d.title}</div>
                <div className={"mt-1 text-xs " + (active ? "text-zinc-200" : "text-zinc-500")}>v{d.version}</div>
              </button>
            );
          })
        )}
      </div>
    </article>
  );
}

export function UnitEditorPanel({ selectedDoc, learningOutcomes }: { selectedDoc: ReferenceDocument | null; learningOutcomes: any[] }) {
  const issue = selectedDoc?.sourceMeta?.specIssue || selectedDoc?.sourceMeta?.specVersionLabel || selectedDoc?.extractedJson?.unit?.specIssue || "—";

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
      <h2 className="text-sm font-semibold">Unit metadata</h2>
      {!selectedDoc ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">Select a unit to inspect metadata.</div>
      ) : (
        <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          <div>
            <span className="text-zinc-500">Title:</span> <span className="font-semibold text-zinc-900">{selectedDoc.title}</span>
          </div>
          <div>
            <span className="text-zinc-500">Issue:</span> <span className="font-semibold text-zinc-900">{issue}</span>
          </div>
          <div>
            <span className="text-zinc-500">LO count:</span> <span className="font-semibold text-zinc-900">{learningOutcomes.length}</span>
          </div>
        </div>
      )}
    </article>
  );
}

export function SpecViewer({ selectedDoc, learningOutcomes }: { selectedDoc: ReferenceDocument | null; learningOutcomes: any[] }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
      <h2 className="text-sm font-semibold">Spec viewer</h2>
      {!selectedDoc ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">Select a unit to view extracted LO/AC.</div>
      ) : learningOutcomes.length ? (
        <div className="mt-3 max-h-[68vh] overflow-auto pr-1">
          <LoCriteriaGrid learningOutcomes={learningOutcomes} />
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No extracted structure yet. Click Extract to generate LO/AC.</div>
      )}
    </article>
  );
}
