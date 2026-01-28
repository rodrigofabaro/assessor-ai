"use client";

import { useEffect, useMemo, useState } from "react";


type ReferenceDocument = {
  id: string;
  type: "SPEC" | "BRIEF" | "RUBRIC";
  status: "UPLOADED" | "EXTRACTED" | "REVIEWED" | "LOCKED" | "FAILED";
  title: string;
  version: number;
  originalFilename: string;
  checksumSha256: string;
  uploadedAt: string;
  extractedJson?: any | null;
  extractionWarnings?: any | null;
  sourceMeta?: any | null;
  lockedAt?: string | null;
};

type LearningOutcome = {
  id: string;
  loCode: string;
  description: string;
  essentialContent?: string | null;
  criteria: Array<{
    id: string;
    acCode: string;
    gradeBand: "PASS" | "MERIT" | "DISTINCTION";
    description: string;
  }>;
};

type Unit = {
  id: string;
  unitCode: string;
  unitTitle: string;
  status: "DRAFT" | "LOCKED";
  learningOutcomes: LearningOutcome[];
};

type Criterion = {
  id: string;
  acCode: string;
  gradeBand: "PASS" | "MERIT" | "DISTINCTION";
  description: string;
  learningOutcome: { id: string; loCode: string; unitId: string };
};

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

function badge(status: ReferenceDocument["status"]): { cls: string; text: string } {
  switch (status) {
    case "UPLOADED":
      return { cls: "bg-indigo-50 text-indigo-900 border-indigo-200", text: "UPLOADED" };
    case "EXTRACTED":
      return { cls: "bg-cyan-50 text-cyan-900 border-cyan-200", text: "EXTRACTED" };
    case "REVIEWED":
      return { cls: "bg-amber-50 text-amber-900 border-amber-200", text: "REVIEWED" };
    case "LOCKED":
      return { cls: "bg-emerald-50 text-emerald-900 border-emerald-200", text: "LOCKED" };
    case "FAILED":
      return { cls: "bg-red-50 text-red-900 border-red-200", text: "FAILED" };
  }
}

