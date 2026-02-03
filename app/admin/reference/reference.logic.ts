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

type InboxFilters = {
  q: string;
  type: "" | ReferenceDocument["type"];
  status: "" | ReferenceDocument["status"];
  onlyLocked: boolean;
  onlyUnlocked: boolean;
  sort: "updated" | "uploaded" | "title";
};

type ReferenceAdminOptions = {
  context?: string;
  fixedInboxType?: "" | ReferenceDocument["type"];
  fixedUploadType?: "" | ReferenceDocument["type"];
};


const FILTERS_KEY = "assessorai.reference.inboxFilters.v1";

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || (data as any)?.message || "Request failed");
  }
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

function safeParseFilters(): InboxFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) throw new Error("no saved");
    const parsed = JSON.parse(raw) as Partial<InboxFilters>;
    return {
      q: typeof parsed.q === "string" ? parsed.q : "",
      type: (parsed.type as any) || "",
      status: (parsed.status as any) || "",
      onlyLocked: !!parsed.onlyLocked,
      onlyUnlocked: !!parsed.onlyUnlocked,
      sort: parsed.sort === "title" || parsed.sort === "uploaded" || parsed.sort === "updated" ? parsed.sort : "updated",
    };
  } catch {
    return {
      q: "",
      type: "",
      status: "",
      onlyLocked: false,
      onlyUnlocked: false,
      sort: "updated",
    };
  }
}

function docSearchHaystack(d: ReferenceDocument) {
  const meta = d.sourceMeta || {};
  const parts = [
    d.title,
    d.originalFilename,
    d.type,
    d.status,
    meta.unitCode ? `unit ${String(meta.unitCode)}` : "",
    meta.assignmentCode ? String(meta.assignmentCode) : "",
    meta.specIssue ? String(meta.specIssue) : "",
    meta.specVersionLabel ? String(meta.specVersionLabel) : "",
  ]
    .filter(Boolean)
    .join(" ");
  return parts.toLowerCase();
}

export function useReferenceAdmin(opts: ReferenceAdminOptions = {}) {

  const fileRef = useRef<HTMLInputElement | null>(null);

  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload
  const [docType, setDocType] = useState<ReferenceDocument["type"]>(
  (opts.fixedUploadType as any) || "SPEC"
);

  const [docTitle, setDocTitle] = useState("");
  const [docVersion, setDocVersion] = useState("1");
  const [docFile, setDocFile] = useState<File | null>(null);

  // Selection
  const [selectedDocId, setSelectedDocId] = useState<string>("");

  // Inbox filters (persisted)
  const [filters, setFilters] = useState<InboxFilters>(() => {
    if (typeof window === "undefined") {
      return { q: "", type: "", status: "", onlyLocked: false, onlyUnlocked: false, sort: "updated" };
    }
    return safeParseFilters();
  });

  // Brief mapping override
  const [briefUnitId, setBriefUnitId] = useState<string>("");
  const [mapSelected, setMapSelected] = useState<Record<string, boolean>>({});
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [assignmentCodeInput, setAssignmentCodeInput] = useState("");

  // Persist filters
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // ignore
    }
  }, [filters]);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) || null,
    [documents, selectedDocId]
  );

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

const filteredDocuments = useMemo(() => {
  const q = filters.q.trim().toLowerCase();
  let list = documents.slice();

  // ✅ HARD RULE: if fixedInboxType is set (Specs page), never show anything else
  const fixedInboxType = opts.fixedInboxType;
  if (fixedInboxType) {
    list = list.filter((d) => d.type === fixedInboxType);
  } else if (filters.type) {
    list = list.filter((d) => d.type === filters.type);
  }

  if (filters.status) list = list.filter((d) => d.status === filters.status);

  if (filters.onlyLocked) list = list.filter((d) => !!d.lockedAt || d.status === "LOCKED");
  if (filters.onlyUnlocked) list = list.filter((d) => !d.lockedAt && d.status !== "LOCKED");

  if (q) list = list.filter((d) => docSearchHaystack(d).includes(q));

  if (filters.sort === "title") {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else if (filters.sort === "uploaded") {
    list.sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
  } else {
    const key = (d: ReferenceDocument) => {
      const m = d.sourceMeta || {};
      return String(m.updatedAt || m.extractedAt || d.uploadedAt || "");
    };
    list.sort((a, b) => key(b).localeCompare(key(a)));
  }

  return list;
}, [documents, filters, opts.fixedInboxType]);


  async function refreshAll({ keepSelection }: { keepSelection?: boolean } = {}) {
    const [docs, unitsRes] = await Promise.all([
      (() => {
  const params = new URLSearchParams();

  const effectiveType = opts.fixedInboxType || filters.type || "";
  if (effectiveType) params.set("type", effectiveType);

  // optional (keep server-side filtering aligned with your UI)
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.onlyLocked) params.set("onlyLocked", "true");
  if (filters.onlyUnlocked) params.set("onlyUnlocked", "true");

  const url = `/api/reference-documents${params.toString() ? `?${params.toString()}` : ""}`;
  return jsonFetch<{ documents: ReferenceDocument[] }>(url);
})(),

      jsonFetch<{ units: Unit[] }>("/api/units"),
    ]);

    setDocuments(docs.documents || []);
    setUnits(unitsRes.units || []);

    // Preserve selection if possible; otherwise auto-select first filtered item.
    if (keepSelection && selectedDocId && (docs.documents || []).some((d) => d.id === selectedDocId)) {
      return;
    }

    // If nothing selected, pick the first doc (prefer filtered list, else all docs)
    if (!selectedDocId) {
      const first = (docs.documents || [])[0];
      if (first) setSelectedDocId(first.id);
    }
  }

  useEffect(() => {
    refreshAll({ keepSelection: true }).catch((e) => setError(String(e?.message || e)));
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

      await refreshAll({ keepSelection: false });
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
      await refreshAll({ keepSelection: true });
    } catch (e: any) {
      setError(e?.message || "Extract failed");
    } finally {
      setBusy(null);
    }
  }

  async function reextractSelected() {
    setError(null);
    if (!selectedDoc) return;

    const ok = window.confirm(
      "Re-extract will OVERWRITE the extracted structure for this LOCKED document.\n\nThe unit stays locked. Use only to fix a bad parse.\n\nContinue?"
    );
    if (!ok) return;

    const reason =
      window.prompt("Optional note for the audit trail (why are you re-extracting?)", "Fix extraction") || "";

    setBusy("Re-extracting...");
    try {
      await jsonFetch("/api/reference-documents/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: selectedDoc.id, forceReextract: true, reason }),
      });
      await refreshAll({ keepSelection: true });
    } catch (e: any) {
      setError(e?.message || "Re-extract failed");
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

      await refreshAll({ keepSelection: true });
    } catch (e: any) {
      setError(e?.message || "Lock failed");
    } finally {
      setBusy(null);
    }
  }

  function resetFilters() {
    setFilters({ q: "", type: "", status: "", onlyLocked: false, onlyUnlocked: false, sort: "updated" });
  }

  return {
    // data
    documents,
    filteredDocuments,
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

    // filters
    filters,
    setFilters,
    resetFilters,

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
    reextractSelected,
    lockSelected,
    refreshAll,
  };
}
