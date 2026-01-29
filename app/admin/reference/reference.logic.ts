"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ReferenceDocument = {
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

export type LearningOutcome = {
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

export type Unit = {
  id: string;
  unitCode: string;
  unitTitle: string;
  status: "DRAFT" | "LOCKED";
  learningOutcomes: LearningOutcome[];
};

export type Criterion = {
  id: string;
  acCode: string;
  gradeBand: "PASS" | "MERIT" | "DISTINCTION";
  description: string;
  learningOutcome: { id: string; loCode: string; unitId: string };
};

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || (data as any)?.message || "Request failed");
  return data as T;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function badge(status: ReferenceDocument["status"]): { cls: string; text: string } {
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

export function useReferenceAdmin() {
  const fileRef = useRef<HTMLInputElement | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep raw JSON in sync when selecting a document
  useEffect(() => {
    if (!selectedDoc) {
      setRawJson("");
      setBriefUnitId("");
      setMapSelected({});
      setAssignmentCodeInput("");
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
  }, [selectedDoc, units, allCriteria]);

  async function uploadDoc() {
    setError(null);

    const fileFromDom = fileRef.current?.files?.[0] || null;
    const fileToUse = docFile || fileFromDom;
    if (!fileToUse) return setError("Pick a file first.");

    setBusy("Uploading...");
    try {
      const fd = new FormData();
      fd.set("type", docType);
      fd.set("title", docTitle || fileToUse.name);
      fd.set("version", docVersion || "1");
      fd.set("file", fileToUse);

      await jsonFetch("/api/reference-documents", { method: "POST", body: fd });

      setDocTitle("");
      setDocVersion("1");
      setDocFile(null);
      if (fileRef.current) fileRef.current.value = "";
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

    setBusy("Extracting...");
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

    setBusy("Locking...");
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

  return {
    // data
    documents,
    units,
    busy,
    error,
    selectedDoc,
    selectedDocId,

    // upload
    docType,
    docTitle,
    docVersion,
    docFile,
    fileRef,

    // brief mapping
    briefUnitId,
    mapSelected,
    showRawJson,
    rawJson,
    assignmentCodeInput,
    criteriaForSelectedUnit,

    // setters
    setSelectedDocId,
    setDocType,
    setDocTitle,
    setDocVersion,
    setDocFile,
    setBriefUnitId,
    setMapSelected,
    setShowRawJson,
    setRawJson,
    setAssignmentCodeInput,

    // actions
    uploadDoc,
    extractSelected,
    lockSelected,
    refreshAll,
  };
}