export default function ReferenceAdminPage() {
  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload
  const [docType, setDocType] = useState<ReferenceDocument["type"]>("SPEC");
  const [docTitle, setDocTitle] = useState("");
  const [docVersion, setDocVersion] = useState("1");
  const [docFile, setDocFile] = useState<File | null>(null);

  // Review selection
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) || null,
    [documents, selectedDocId]
  );

  // Brief mapping override
  const [briefUnitId, setBriefUnitId] = useState<string>("");
  const [mapSelected, setMapSelected] = useState<Record<string, boolean>>({});
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [assignmentCodeInput, setAssignmentCodeInput] = useState("");

  const allCriteria: Criterion[] = useMemo(() => {
    const out: Criterion[] = [];
    for (const u of units) {
      for (const lo of u.learningOutcomes) {
        for (const c of lo.criteria) {
          out.push({
            ...c,
            learningOutcome: { id: lo.id, loCode: lo.loCode, unitId: u.id },
          });
        }
      }
    }
    out.sort((a, b) => a.acCode.localeCompare(b.acCode));
    return out;
  }, [units]);

  const criteriaForSelectedUnit = useMemo(() => {
    const unitId = briefUnitId || "";
    return allCriteria.filter((c) => c.learningOutcome.unitId === unitId);
  }, [allCriteria, briefUnitId]);

  async function refreshAll() {
    const [docs, unitsRes] = await Promise.all([
      jsonFetch<{ documents: ReferenceDocument[] }>("/api/reference-documents"),
      jsonFetch<{ units: Unit[] }>("/api/units"),
    ]);
    setDocuments(docs.documents);
    setUnits(unitsRes.units);
  }

  useEffect(() => {
    refreshAll().catch((e) => setError(String(e?.message || e)));
  }, []);

  // Keep raw JSON in sync when selecting a document
  useEffect(() => {
  if (!selectedDoc) {
    setRawJson("");
    setBriefUnitId("");
    setMapSelected({});
    return;
  }

  const draft = selectedDoc.extractedJson;
  setRawJson(draft ? JSON.stringify(draft, null, 2) : "");

  // Brief: preselect mapping (best-effort)
  if (selectedDoc.type === "BRIEF" && draft?.kind === "BRIEF") {
    setAssignmentCodeInput((draft.assignmentCode || "").toString());

    const unitGuess: string | undefined = draft.unitCodeGuess;
    const unit = unitGuess ? units.find((u) => u.unitCode === unitGuess) : null;
    setBriefUnitId(unit?.id || "");

    const codes: string[] = (draft.detectedCriterionCodes || []).map((x: string) =>
      x.toUpperCase()
    );

    const sel: Record<string, boolean> = {};
    for (const c of allCriteria) {
      if (unit && c.learningOutcome.unitId !== unit.id) continue;
      if (codes.includes(c.acCode.toUpperCase())) sel[c.acCode] = true;
    }
    setMapSelected(sel);
  }
}, [selectedDoc, units, allCriteria]);


  async function uploadDoc() {
    setError(null);
    if (!docFile) return setError("Pick a file first.");
    setBusy("Uploading reference document...");
    try {
      const fd = new FormData();
      fd.set("type", docType);
      fd.set("title", docTitle || docFile.name);
      fd.set("version", docVersion || "1");
      fd.set("file", docFile);
      await jsonFetch("/api/reference-documents", { method: "POST", body: fd });
      setDocTitle("");
      setDocVersion("1");
      setDocFile(null);
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function extractSelected() {
    setError(null);
    if (!selectedDoc) return;
    setBusy("Extracting draft...");
    try {
      await jsonFetch("/api/reference-documents/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: selectedDoc.id }),
      });
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Extract failed");
    } finally {
      setBusy(null);
    }
  }

  async function lockSelected() {
    setError(null);
    if (!selectedDoc) return;
    setBusy("Locking reference (committing to DB)...");
    try {
      let draft: any = undefined;
      if (showRawJson && rawJson.trim()) {
        draft = JSON.parse(rawJson);
      }

      const body: any = { documentId: selectedDoc.id };
      if (draft) body.draft = draft;

      if (selectedDoc.type === "BRIEF") {
        if (assignmentCodeInput.trim()) body.assignmentCode = assignmentCodeInput.trim();
        if (briefUnitId) body.unitId = briefUnitId;
        const overrideCodes = Object.entries(mapSelected)
          .filter(([, v]) => v)
          .map(([k]) => k);
        if (overrideCodes.length) body.mappingOverride = overrideCodes;
      }

      await jsonFetch("/api/reference-documents/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Lock failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Phase 2.2 — Reference Ingestion</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Upload specs/briefs → auto-extract → review → <span className="font-semibold">LOCK</span>. Locked references become the ground truth used later for AI grading + audit logs.
          </p>
        </div>
        <div className="text-xs text-zinc-600">{busy ? <span>⏳ {busy}</span> : <span>Ready</span>}</div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* Left: Inbox + Upload */}
        <div className="grid gap-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Upload to Reference Inbox</h2>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Type</span>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as any)}
                  className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
                >
                  <option value="SPEC">SPEC</option>
                  <option value="BRIEF">BRIEF</option>
                  <option value="RUBRIC">RUBRIC</option>
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Title</span>
                <input
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Unit 4017 Spec"
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Version</span>
                  <input
                    value={docVersion}
                    onChange={(e) => setDocVersion(e.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">File</span>
                  <input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={uploadDoc}
                disabled={!!busy}
                className={
                  "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                  (busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")
                }
              >
                Upload
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Reference Inbox</h2>
            <div className="mt-3 max-h-[520px] overflow-auto rounded-xl border border-zinc-200">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-zinc-600">
                    <th className="border-b border-zinc-200 px-3 py-2">Status</th>
                    <th className="border-b border-zinc-200 px-3 py-2">Type</th>
                    <th className="border-b border-zinc-200 px-3 py-2">Title</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => {
                    const b = badge(d.status);
                    const active = d.id === selectedDocId;
                    const meta = d.sourceMeta || {};
                    const hint = [meta.unitCode ? `Unit ${meta.unitCode}` : "", meta.assignmentCode ? meta.assignmentCode : ""]
                      .filter(Boolean)
                      .join(" • ");
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedDocId(d.id)}
                        className={
                          "cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 " +
                          (active ? "bg-zinc-50" : "bg-white")
                        }
                      >
                        <td className="px-3 py-2">
                          <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " + b.cls}>
                            {b.text}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{d.type}</td>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-zinc-900">{d.title}</div>
                          <div className="mt-0.5 text-xs text-zinc-600">{hint || d.originalFilename}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {documents.length === 0 ? (
                <div className="p-3 text-sm text-zinc-600">No reference documents uploaded yet.</div>
              ) : null}
            </div>
          </section>
        </div>

        {/* Right: Review & Lock */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Review & Lock</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={extractSelected}
                disabled={!selectedDoc || !!busy}
                className={
                  "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                  (!selectedDoc || busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")
                }
              >
                Extract
              </button>
              <button
                onClick={lockSelected}
                disabled={!selectedDoc || !!busy}
                className={
                  "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                  (!selectedDoc || busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-emerald-700 text-white hover:bg-emerald-600")
                }
              >
                Approve & Lock
              </button>
            </div>
          </div>

          {!selectedDoc ? (
            <p className="mt-4 text-sm text-zinc-600">Select a document from the inbox to review it.</p>
          ) : (
            <div className="mt-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-zinc-600">Type</div>
                  <div className="font-semibold">{selectedDoc.type}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-600">Uploaded</div>
                  <div className="font-semibold">{formatDate(selectedDoc.uploadedAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-600">Status</div>
                  <div className="font-semibold">{selectedDoc.status}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-600">Locked at</div>
                  <div className="font-semibold">{formatDate(selectedDoc.lockedAt)}</div>
                </div>
              </div>

              <div className="mt-4 border-t border-zinc-200 pt-4">
                {selectedDoc.extractionWarnings && Array.isArray(selectedDoc.extractionWarnings) && selectedDoc.extractionWarnings.length ? (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="font-semibold">Warnings</div>
                    <ul className="mt-2 list-disc pl-5">
                      {selectedDoc.extractionWarnings.map((w: string, idx: number) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selectedDoc.type === "SPEC" ? (
                  <SpecPreview draft={selectedDoc.extractedJson} />
                ) : selectedDoc.type === "BRIEF" ? (
                  <BriefPreview
                    draft={selectedDoc.extractedJson}
                    units={units}
                    briefUnitId={briefUnitId}
                    setBriefUnitId={setBriefUnitId}
                    criteria={criteriaForSelectedUnit}
                    mapSelected={mapSelected}
                    setMapSelected={setMapSelected}
                    assignmentCodeInput={assignmentCodeInput}
                    setAssignmentCodeInput={setAssignmentCodeInput}
                  />
                ) : (
                  <p className="text-sm text-zinc-600">RUBRIC ingestion UI lands later; for now it stays as a stored document.</p>
                )}

                <div className="mt-5">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={showRawJson} onChange={(e) => setShowRawJson(e.target.checked)} />
                    Show raw draft JSON (advanced)
                  </label>
                  {showRawJson ? (
                    <textarea
                      value={rawJson}
                      onChange={(e) => setRawJson(e.target.value)}
                      className="mt-2 h-[220px] w-full rounded-xl border border-zinc-300 p-3 font-mono text-xs"
                      placeholder="Extract draft JSON will appear here after Extract."
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SpecPreview({ draft }: { draft: any }) {
  if (!draft) return <p style={{ color: "#6b7280" }}>No draft extracted yet. Click Extract.</p>;
  if (draft.kind !== "SPEC") return <p style={{ color: "#6b7280" }}>This draft is not a SPEC.</p>;

  const unit = draft.unit || {};
  const los = Array.isArray(draft.learningOutcomes) ? draft.learningOutcomes : [];
  const totalCriteria = los.reduce((n: number, lo: any) => n + (lo.criteria?.length || 0), 0);

  return (
    <div>
      <h3 style={{ margin: "0 0 8px" }}>SPEC extraction preview</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Unit</div>
          <div style={{ fontWeight: 700 }}>{unit.unitCode || "(missing)"} — {unit.unitTitle || "(missing)"}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Spec label</div>
          <div style={{ fontWeight: 700 }}>{unit.specVersionLabel || unit.specIssue || "(not detected)"}</div>
        </div>
      </div>
      <p style={{ margin: "10px 0", color: "#374151" }}>
        Detected <b>{los.length}</b> learning outcomes and <b>{totalCriteria}</b> assessment criteria codes.
      </p>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left" }}>
              <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>LO</th>
              <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Description</th>
              <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Criteria</th>
            </tr>
          </thead>
          <tbody>
            {los.map((lo: any, idx: number) => (
              <tr key={`${lo.loCode}-${idx}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: 8, fontWeight: 700, verticalAlign: "top" }}>{lo.loCode}</td>
                <td style={{ padding: 8, verticalAlign: "top" }}>{lo.description || ""}</td>
                <td style={{ padding: 8, verticalAlign: "top" }}>
                  {(lo.criteria || []).length ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {(lo.criteria || []).map((c: any, cidx: number) => (
                        <li key={`${c.acCode}-${cidx}`}>
                          <b>{c.acCode}</b> — {c.description || ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "(none)"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
        Note: criterion statements are short by design (Pearson). Long context is stored as Essential Content per LO.
      </p>
    </div>
  );
}

function BriefPreview({
  draft,
  units,
  briefUnitId,
  setBriefUnitId,
  criteria,
  mapSelected,
  setMapSelected,
  assignmentCodeInput,
  setAssignmentCodeInput,
}: {
  draft: any;
  units: Unit[];
  briefUnitId: string;
  setBriefUnitId: (id: string) => void;
  criteria: Criterion[];
  mapSelected: Record<string, boolean>;
  setMapSelected: (x: Record<string, boolean>) => void;
  assignmentCodeInput: string;
  setAssignmentCodeInput: (v: string) => void;
}) {
  if (!draft) return <p style={{ color: "#6b7280" }}>No draft extracted yet. Click Extract.</p>;
  if (draft.kind !== "BRIEF") return <p style={{ color: "#6b7280" }}>This draft is not a BRIEF.</p>;

  const codes: string[] = (draft.detectedCriterionCodes || []).map((x: string) => String(x).toUpperCase());
  const unitGuess = draft.unitCodeGuess ? String(draft.unitCodeGuess) : "";

  return (
    <div>
      <h3 style={{ margin: "0 0 8px" }}>BRIEF extraction preview</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Assignment</div>
          <div style={{ fontWeight: 700 }}>{draft.assignmentCode || "(missing)"} — {draft.title || "(title not detected)"}</div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Assignment code (required to lock)</div>
            <input
              value={assignmentCodeInput}
              onChange={(e) => setAssignmentCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. A1"
              style={{ width: 120, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
            />
          </div>
          {draft.assignmentNumber ? (
            <div style={{ color: "#6b7280", fontSize: 12 }}>Assignment {draft.assignmentNumber} of {draft.totalAssignments || "?"}</div>
          ) : null}
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Detected unit</div>
          <div style={{ fontWeight: 700 }}>{unitGuess ? `Unit ${unitGuess}` : "(not detected)"}</div>
          {draft.aiasLevel ? <div style={{ color: "#6b7280", fontSize: 12 }}>AIAS Level {draft.aiasLevel}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 12, color: "#6b7280" }}>Link this brief to a unit</label>
        <div>
          <select value={briefUnitId} onChange={(e) => setBriefUnitId(e.target.value)}>
            <option value="">(select unit...)</option>
            {units
              .filter((u) => u.status === "LOCKED")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitCode} — {u.unitTitle}
                </option>
              ))}
          </select>
        </div>
        <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 12 }}>
          Tip: briefs should lock against a <b>LOCKED</b> unit spec.
        </p>
      </div>

      <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        <h4 style={{ margin: "0 0 6px" }}>Criteria mapping (edit before lock)</h4>
        <p style={{ margin: "0 0 10px", color: "#374151" }}>
          Detected codes: <b>{codes.length ? codes.join(", ") : "(none)"}</b>
        </p>

        {!briefUnitId ? (
          <p style={{ color: "#6b7280" }}>Select a unit to view criteria and confirm mapping.</p>
        ) : (
          <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
            {criteria.length === 0 ? (
              <p style={{ color: "#6b7280" }}>No criteria found for that unit (is the spec locked?).</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {criteria.map((c) => (
                  <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!mapSelected[c.acCode]}
                      onChange={(e) =>
                        setMapSelected({ ...mapSelected, [c.acCode]: e.target.checked })
                      }
                    />
                    <span style={{ fontWeight: 700 }}>{c.acCode}</span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{c.learningOutcome.loCode}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
