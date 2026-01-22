"use client";

import { useEffect, useMemo, useState } from "react";

type ReferenceDocument = {
  id: string;
  type: "SPEC" | "BRIEF" | "RUBRIC";
  title: string;
  version: number;
  originalFilename: string;
  checksumSha256: string;
  uploadedAt: string;
};

type Criterion = {
  id: string;
  acCode: string;
  gradeBand: "PASS" | "MERIT" | "DISTINCTION";
  description: string;
  learningOutcome: { id: string; loCode: string; unitId: string };
};

type LearningOutcome = {
  id: string;
  loCode: string;
  description: string;
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
  specDocumentId?: string | null;
  learningOutcomes: LearningOutcome[];
  assignmentBriefs: Array<{
    id: string;
    assignmentCode: string;
    title: string;
  }>;
};

type Brief = {
  id: string;
  assignmentCode: string;
  title: string;
  unit: { id: string; unitCode: string; unitTitle: string };
  criteriaMaps: Array<{
    assessmentCriterion: {
      id: string;
      acCode: string;
      gradeBand: "PASS" | "MERIT" | "DISTINCTION";
      learningOutcome: { loCode: string };
    };
  }>;
};

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

export default function ReferenceAdminPage() {
  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload doc form
  const [docType, setDocType] = useState<ReferenceDocument["type"]>("SPEC");
  const [docTitle, setDocTitle] = useState("");
  const [docVersion, setDocVersion] = useState("1");
  const [docFile, setDocFile] = useState<File | null>(null);

  // Create unit form
  const [unitCode, setUnitCode] = useState("");
  const [unitTitle, setUnitTitle] = useState("");
  const [unitSpecDocId, setUnitSpecDocId] = useState<string>("");

  // Add LO form
  const [loUnitId, setLoUnitId] = useState<string>("");
  const [loCode, setLoCode] = useState("");
  const [loDesc, setLoDesc] = useState("");

  // Add criterion form
  const [critLoId, setCritLoId] = useState<string>("");
  const [critCode, setCritCode] = useState("");
  const [critBand, setCritBand] = useState<"PASS" | "MERIT" | "DISTINCTION">("PASS");
  const [critDesc, setCritDesc] = useState("");

  // Create brief form
  const [briefUnitId, setBriefUnitId] = useState<string>("");
  const [briefCode, setBriefCode] = useState("A1");
  const [briefTitle, setBriefTitle] = useState("");
  const [briefDocId, setBriefDocId] = useState<string>("");

  // Mapping UI
  const [mapBriefId, setMapBriefId] = useState<string>("");
  const [mapSelected, setMapSelected] = useState<Record<string, boolean>>({});

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
    // order P->M->D then code
    out.sort((a, b) => {
      const rank = (x: string) => (x === "PASS" ? 1 : x === "MERIT" ? 2 : 3);
      const r = rank(a.gradeBand) - rank(b.gradeBand);
      if (r !== 0) return r;
      return a.acCode.localeCompare(b.acCode);
    });
    return out;
  }, [units]);

  async function refreshAll() {
    const [docs, unitsRes, briefsRes] = await Promise.all([
      jsonFetch<{ documents: ReferenceDocument[] }>("/api/reference-documents"),
      jsonFetch<{ units: Unit[] }>("/api/units"),
      jsonFetch<{ briefs: Brief[] }>("/api/assignment-briefs"),
    ]);
    setDocuments(docs.documents);
    setUnits(unitsRes.units);
    setBriefs(briefsRes.briefs);
  }

  useEffect(() => {
    refreshAll().catch((e) => setError(String(e?.message || e)));
  }, []);

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

  async function createUnit() {
    setError(null);
    setBusy("Creating unit...");
    try {
      await jsonFetch("/api/units", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitCode,
          unitTitle,
          specDocumentId: unitSpecDocId || null,
        }),
      });
      setUnitCode("");
      setUnitTitle("");
      setUnitSpecDocId("");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Create failed");
    } finally {
      setBusy(null);
    }
  }

  async function addLO() {
    setError(null);
    if (!loUnitId) return setError("Pick a unit first.");
    setBusy("Adding learning outcome...");
    try {
      await jsonFetch(`/api/units/${loUnitId}/learning-outcomes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loCode, description: loDesc }),
      });
      setLoCode("");
      setLoDesc("");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Create failed");
    } finally {
      setBusy(null);
    }
  }

  async function addCriterion() {
    setError(null);
    if (!critLoId) return setError("Pick a learning outcome first.");
    setBusy("Adding criterion...");
    try {
      await jsonFetch(`/api/learning-outcomes/${critLoId}/criteria`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acCode: critCode,
          gradeBand: critBand,
          description: critDesc,
        }),
      });
      setCritCode("");
      setCritDesc("");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Create failed");
    } finally {
      setBusy(null);
    }
  }

  async function createBrief() {
    setError(null);
    if (!briefUnitId) return setError("Pick a unit first.");
    setBusy("Creating assignment brief...");
    try {
      await jsonFetch("/api/assignment-briefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitId: briefUnitId,
          assignmentCode: briefCode,
          title: briefTitle,
          briefDocumentId: briefDocId || null,
        }),
      });
      setBriefCode("A1");
      setBriefTitle("");
      setBriefDocId("");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Create failed");
    } finally {
      setBusy(null);
    }
  }

  function loadBriefMapping(briefId: string) {
    setMapBriefId(briefId);
    const brief = briefs.find((b) => b.id === briefId);
    const selected: Record<string, boolean> = {};
    for (const m of brief?.criteriaMaps || []) {
      selected[m.assessmentCriterion.id] = true;
    }
    setMapSelected(selected);
  }

  async function saveMapping() {
    setError(null);
    if (!mapBriefId) return setError("Pick a brief first.");
    setBusy("Saving mapping...");
    try {
      const ids = Object.entries(mapSelected)
        .filter(([, v]) => v)
        .map(([k]) => k);

      await jsonFetch(`/api/assignment-briefs/${mapBriefId}/map`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ criterionIds: ids }),
      });
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Map failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1>Phase 2 — Reference Library</h1>
      <p style={{ marginTop: 4, color: "#444" }}>
        Upload specs/briefs and build structured LO/AC data. This becomes the
        “ground truth” used later for AI grading + audit logs.
      </p>

      {busy && (
        <div style={{ padding: 10, background: "#fff6d6", border: "1px solid #f1d27a", borderRadius: 8, margin: "12px 0" }}>
          {busy}
        </div>
      )}
      {error && (
        <div style={{ padding: 10, background: "#ffe4e4", border: "1px solid #ffb3b3", borderRadius: 8, margin: "12px 0" }}>
          {error}
        </div>
      )}

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>1) Upload reference document</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Type{" "}
            <select value={docType} onChange={(e) => setDocType(e.target.value as any)}>
              <option value="SPEC">SPEC</option>
              <option value="BRIEF">BRIEF</option>
              <option value="RUBRIC">RUBRIC</option>
            </select>
          </label>
          <label>
            Title{" "}
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Unit 4017 Spec" />
          </label>
          <label>
            Version{" "}
            <input value={docVersion} onChange={(e) => setDocVersion(e.target.value)} style={{ width: 80 }} />
          </label>
          <input type="file" accept=".pdf,.docx" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
          <button onClick={uploadDoc}>Upload</button>
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>Uploaded documents</strong>
          <div style={{ marginTop: 6, fontSize: 14, color: "#444" }}>
            {documents.length === 0 ? "None yet." : null}
          </div>
          <ul>
            {documents.map((d) => (
              <li key={d.id}>
                <b>{d.type}</b> v{d.version} — {d.title} ({d.originalFilename}){" "}
                <span style={{ color: "#666" }}>
                  • {new Date(d.uploadedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>2) Create unit (link to spec doc optional)</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={unitCode} onChange={(e) => setUnitCode(e.target.value)} placeholder="Unit code (e.g. 4017)" />
          <input value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} placeholder="Unit title" style={{ width: 320 }} />
          <select value={unitSpecDocId} onChange={(e) => setUnitSpecDocId(e.target.value)}>
            <option value="">(no spec doc linked)</option>
            {documents
              .filter((d) => d.type === "SPEC")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} (v{d.version})
                </option>
              ))}
          </select>
          <button onClick={createUnit}>Create unit</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Units</strong>
          <ul>
            {units.map((u) => (
              <li key={u.id}>
                <b>{u.unitCode}</b> — {u.unitTitle}{" "}
                {u.specDocumentId ? <span style={{ color: "#666" }}>• linked spec</span> : <span style={{ color: "#999" }}>• no spec linked</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>3) Add Learning Outcome (LO)</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={loUnitId} onChange={(e) => setLoUnitId(e.target.value)}>
            <option value="">Select unit…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unitCode} — {u.unitTitle}
              </option>
            ))}
          </select>
          <input value={loCode} onChange={(e) => setLoCode(e.target.value)} placeholder="LO code (e.g. LO1)" style={{ width: 110 }} />
          <input value={loDesc} onChange={(e) => setLoDesc(e.target.value)} placeholder="LO description" style={{ width: 520 }} />
          <button onClick={addLO}>Add LO</button>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>4) Add Assessment Criterion (AC)</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={critLoId} onChange={(e) => setCritLoId(e.target.value)}>
            <option value="">Select LO…</option>
            {units.flatMap((u) =>
              u.learningOutcomes.map((lo) => (
                <option key={lo.id} value={lo.id}>
                  {u.unitCode} {lo.loCode}
                </option>
              ))
            )}
          </select>
          <input value={critCode} onChange={(e) => setCritCode(e.target.value)} placeholder="AC code (P1/M1/D1)" style={{ width: 160 }} />
          <select value={critBand} onChange={(e) => setCritBand(e.target.value as any)}>
            <option value="PASS">PASS</option>
            <option value="MERIT">MERIT</option>
            <option value="DISTINCTION">DISTINCTION</option>
          </select>
          <input value={critDesc} onChange={(e) => setCritDesc(e.target.value)} placeholder="AC description" style={{ width: 520 }} />
          <button onClick={addCriterion}>Add AC</button>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>5) Create assignment brief (A1/A2...)</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={briefUnitId} onChange={(e) => setBriefUnitId(e.target.value)}>
            <option value="">Select unit…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unitCode} — {u.unitTitle}
              </option>
            ))}
          </select>
          <input value={briefCode} onChange={(e) => setBriefCode(e.target.value)} placeholder="A1" style={{ width: 90 }} />
          <input value={briefTitle} onChange={(e) => setBriefTitle(e.target.value)} placeholder="Brief title" style={{ width: 360 }} />
          <select value={briefDocId} onChange={(e) => setBriefDocId(e.target.value)}>
            <option value="">(no brief doc linked)</option>
            {documents
              .filter((d) => d.type === "BRIEF")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} (v{d.version})
                </option>
              ))}
          </select>
          <button onClick={createBrief}>Create brief</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Briefs</strong>
          <ul>
            {briefs.map((b) => (
              <li key={b.id}>
                <button onClick={() => loadBriefMapping(b.id)} style={{ marginRight: 8 }}>
                  Map ACs
                </button>
                <b>{b.unit.unitCode}</b> {b.assignmentCode} — {b.title}{" "}
                <span style={{ color: "#666" }}>• mapped: {b.criteriaMaps.length}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 14, marginBottom: 30 }}>
        <h2 style={{ marginTop: 0 }}>6) Map criteria to a brief</h2>
        {!mapBriefId ? (
          <p style={{ color: "#666" }}>Pick a brief above, then map which ACs it assesses.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={saveMapping}>Save mapping</button>
              <span style={{ color: "#666" }}>
                Selected: {Object.values(mapSelected).filter(Boolean).length} / {allCriteria.length}
              </span>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10 }}>
              {allCriteria.map((c) => (
                <label key={c.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!mapSelected[c.id]}
                    onChange={(e) => setMapSelected((s) => ({ ...s, [c.id]: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  <b>{c.acCode}</b> ({c.gradeBand}) — <span style={{ color: "#666" }}>{c.learningOutcome.loCode}</span>
                  <div style={{ marginTop: 6, color: "#444" }}>{c.description}</div>
                </label>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
