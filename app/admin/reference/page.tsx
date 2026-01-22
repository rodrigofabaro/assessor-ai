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

function badge(status: ReferenceDocument["status"]): { bg: string; fg: string; text: string } {
  switch (status) {
    case "UPLOADED":
      return { bg: "#eef2ff", fg: "#3730a3", text: "UPLOADED" };
    case "EXTRACTED":
      return { bg: "#ecfeff", fg: "#155e75", text: "EXTRACTED" };
    case "REVIEWED":
      return { bg: "#fffbeb", fg: "#92400e", text: "REVIEWED" };
    case "LOCKED":
      return { bg: "#ecfdf5", fg: "#065f46", text: "LOCKED" };
    case "FAILED":
      return { bg: "#fef2f2", fg: "#991b1b", text: "FAILED" };
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

      const codes: string[] = (draft.detectedCriterionCodes || []).map((x: string) => x.toUpperCase());
      const sel: Record<string, boolean> = {};
      for (const c of allCriteria) {
        if (unit && c.learningOutcome.unitId !== unit.id) continue;
        if (codes.includes(c.acCode.toUpperCase())) sel[c.acCode] = true;
      }
      setMapSelected(sel);
    }
  }, [selectedDocId, documents, units, allCriteria]);

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

  const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
  const cardStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" };

  return (
    <div style={{ padding: 20, maxWidth: 1150, margin: "0 auto" }}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Phase 2.2 — Reference Ingestion</h1>
          <p style={{ margin: "6px 0 0", color: "#374151" }}>
            Upload specs/briefs → auto-extract → review → <b>LOCK</b>. Locked references become the ground truth used later for AI grading + audit logs.
          </p>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {busy ? <span>⏳ {busy}</span> : <span>Ready</span>}
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16, marginTop: 16 }}>
        {/* Left: Inbox + Upload */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 10px" }}>Upload to Reference Inbox</h2>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
              <label>Type</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value as any)}>
                <option value="SPEC">SPEC</option>
                <option value="BRIEF">BRIEF</option>
                <option value="RUBRIC">RUBRIC</option>
              </select>

              <label>Title</label>
              <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Unit 4017 Spec" />

              <label>Version</label>
              <input value={docVersion} onChange={(e) => setDocVersion(e.target.value)} style={{ width: 120 }} />

              <label>File</label>
              <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
            </div>

            <div style={{ marginTop: 10 }}>
              <button onClick={uploadDoc} disabled={!!busy}>Upload</button>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 10px" }}>Reference Inbox</h2>
            <div style={{ maxHeight: 520, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "6px 4px" }}>Status</th>
                    <th style={{ padding: "6px 4px" }}>Type</th>
                    <th style={{ padding: "6px 4px" }}>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => {
                    const b = badge(d.status);
                    const active = d.id === selectedDocId;
                    const meta = d.sourceMeta || {};
                    const hint = [meta.unitCode ? `Unit ${meta.unitCode}` : "", meta.assignmentCode ? meta.assignmentCode : ""].filter(Boolean).join(" • ");
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedDocId(d.id)}
                        style={{
                          cursor: "pointer",
                          background: active ? "#f9fafb" : "transparent",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <td style={{ padding: "8px 4px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 999, background: b.bg, color: b.fg, fontWeight: 600 }}>
                            {b.text}
                          </span>
                        </td>
                        <td style={{ padding: "8px 4px" }}>{d.type}</td>
                        <td style={{ padding: "8px 4px" }}>
                          <div style={{ fontWeight: 600 }}>{d.title}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{hint || d.originalFilename}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {documents.length === 0 ? <p style={{ color: "#6b7280" }}>No reference documents uploaded yet.</p> : null}
            </div>
          </div>
        </div>

        {/* Right: Review & Lock */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Review & Lock</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={extractSelected} disabled={!selectedDoc || !!busy}>
                Extract
              </button>
              <button onClick={lockSelected} disabled={!selectedDoc || !!busy}>
                Approve & Lock
              </button>
            </div>
          </div>

          {!selectedDoc ? (
            <p style={{ color: "#6b7280", marginTop: 12 }}>Select a document from the inbox to review it.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Type</div>
                  <div style={{ fontWeight: 700 }}>{selectedDoc.type}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Uploaded</div>
                  <div style={{ fontWeight: 700 }}>{formatDate(selectedDoc.uploadedAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Status</div>
                  <div style={{ fontWeight: 700 }}>{selectedDoc.status}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Locked at</div>
                  <div style={{ fontWeight: 700 }}>{formatDate(selectedDoc.lockedAt)}</div>
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                {selectedDoc.extractionWarnings && Array.isArray(selectedDoc.extractionWarnings) && selectedDoc.extractionWarnings.length ? (
                  <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
                    <b>Warnings:</b>
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {selectedDoc.extractionWarnings.map((w: string, idx: number) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* SPEC preview */}
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
                  <p style={{ color: "#6b7280" }}>RUBRIC ingestion UI lands later; for now it stays as a stored document.</p>
                )}

                <div style={{ marginTop: 14 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={showRawJson} onChange={(e) => setShowRawJson(e.target.checked)} />
                    Show raw draft JSON (advanced)
                  </label>
                  {showRawJson ? (
                    <textarea
                      value={rawJson}
                      onChange={(e) => setRawJson(e.target.value)}
                      style={{ width: "100%", height: 220, marginTop: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      placeholder="Extract draft JSON will appear here after Extract."
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
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
              <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Criteria codes</th>
            </tr>
          </thead>
          <tbody>
            {los.map((lo: any) => (
              <tr key={lo.loCode} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: 8, fontWeight: 700, verticalAlign: "top" }}>{lo.loCode}</td>
                <td style={{ padding: 8, verticalAlign: "top" }}>{lo.description || ""}</td>
                <td style={{ padding: 8, verticalAlign: "top" }}>
                  {(lo.criteria || []).map((c: any) => c.acCode).join(", ") || "(none)"}
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
