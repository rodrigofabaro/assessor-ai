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

export type SpecCatalogRow = {
  doc: ReferenceDocument;
  unitCode: string;
  unitTitle: string;
  issueLabel: string;
  loCount: number;
  criteriaCount: number;
  importSource: string;
  isPearsonImport: boolean;
  pearsonCriteriaVerified: boolean;
  isPearsonSet: boolean;
  archived: boolean;
  versionCountForCode: number;
  sameIssueVersionCountForCode: number;
  versionFamilyCount: number;
  versionFamilyDistinctCodeCount: number;
  versionFamilyKey: string;
  isFavorite: boolean;
  isActiveSet: boolean;
};

export function SpecMasterHealthBar({
  health,
  onValidate,
  onExport,
  onCopyRepairCommand,
}: {
  health: {
    lockedCount: number;
    activeSetCount: number;
    expectedActiveSetCount: number;
    missingActiveSetCount: number;
    unverifiedPearsonCount: number;
    multiVersionFamilyCount: number;
    multiVersionFamilies: string[];
    sameIssueConflictCount: number;
    sameIssueConflictKeys: string[];
    archivedCount: number;
  };
  onValidate: () => void;
  onExport: () => void;
  onCopyRepairCommand: () => void;
}) {
  const chips: Array<[string, string | number, string]> = [
    ["Locked specs", health.lockedCount, "zinc"],
    ["Active set", `${health.activeSetCount}/${health.expectedActiveSetCount}`, health.missingActiveSetCount ? "amber" : "emerald"],
    ["Unverified criteria", health.unverifiedPearsonCount, health.unverifiedPearsonCount ? "rose" : "emerald"],
    ["Multi-version families", health.multiVersionFamilyCount, health.multiVersionFamilyCount ? "info" : "emerald"],
    ["Version conflicts", health.sameIssueConflictCount, health.sameIssueConflictCount ? "amber" : "emerald"],
    ["Archived", health.archivedCount, "zinc"],
  ];
  const tone = (kind: string) =>
    kind === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : kind === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : kind === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : kind === "info"
            ? "border-sky-200 bg-sky-50 text-sky-900"
          : "border-zinc-200 bg-zinc-50 text-zinc-800";
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Spec Master Health</h2>
          <p className="mt-1 text-xs text-zinc-600">Catalog controls for the locked specs register used by grading.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onValidate} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            Validate library integrity
          </button>
          <button type="button" onClick={onExport} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            Export unit registry JSON
          </button>
          <button type="button" onClick={onCopyRepairCommand} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100">
            Copy Pearson repair command
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map(([label, value, kind]) => (
          <span key={label} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(kind)}`}>
            <span className="opacity-80">{label}</span>
            <span>{value}</span>
          </span>
        ))}
      </div>
      {health.multiVersionFamilies.length ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          Multiple versions detected for unit family(s): <span className="font-semibold">{health.multiVersionFamilies.join(", ")}</span>
        </div>
      ) : null}
      {health.sameIssueConflictKeys.length ? (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Same code + same issue conflicts detected: <span className="font-semibold">{health.sameIssueConflictKeys.join(", ")}</span>
        </div>
      ) : null}
      {health.missingActiveSetCount > 0 ? (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          Active set is incomplete: {health.missingActiveSetCount} expected Pearson unit(s) are missing from the locked catalog.
        </div>
      ) : null}
    </section>
  );
}

export function SpecCatalogList({
  rows,
  selectedDocId,
  onSelect,
  q,
  onQueryChange,
  quickFilter,
  onQuickFilterChange,
  quickCounts,
  onlyExactCode,
  setOnlyExactCode,
  onlyNumericSort,
  setOnlyNumericSort,
  onToggleFavorite,
}: {
  rows: SpecCatalogRow[];
  selectedDocId: string;
  onSelect: (id: string) => void;
  q: string;
  onQueryChange: (next: string) => void;
  quickFilter:
    | "ALL"
    | "ACTIVE_SET"
    | "FAVORITES"
    | "UNVERIFIED"
    | "PEARSON_IMPORT"
    | "PEARSON_SET_ONLY"
    | "ARCHIVED"
    | "FAILED";
  onQuickFilterChange: (next: any) => void;
  quickCounts: Record<string, number>;
  onlyExactCode: boolean;
  setOnlyExactCode: (next: boolean) => void;
  onlyNumericSort: boolean;
  setOnlyNumericSort: (next: boolean) => void;
  onToggleFavorite: (unitCode: string) => void;
}) {
  const chipTone = (active: boolean) =>
    active ? "border-sky-200 bg-sky-50 text-sky-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
  const sourceLabel = (src: string) => (src === "pearson-engineering-suite-2024" ? "Pearson suite" : src || "manual");

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Library Catalog</h2>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">{rows.length}</span>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="flex flex-wrap gap-2">
          {[
            ["ALL", "All"],
            ["ACTIVE_SET", "Active set"],
            ["FAVORITES", "Favorites"],
            ["UNVERIFIED", "Unverified"],
            ["PEARSON_IMPORT", "Pearson batch"],
            ["PEARSON_SET_ONLY", "Pearson-set"],
            ["ARCHIVED", "Archived"],
            ["FAILED", "Failed"],
          ].map(([key, label]) => {
            const active = quickFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onQuickFilterChange(key)}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${chipTone(active)}`}
              >
                <span>{label}</span>
                <span className="rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px]">{quickCounts[key] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by unit code/title/issue (exact 4-digit code supported)"
          className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
        />
        <div className="flex flex-wrap gap-3 text-xs text-zinc-700">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={onlyExactCode} onChange={(e) => setOnlyExactCode(e.target.checked)} />
            Exact unit code match
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={onlyNumericSort} onChange={(e) => setOnlyNumericSort(e.target.checked)} />
            Numeric unit-code sort
          </label>
        </div>
      </div>

      <div className="mt-3 grid max-h-[72vh] gap-2 overflow-auto pr-1">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No specs match current filters.</div>
        ) : (
          rows.map((row) => {
            const d = row.doc;
            const active = selectedDocId === d.id;
            const busyStatus = !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED" ? "LOCKED" : String(d.status || "").toUpperCase();
            return (
              <div
                key={d.id}
                onClick={() => onSelect(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(d.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className={
                  "rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-zinc-200 " +
                  (active ? "border-zinc-300 bg-zinc-50 ring-1 ring-zinc-200" : "border-zinc-200 bg-white hover:bg-zinc-50")
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={busyStatus as any} />
                    {row.isPearsonImport ? (
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-900">
                        {sourceLabel(row.importSource)}
                      </span>
                    ) : null}
                    {row.isPearsonImport ? (
                      <span
                        className={
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                          (row.pearsonCriteriaVerified
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-rose-200 bg-rose-50 text-rose-900")
                        }
                      >
                        {row.pearsonCriteriaVerified ? "Verified criteria" : "Unverified criteria"}
                      </span>
                    ) : null}
                    {row.versionFamilyCount > 1 ? (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                        Multi-version x{row.versionFamilyCount}
                      </span>
                    ) : null}
                    {row.versionFamilyDistinctCodeCount > 1 ? (
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
                        Cross-code family x{row.versionFamilyDistinctCodeCount}
                      </span>
                    ) : null}
                    {row.sameIssueVersionCountForCode > 1 ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        Same-issue conflict x{row.sameIssueVersionCountForCode}
                      </span>
                    ) : null}
                    {row.archived ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (row.unitCode) onToggleFavorite(row.unitCode);
                    }}
                    className={"rounded-md border px-2 py-0.5 text-[11px] font-semibold " + (row.isFavorite ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-600")}
                    title={row.isFavorite ? "Unpin favorite" : "Pin favorite"}
                  >
                    {row.isFavorite ? "★" : "☆"}
                  </button>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">
                  {row.unitCode ? `${row.unitCode} — ${row.unitTitle || d.title}` : d.title}
                </div>
                <div className="mt-1 text-xs text-zinc-500">{row.issueLabel || "Issue not set"}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-zinc-700">
                    <span className="text-zinc-500">LOs</span> <span className="font-semibold text-zinc-900">{row.loCount}</span>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-zinc-700">
                    <span className="text-zinc-500">ACs</span> <span className="font-semibold text-zinc-900">{row.criteriaCount}</span>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-zinc-700">
                    <span className="text-zinc-500">Import</span> <span className="font-semibold text-zinc-900">{row.isActiveSet ? "Active" : "Other"}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                  {row.isPearsonSet ? <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5">Pearson-set unit</span> : null}
                  <span>{new Date(((d.sourceMeta as any)?.updatedAt || d.uploadedAt || Date.now())).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}

export function SpecVersionComparePanel({
  selected,
  candidates,
  compareId,
  onSelectCompareId,
}: {
  selected: SpecCatalogRow | null;
  candidates: SpecCatalogRow[];
  compareId: string;
  onSelectCompareId: (id: string) => void;
}) {
  if (!selected) return null;
  const other = candidates.find((c) => c.doc.id === compareId) || null;
  const diff = other ? compareSpecDrafts(selected.doc, other.doc) : null;
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Spec version compare</h2>
        <span className="text-xs text-zinc-500">Compare specs with same unit code</span>
      </div>
      {!candidates.length ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          No alternate versions found for this unit family.
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <select
            value={compareId}
            onChange={(e) => onSelectCompareId(e.target.value)}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">Select version to compare…</option>
            {candidates.map((c) => (
              <option key={c.doc.id} value={c.doc.id}>
                {c.issueLabel || "Issue —"} · {c.doc.title}
              </option>
            ))}
          </select>
          {other ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[selected, other].map((row, idx) => (
                <div key={row.doc.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">{idx === 0 ? "Current" : "Compare"}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{row.issueLabel || "Issue —"}</div>
                  <div className="mt-1 text-xs text-zinc-700">{row.unitCode} — {row.unitTitle}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1">LOs: <span className="font-semibold">{row.loCount}</span></div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1">ACs: <span className="font-semibold">{row.criteriaCount}</span></div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1">Verified: <span className="font-semibold">{row.pearsonCriteriaVerified ? "Yes" : "No"}</span></div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1">Status: <span className="font-semibold">{row.doc.status}</span></div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {other ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
              Delta: LOs {selected.loCount - other.loCount >= 0 ? "+" : ""}{selected.loCount - other.loCount} · ACs {selected.criteriaCount - other.criteriaCount >= 0 ? "+" : ""}{selected.criteriaCount - other.criteriaCount}
            </div>
          ) : null}
          {other && diff ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700">What changed</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
                  <div className="font-semibold text-zinc-900">Learning outcomes</div>
                  <ul className="mt-2 list-disc pl-4 space-y-1">
                    <li>Added: <span className="font-semibold">{diff.loAdded.length}</span>{diff.loAdded.length ? ` (${diff.loAdded.join(", ")})` : ""}</li>
                    <li>Removed: <span className="font-semibold">{diff.loRemoved.length}</span>{diff.loRemoved.length ? ` (${diff.loRemoved.join(", ")})` : ""}</li>
                    <li>Text changed: <span className="font-semibold">{diff.loTextChanged.length}</span>{diff.loTextChanged.length ? ` (${diff.loTextChanged.slice(0, 8).join(", ")}${diff.loTextChanged.length > 8 ? "..." : ""})` : ""}</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
                  <div className="font-semibold text-zinc-900">Assessment criteria</div>
                  <ul className="mt-2 list-disc pl-4 space-y-1">
                    <li>Added: <span className="font-semibold">{diff.acAdded.length}</span>{diff.acAdded.length ? ` (${diff.acAdded.slice(0, 10).join(", ")}${diff.acAdded.length > 10 ? "..." : ""})` : ""}</li>
                    <li>Removed: <span className="font-semibold">{diff.acRemoved.length}</span>{diff.acRemoved.length ? ` (${diff.acRemoved.slice(0, 10).join(", ")}${diff.acRemoved.length > 10 ? "..." : ""})` : ""}</li>
                    <li>Moved LO: <span className="font-semibold">{diff.acLoChanged.length}</span>{diff.acLoChanged.length ? ` (${diff.acLoChanged.slice(0, 10).join(", ")}${diff.acLoChanged.length > 10 ? "..." : ""})` : ""}</li>
                    <li>Text changed: <span className="font-semibold">{diff.acTextChanged.length}</span>{diff.acTextChanged.length ? ` (${diff.acTextChanged.slice(0, 10).join(", ")}${diff.acTextChanged.length > 10 ? "..." : ""})` : ""}</li>
                  </ul>
                </div>
              </div>

              {(diff.loTextSamples.length || diff.acTextSamples.length || diff.acLoMoveSamples.length) ? (
                <details className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-900">Show change details</summary>
                  <div className="mt-2 grid gap-3">
                    {diff.loTextSamples.length ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs">
                        <div className="font-semibold text-zinc-900">LO text changes</div>
                        <div className="mt-2 grid gap-2">
                          {diff.loTextSamples.map((row) => (
                            <div key={`lo-${row.code}`} className="rounded-md border border-zinc-200 bg-white p-2">
                              <div className="font-semibold text-zinc-900">{row.code}</div>
                              <div className="mt-1 text-zinc-700"><span className="font-semibold">Current:</span> {row.current}</div>
                              <div className="mt-1 text-zinc-700"><span className="font-semibold">Compare:</span> {row.compare}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {diff.acLoMoveSamples.length ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs">
                        <div className="font-semibold text-zinc-900">Criteria moved between LOs</div>
                        <div className="mt-2 grid gap-2">
                          {diff.acLoMoveSamples.map((row) => (
                            <div key={`move-${row.code}`} className="rounded-md border border-zinc-200 bg-white p-2">
                              <div className="font-semibold text-zinc-900">{row.code}</div>
                              <div className="mt-1 text-zinc-700">Current: {row.currentLo}</div>
                              <div className="mt-1 text-zinc-700">Compare: {row.compareLo}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {diff.acTextSamples.length ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs">
                        <div className="font-semibold text-zinc-900">Criteria text changes</div>
                        <div className="mt-2 grid gap-2">
                          {diff.acTextSamples.map((row) => (
                            <div key={`ac-${row.code}`} className="rounded-md border border-zinc-200 bg-white p-2">
                              <div className="font-semibold text-zinc-900">{row.code} ({row.loCode})</div>
                              <div className="mt-1 text-zinc-700"><span className="font-semibold">Current:</span> {row.current}</div>
                              <div className="mt-1 text-zinc-700"><span className="font-semibold">Compare:</span> {row.compare}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

function normalizeSpace(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function normalizeTextCompare(v: unknown) {
  return normalizeSpace(v)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCode(v: unknown) {
  const m = String(v || "").toUpperCase().replace(/\s+/g, "").match(/^([PMD])(\d{1,2})$/);
  return m ? `${m[1]}${Number(m[2])}` : "";
}

function sortCodes(codes: string[]) {
  return [...codes].sort((a, b) => {
    const band = (x: string) => (x.startsWith("P") ? 1 : x.startsWith("M") ? 2 : x.startsWith("D") ? 3 : 9);
    const an = Number(a.match(/\d+/)?.[0] || 999);
    const bn = Number(b.match(/\d+/)?.[0] || 999);
    return band(a) - band(b) || an - bn || a.localeCompare(b);
  });
}

function sortLoCodes(codes: string[]) {
  return [...codes].sort((a, b) => {
    const an = Number(String(a).match(/\d+/)?.[0] || 999);
    const bn = Number(String(b).match(/\d+/)?.[0] || 999);
    return an - bn || String(a).localeCompare(String(b));
  });
}

function extractSpecStructure(doc: ReferenceDocument | null) {
  const losRaw = Array.isArray(doc?.extractedJson?.learningOutcomes) ? doc!.extractedJson.learningOutcomes : [];
  const loMap = new Map<string, { description: string }>();
  const acMap = new Map<string, { loCode: string; description: string }>();
  for (const lo of losRaw) {
    const loCode = String(lo?.loCode || "").trim().toUpperCase();
    if (!loCode) continue;
    loMap.set(loCode, { description: normalizeSpace(lo?.description || "") });
    const criteria = Array.isArray(lo?.criteria) ? lo.criteria : [];
    for (const c of criteria) {
      const acCode = cleanCode(c?.acCode);
      if (!acCode) continue;
      acMap.set(acCode, {
        loCode,
        description: normalizeSpace(c?.description || ""),
      });
    }
  }
  return { loMap, acMap };
}

function compareSpecDrafts(currentDoc: ReferenceDocument | null, compareDoc: ReferenceDocument | null) {
  const current = extractSpecStructure(currentDoc);
  const other = extractSpecStructure(compareDoc);
  const currentLos = new Set(current.loMap.keys());
  const otherLos = new Set(other.loMap.keys());
  const loAdded = sortLoCodes([...currentLos].filter((x) => !otherLos.has(x)));
  const loRemoved = sortLoCodes([...otherLos].filter((x) => !currentLos.has(x)));
  const loTextChanged = [...currentLos]
    .filter((lo) => otherLos.has(lo))
    .filter((lo) => normalizeTextCompare(current.loMap.get(lo)?.description) !== normalizeTextCompare(other.loMap.get(lo)?.description))
    .sort((a, b) => {
      const an = Number(String(a).match(/\d+/)?.[0] || 999);
      const bn = Number(String(b).match(/\d+/)?.[0] || 999);
      return an - bn || a.localeCompare(b);
    });

  const currentAcs = new Set(current.acMap.keys());
  const otherAcs = new Set(other.acMap.keys());
  const acAdded = sortCodes([...currentAcs].filter((x) => !otherAcs.has(x)));
  const acRemoved = sortCodes([...otherAcs].filter((x) => !currentAcs.has(x)));
  const sharedAcs = [...currentAcs].filter((x) => otherAcs.has(x));
  const acLoChanged = sortCodes(
    sharedAcs.filter((code) => String(current.acMap.get(code)?.loCode || "") !== String(other.acMap.get(code)?.loCode || ""))
  );
  const acTextChanged = sortCodes(
    sharedAcs.filter(
      (code) => normalizeTextCompare(current.acMap.get(code)?.description) !== normalizeTextCompare(other.acMap.get(code)?.description)
    )
  );

  return {
    loAdded,
    loRemoved,
    loTextChanged,
    acAdded,
    acRemoved,
    acLoChanged,
    acTextChanged,
    loTextSamples: loTextChanged.slice(0, 6).map((code) => ({
      code,
      current: current.loMap.get(code)?.description || "",
      compare: other.loMap.get(code)?.description || "",
    })),
    acLoMoveSamples: acLoChanged.slice(0, 8).map((code) => ({
      code,
      currentLo: current.acMap.get(code)?.loCode || "",
      compareLo: other.acMap.get(code)?.loCode || "",
    })),
    acTextSamples: acTextChanged.slice(0, 6).map((code) => ({
      code,
      loCode: current.acMap.get(code)?.loCode || other.acMap.get(code)?.loCode || "",
      current: current.acMap.get(code)?.description || "",
      compare: other.acMap.get(code)?.description || "",
    })),
  };
}

export function SpecList({
  documents,
  selectedDocId,
  onSelect,
  onExtract,
  onLock,
  q,
  status,
  quickFilter,
  quickCounts,
  rowBusy,
  onQueryChange,
  onStatusChange,
  onQuickFilterChange,
  counts,
  searchInputRef,
}: {
  documents: ReferenceDocument[];
  selectedDocId: string;
  onSelect: (id: string) => void;
  onExtract: (id: string) => void;
  onLock: (id: string) => void;
  q: string;
  status: string;
  quickFilter: "ALL" | "NEEDS_REVIEW" | "LOCKED" | "FAILED";
  quickCounts: { all: number; needsReview: number; locked: number; failed: number };
  rowBusy: Record<string, "extract" | "lock" | undefined>;
  onQueryChange: (next: string) => void;
  onStatusChange: (next: string) => void;
  onQuickFilterChange: (next: "ALL" | "NEEDS_REVIEW" | "LOCKED" | "FAILED") => void;
  counts: { shown: number; total: number };
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Specification list</h2>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
          {counts.shown}/{counts.total}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "ALL" as const, label: "All", count: quickCounts.all },
            { key: "NEEDS_REVIEW" as const, label: "Needs review", count: quickCounts.needsReview },
            { key: "LOCKED" as const, label: "Locked", count: quickCounts.locked },
            { key: "FAILED" as const, label: "Failed", count: quickCounts.failed },
          ].map((item) => {
            const active = quickFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onQuickFilterChange(item.key)}
                className={
                  "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition " +
                  (active
                    ? "border-sky-200 bg-sky-50 text-sky-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                }
              >
                <span>{item.label}</span>
                <span className="rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px]">{item.count}</span>
              </button>
            );
          })}
        </div>
        <input
          ref={searchInputRef}
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search title, filename, unit code…"
          className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
        />
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
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
          Showing {counts.shown} of {counts.total}
        </div>
      </div>

      <div className="mt-3 grid max-h-[60vh] gap-2 overflow-auto pr-1">
        {documents.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No specifications found. Upload a PDF to begin.</div>
        ) : (
          documents.map((d) => {
            const active = selectedDocId === d.id;
            const issueLabel = formatIssueLabel(pickIssueLabel(d));
            const title = formatUnitTitle(d);
            const isLocked = !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED";
            const busy = rowBusy[d.id];
            const updated = (d.sourceMeta as any)?.updatedAt || d.uploadedAt;
            return (
              <div
                key={d.id}
                onClick={() => onSelect(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(d.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className={
                  "rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-zinc-200 " +
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
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span>Updated {new Date(updated).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{isLocked ? "Locked" : "Unlocked"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(d.id);
                    }}
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExtract(d.id);
                    }}
                    className={
                      "rounded-lg border px-2.5 py-1 text-[11px] font-semibold " +
                      (busy === "extract"
                        ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                        : "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100")
                    }
                  >
                    {busy === "extract" ? "Extracting..." : "Extract"}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || isLocked}
                    onClick={(e) => {
                      e.stopPropagation();
                      onLock(d.id);
                    }}
                    className={
                      "rounded-lg border px-2.5 py-1 text-[11px] font-semibold " +
                      (isLocked
                        ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                        : busy === "lock"
                          ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                          : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100")
                    }
                  >
                    {busy === "lock" ? "Locking..." : isLocked ? "Locked" : "Lock"}
                  </button>
                </div>
              </div>
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
  const isPearsonSuiteBulkImport =
    String((selectedDoc?.sourceMeta as any)?.importSource || "") === "pearson-engineering-suite-2024";
  const pearsonCriteriaDescriptionsVerified = Boolean((selectedDoc?.sourceMeta as any)?.criteriaDescriptionsVerified);
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <h2 className="text-sm font-semibold">Specification preview</h2>
      {!selectedDoc ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">Select a specification to view extracted learning outcomes and criteria.</div>
      ) : learningOutcomes.length ? (
        <div className="mt-3 space-y-3">
          {isPearsonSuiteBulkImport && !pearsonCriteriaDescriptionsVerified ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Pearson bulk import safety mode: LOs and criteria codes are shown, but some criterion descriptions are hidden until the Pearson 3-column table parser is upgraded (to avoid misleading mixed text).
            </div>
          ) : null}
          <div className="max-h-[68vh] overflow-auto pr-1">
          <LoCriteriaGrid learningOutcomes={learningOutcomes} />
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">No extracted structure available. Run Extract to generate learning outcomes and criteria.</div>
      )}
    </article>
  );
}
