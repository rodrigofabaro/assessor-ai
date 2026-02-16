"use client";

import { LoCriteriaGrid } from "@/components/spec/LoCriteriaGrid";
import { badge, type ReferenceDocument } from "../reference/reference.logic";

function pickIssueLabel(doc: ReferenceDocument | null) {
  if (!doc) return "";
  return (
    doc.sourceMeta?.specIssue ||
    doc.sourceMeta?.specVersionLabel ||
    doc.extractedJson?.unit?.specIssue ||
    doc.extractedJson?.unit?.specVersionLabel ||
    ""
  );
}

function pickUnitIdentity(doc: ReferenceDocument | null) {
  if (!doc) return { unitCode: "", unitTitle: "", unitCodeQualifier: "" };
  const unitCode = doc.sourceMeta?.unitCode || doc.extractedJson?.unit?.unitCode || "";
  const unitTitle = doc.sourceMeta?.unitTitle || doc.extractedJson?.unit?.unitTitle || "";
  const unitCodeQualifier = doc.extractedJson?.unit?.unitCodeQualifier || doc.sourceMeta?.unitCodeQualifier || "";
  return { unitCode, unitTitle, unitCodeQualifier };
}

function formatUnitTitle(doc: ReferenceDocument | null) {
  const { unitCode, unitTitle } = pickUnitIdentity(doc);
  if (unitCode && unitTitle) return `${unitCode} — ${unitTitle}`;
  if (unitTitle) return unitTitle;
  return doc?.title || "Untitled spec";
}

function formatIssueLabel(label: string) {
  if (!label) return "";
  return /^issue\b/i.test(label.trim()) ? label.trim() : `Issue ${label.trim()}`;
}

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
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Specification list</h2>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
          {props.counts.shown}/{props.counts.total}
        </span>
      </div>
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
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No specifications found. Upload a PDF to begin.</div>
        ) : (
          props.documents.map((d) => {
            const active = props.selectedDocId === d.id;
            const issueLabel = formatIssueLabel(pickIssueLabel(d));
            const title = formatUnitTitle(d);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => props.onSelect(d.id)}
                className={
                  "rounded-xl border p-3 text-left transition " +
                  (active
                    ? "border-zinc-300 bg-zinc-50 text-zinc-900 ring-1 ring-zinc-200"
                    : "border-zinc-200 bg-white hover:bg-zinc-50")
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <StatusPill status={d.status} />
                  <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                    v{d.version}
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold">{title}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {issueLabel ? issueLabel : "Issue not set"}
                </div>
                <div className="mt-2 text-[11px] text-zinc-500">
                  Uploaded {new Date(d.uploadedAt).toLocaleDateString()}
                </div>
              </button>
            );
          })
        )}
      </div>
    </article>
  );
}

export function UnitEditorPanel({ selectedDoc, learningOutcomes }: { selectedDoc: ReferenceDocument | null; learningOutcomes: any[] }) {
  const issue = formatIssueLabel(pickIssueLabel(selectedDoc)) || "—";
  const { unitCodeQualifier } = pickUnitIdentity(selectedDoc);
  const criteriaCount = learningOutcomes.reduce(
    (acc, lo) => acc + (Array.isArray(lo?.criteria) ? lo.criteria.length : 0),
    0
  );

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <h2 className="text-sm font-semibold">Unit metadata</h2>
      {!selectedDoc ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">Select a unit to inspect metadata.</div>
      ) : (
        <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          <div>
            <span className="text-zinc-500">Title:</span> <span className="font-semibold text-zinc-900">{selectedDoc.title}</span>
          </div>
          <div>
            <span className="text-zinc-500">Unit:</span>{" "}
            <span className="font-semibold text-zinc-900">{formatUnitTitle(selectedDoc)}</span>
          </div>
          {unitCodeQualifier ? (
            <div>
              <span className="text-zinc-500">Unit code (qual):</span>{" "}
              <span className="font-semibold text-zinc-900">{unitCodeQualifier}</span>
            </div>
          ) : null}
          <div>
            <span className="text-zinc-500">Issue:</span> <span className="font-semibold text-zinc-900">{issue}</span>
          </div>
          <div>
            <span className="text-zinc-500">LO count:</span> <span className="font-semibold text-zinc-900">{learningOutcomes.length}</span>
          </div>
          <div>
            <span className="text-zinc-500">Criteria count:</span> <span className="font-semibold text-zinc-900">{criteriaCount}</span>
          </div>
        </div>
      )}
    </article>
  );
}

export function SpecViewer({ selectedDoc, learningOutcomes }: { selectedDoc: ReferenceDocument | null; learningOutcomes: any[] }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <h2 className="text-sm font-semibold">Specification preview</h2>
      {!selectedDoc ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">Select a specification to view extracted learning outcomes and criteria.</div>
      ) : learningOutcomes.length ? (
        <div className="mt-3 max-h-[68vh] overflow-auto pr-1">
          <LoCriteriaGrid learningOutcomes={learningOutcomes} />
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No extracted structure available. Run Extract to generate learning outcomes and criteria.</div>
      )}
    </article>
  );
}
