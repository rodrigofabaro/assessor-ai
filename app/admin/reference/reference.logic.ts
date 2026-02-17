"use client";

import { useEffect, useMemo, useState } from "react";
import { jsonFetch } from "@/lib/http";
import { notifyToast } from "@/lib/ui/toast";

export type ReferenceDocument = {
  id: string;
  type: "SPEC" | "BRIEF" | "RUBRIC" | "IV_FORM";
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

export type ReferenceDocumentUsage = {
  documentId: string;
  locked: boolean;
  inUse: boolean;
  submissionCount: number;
  linkedBriefCount: number;
  canUnlock: boolean;
  canDelete: boolean;
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
  specIssue?: string | null;
  specVersionLabel?: string | null;
  lockedAt?: string | null;
  specDocumentId?: string | null;
  sourceMeta?: any | null;
  learningOutcomes: LearningOutcome[];
  assignmentBriefs?: Array<{
    id: string;
    assignmentCode?: string | null;
    title?: string | null;
  }> | null;
};

export type Criterion = {
  id: string;
  acCode: string;
  gradeBand: "PASS" | "MERIT" | "DISTINCTION";
  description: string;
  learningOutcome: { id: string; loCode: string; unitId: string; description?: string };
};

type InboxFilters = {
  q: string;
  type: "" | ReferenceDocument["type"];
  status: "" | ReferenceDocument["status"];
  onlyLocked: boolean;
  onlyUnlocked: boolean;
  sort: "updated" | "uploaded" | "title";
};

export type InboxFiltersState = InboxFilters;

type ReferenceAdminOptions = {
  context?: string;
  fixedInboxType?: "" | ReferenceDocument["type"];
  fixedUploadType?: "" | ReferenceDocument["type"];
  includeArchived?: boolean;
};

type LockConflict = {
  existingBriefId: string;
  existingTitle?: string | null;
  unitCode?: string | null;
  assignmentCode?: string | null;
  retryPayload: any;
};

const FILTERS_KEY = "assessorai.reference.inboxFilters.v1";

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function stripExtension(name: string) {
  return name.replace(/\.[^/.]+$/, "");
}

function summarizeCleanupCandidates(extractedJson: any, taskNumbers?: number[] | null) {
  const tasks = Array.isArray(extractedJson?.tasks) ? extractedJson.tasks : [];
  const filter = Array.isArray(taskNumbers) && taskNumbers.length ? new Set(taskNumbers) : null;
  const rows: string[] = [];
  for (const task of tasks) {
    const n = Number(task?.n);
    if (filter && Number.isInteger(n) && !filter.has(n)) continue;
    const label = String(task?.label || (task?.n ? `Task ${task.n}` : "Task")).trim();
    const ws = Array.isArray(task?.warnings) ? task.warnings.map((w: any) => String(w).trim()) : [];
    const reasons = ws.filter(
      (w) =>
        /math layout: broken line wraps/i.test(w) ||
        /equation quality: low-confidence/i.test(w) ||
        /possible end-matter contamination/i.test(w)
    );
    if (!reasons.length) continue;
    rows.push(`${label}: ${reasons.join("; ")}`);
  }
  return rows;
}

function parseTaskNumbersInput(raw: string): number[] {
  const out = new Set<number>();
  const pieces = String(raw || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const piece of pieces) {
    if (/^\d+$/.test(piece)) {
      const n = Number(piece);
      if (Number.isInteger(n) && n > 0) out.add(n);
      continue;
    }
    // Support "1d" style input by targeting task 1 only.
    const partScoped = piece.match(/^(\d+)[a-z]$/i);
    if (partScoped) {
      const n = Number(partScoped[1]);
      if (Number.isInteger(n) && n > 0) out.add(n);
      continue;
    }
    // Support common variants like "3(b)", "3.b", "task3", "task-3a".
    const leadingDigits = piece.match(/(\d+)/);
    if (leadingDigits) {
      const n = Number(leadingDigits[1]);
      if (Number.isInteger(n) && n > 0) out.add(n);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

function shouldOfferCleanup(extractedJson: any, selectedTasks?: number[]) {
  const tasks = Array.isArray(extractedJson?.tasks) ? extractedJson.tasks : [];
  const filter = Array.isArray(selectedTasks) && selectedTasks.length ? new Set(selectedTasks) : null;
  return tasks.some((task: any) => {
    const n = Number(task?.n);
    if (filter && Number.isInteger(n) && !filter.has(n)) return false;
    const ws = Array.isArray(task?.warnings) ? task.warnings.map((w: any) => String(w).toLowerCase()) : [];
    return ws.some((w: string) => w.includes("math layout: broken line wraps") || w.includes("equation quality: low-confidence"));
  });
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

export function getDocumentHint(d: ReferenceDocument): string {
  const meta = d.sourceMeta || {};
  return [meta.unitCode ? `Unit ${meta.unitCode}` : "", meta.assignmentCode ? meta.assignmentCode : ""]
    .filter(Boolean)
    .join(" • ");
}

export function getInboxCounts(documents: ReferenceDocument[], filteredDocuments: ReferenceDocument[]) {
  const total = documents.length;
  const shown = filteredDocuments.length;
  const byStatus: Record<string, number> = {};
  for (const d of documents) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  return { total, shown, byStatus };
}

export const STATUS_FILTER_OPTIONS = ["UPLOADED", "EXTRACTED", "LOCKED", "FAILED"] as const;

export function useReferenceAdmin(opts: ReferenceAdminOptions = {}) {

  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedDocUsage, setSelectedDocUsage] = useState<ReferenceDocumentUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockConflict, setLockConflict] = useState<LockConflict | null>(null);
  const [unitNotice, setUnitNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Upload
  const [docType, setDocType] = useState<ReferenceDocument["type"]>((opts.fixedUploadType as any) || "SPEC");

  useEffect(() => {
    if (opts.fixedUploadType) {
      setDocType(opts.fixedUploadType as ReferenceDocument["type"]);
    }
  }, [opts.fixedUploadType]);

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
  const [rawJsonDirty, setRawJsonDirty] = useState(false);
  const [rawJsonDocId, setRawJsonDocId] = useState<string | null>(null);
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

  const selectedUnit = useMemo(() => {
    if (!selectedDoc || selectedDoc.type !== "SPEC") return null;
    return units.find((u) => u.specDocumentId === selectedDoc.id) || null;
  }, [selectedDoc, units]);

  const allCriteria: Criterion[] = useMemo(() => {
    const out: Criterion[] = [];
    for (const u of units) {
      for (const lo of u.learningOutcomes) {
        for (const c of lo.criteria) {
          out.push({
            ...c,
            learningOutcome: { id: lo.id, loCode: lo.loCode, unitId: u.id, description: lo.description || "" },
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

  const [editUnitCode, setEditUnitCode] = useState("");
  const [editUnitTitle, setEditUnitTitle] = useState("");
  const [editSpecLabel, setEditSpecLabel] = useState("");

  const unitDirty = useMemo(() => {
    if (!selectedUnit) return false;
    const aCode = String(selectedUnit.unitCode || "").trim();
    const aTitle = String(selectedUnit.unitTitle || "").trim();
    const aIssue = String(selectedUnit.specVersionLabel || selectedUnit.specIssue || "").trim();

    const bCode = String(editUnitCode || "").trim();
    const bTitle = String(editUnitTitle || "").trim();
    const bIssue = String(editSpecLabel || "").trim();

    return aCode !== bCode || aTitle !== bTitle || aIssue !== bIssue;
  }, [selectedUnit, editUnitCode, editUnitTitle, editSpecLabel]);

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
        return jsonFetch<{ documents: ReferenceDocument[] }>(url, { cache: "no-store" });
      })(),

      jsonFetch<{ units: Unit[] }>("/api/units", { cache: "no-store" }),
    ]);

    const rawDocs = docs.documents || [];
    const filteredDocs = opts.includeArchived ? rawDocs : rawDocs.filter((d) => !(d.sourceMeta as any)?.archived);

    setDocuments(filteredDocs);
    setUnits(unitsRes.units || []);

    // Preserve selection if possible; otherwise auto-select first filtered item.
    if (keepSelection && selectedDocId && filteredDocs.some((d) => d.id === selectedDocId)) {
      return;
    }

    // If nothing selected, pick the first doc (prefer filtered list, else all docs)
    if (!selectedDocId) {
      const first = filteredDocs[0];
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
      setRawJsonDirty(false);
      setRawJsonDocId(null);
      setBriefUnitId("");
      setMapSelected({});
      setAssignmentCodeInput("");
      setSelectedDocUsage(null);
      return;
    }

    const manualDraft = (() => {
      const v = (selectedDoc.sourceMeta as any)?.manualDraft;
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    })();
    const draft = manualDraft || selectedDoc.extractedJson;
    const switchedDoc = rawJsonDocId !== selectedDoc.id;
    if (switchedDoc || !rawJsonDirty) {
      setRawJson(draft ? JSON.stringify(draft, null, 2) : "");
      setRawJsonDirty(false);
      setRawJsonDocId(selectedDoc.id);
    }

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
  }, [selectedDoc, units, allCriteria, rawJsonDirty, rawJsonDocId]);

  function updateRawJson(next: string) {
    setRawJson(next);
    setRawJsonDirty(true);
    if (selectedDoc?.id) setRawJsonDocId(selectedDoc.id);
  }

  async function saveRawJsonDraft() {
    if (!selectedDoc) return;
    setError(null);
    const text = String(rawJson || "").trim();
    if (!text) {
      setError("Manual override JSON is empty.");
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setError(`Manual override JSON is invalid: ${e?.message || "parse error"}`);
      return;
    }

    setBusy("Saving override draft...");
    try {
      const prevMeta = ((selectedDoc.sourceMeta as any) || {}) as Record<string, unknown>;
      const sourceMeta = { ...prevMeta, manualDraft: parsed };
      await jsonFetch(`/api/reference-documents/${selectedDoc.id}/meta`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualDraft: parsed }),
      });
      applyUpdatedDocument({ ...selectedDoc, sourceMeta } as ReferenceDocument);
      setRawJson(JSON.stringify(parsed, null, 2));
      setRawJsonDirty(false);
      notifyToast("success", "Manual override draft saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save manual override draft.");
    } finally {
      setBusy(null);
    }
  }

  async function clearRawJsonDraft() {
    if (!selectedDoc) return;
    setError(null);
    setBusy("Clearing override draft...");
    try {
      const prevMeta = ((selectedDoc.sourceMeta as any) || {}) as Record<string, unknown>;
      const sourceMeta = { ...prevMeta, manualDraft: null };
      await jsonFetch(`/api/reference-documents/${selectedDoc.id}/meta`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualDraft: null }),
      });
      applyUpdatedDocument({ ...selectedDoc, sourceMeta } as ReferenceDocument);
      const fallback = selectedDoc.extractedJson;
      setRawJson(fallback ? JSON.stringify(fallback, null, 2) : "");
      setRawJsonDirty(false);
      notifyToast("success", "Manual override draft cleared.");
    } catch (e: any) {
      setError(e?.message || "Failed to clear manual override draft.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshSelectedUsage(docId: string) {
    setUsageLoading(true);
    try {
      const usage = await jsonFetch<ReferenceDocumentUsage>(`/api/reference-documents/${docId}/usage`, { cache: "no-store" });
      setSelectedDocUsage(usage);
    } catch (e: any) {
      setSelectedDocUsage(null);
      setError(e?.message || String(e));
      notifyToast("error", e?.message || "Failed to load brief usage.");
    } finally {
      setUsageLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedDoc?.id || selectedDoc.type !== "BRIEF") {
      setSelectedDocUsage(null);
      return;
    }
    refreshSelectedUsage(selectedDoc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.id, selectedDoc?.lockedAt]);

  useEffect(() => {
    if (!selectedUnit) {
      setEditUnitCode("");
      setEditUnitTitle("");
      setEditSpecLabel("");
      setUnitNotice(null);
      return;
    }

    setEditUnitCode(String(selectedUnit.unitCode || ""));
    setEditUnitTitle(String(selectedUnit.unitTitle || ""));
    setEditSpecLabel(String(selectedUnit.specVersionLabel || selectedUnit.specIssue || ""));
    setUnitNotice(null);
  }, [selectedUnit]);

  function applyUpdatedDocument(doc: ReferenceDocument) {
    if (!doc?.id) return;
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.id === doc.id);
      if (idx === -1) return [doc, ...prev];
      const next = [...prev];
      next[idx] = doc;
      return next;
    });
    setSelectedDocId(doc.id);
    if (doc.type === "BRIEF") refreshSelectedUsage(doc.id);
  }

  async function readResponseData(res: Response) {
    const rawText = await res.text().catch(() => "");
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json") && rawText) {
      try {
        return JSON.parse(rawText);
      } catch {
        return rawText;
      }
    }
    return rawText;
  }

  async function uploadDoc() {
    setError(null);

    const fileToUse = docFile;
    if (!fileToUse) return setError("Pick a file first.");

    setBusy("Uploading...");
    try {
      const uploadType = (opts.fixedUploadType as ReferenceDocument["type"]) || docType;
      const fd = new FormData();
      fd.set("type", uploadType);
      fd.set("title", docTitle || fileToUse.name);
      fd.set("version", docVersion || "1");
      fd.set("file", fileToUse);

      await jsonFetch("/api/reference-documents", { method: "POST", body: fd });

      setDocTitle("");
      setDocVersion("1");
      setDocFile(null);

      await refreshAll({ keepSelection: false });
      notifyToast("success", "Reference document uploaded.");
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadFiles(files: File[]) {
    setError(null);
    if (!files.length) return;
    if (busy) {
      notifyToast("warn", "Another action is in progress. Please wait.");
      return;
    }

    const valid = files.filter(isPdfFile);
    const skipped = files.filter((f) => !isPdfFile(f));
    if (skipped.length) {
      notifyToast(
        "warn",
        skipped.length === files.length
          ? "Only PDF files are supported."
          : `Skipped ${skipped.length} file(s). Only PDF files are supported.`
      );
    }
    if (!valid.length) return;

    const uploadType = (opts.fixedUploadType as ReferenceDocument["type"]) || docType;
    let okCount = 0;
    let failCount = 0;
    let lastFailReason = "";
    try {
      for (let i = 0; i < valid.length; i += 1) {
        const file = valid[i];
        setBusy(`Uploading ${i + 1}/${valid.length}...`);
        const fd = new FormData();
        fd.set("type", uploadType);
        fd.set("title", stripExtension(file.name) || file.name);
        fd.set("version", "1");
        fd.set("file", file);

        const res = await fetch("/api/reference-documents", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failCount += 1;
          lastFailReason = (data as any)?.error || (data as any)?.message || "Upload failed";
          continue;
        }
        okCount += 1;
      }

      if (okCount > 0) {
        await refreshAll({ keepSelection: false });
        notifyToast("success", `Uploaded ${okCount} file${okCount > 1 ? "s" : ""}. Ready to extract.`);
      }

      if (failCount > 0) {
        const reason = lastFailReason || "Upload failed";
        setError(`Upload failed: ${reason}`);
        notifyToast("error", `Upload failed: ${reason}`);
      }
    } catch (e: any) {
      const message = e?.message || "Upload failed";
      setError(message);
      notifyToast("error", message);
    } finally {
      setBusy(null);
    }
  }

  async function extractSelected() {
    setError(null);
    if (!selectedDoc) return;

    setBusy("Extracting...");
    try {
      const res = await jsonFetch<any>("/api/reference-documents/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: selectedDoc.id, runOpenAiCleanup: false }),
      });
      if (res?.document) applyUpdatedDocument(res.document);

      if (selectedDoc.type === "BRIEF" && shouldOfferCleanup(res?.extractedJson)) {
        const lines = summarizeCleanupCandidates(res?.extractedJson);
        const details = lines.length ? `\n\nDetected issues:\n- ${lines.join("\n- ")}` : "";
        const ok = window.confirm(
          `Extraction found warning patterns and can run OpenAI cleanup.${details}\n\nProceed with AI cleanup now?`
        );
        if (ok) {
          const cleanupRes = await jsonFetch<any>("/api/reference-documents/extract", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ documentId: selectedDoc.id, runOpenAiCleanup: true }),
          });
          if (cleanupRes?.document) applyUpdatedDocument(cleanupRes.document);
          notifyToast("success", "Extraction complete with OpenAI cleanup.");
          await refreshAll({ keepSelection: true });
          return;
        }
      }
      await refreshAll({ keepSelection: true });
      notifyToast("success", "Extraction complete.");
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
    let taskNumbers: number[] = [];
    if (selectedDoc.type === "BRIEF") {
      const rawTasks = window.prompt(
        "Optional: task numbers to re-extract only (example: 1 or 3,4). You can type 1d to target Task 1 context. Leave blank for full re-extract.",
        ""
      );
      if (rawTasks === null) return;
      taskNumbers = parseTaskNumbersInput(rawTasks);
    }

    setBusy(taskNumbers.length ? `Re-extracting tasks ${taskNumbers.join(", ")}...` : "Re-extracting...");
    try {
      const res = await jsonFetch<any>("/api/reference-documents/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: selectedDoc.id,
          forceReextract: true,
          reason,
          runOpenAiCleanup: false,
          ...(taskNumbers.length ? { taskNumbers } : {}),
        }),
      });
      if (res?.document) applyUpdatedDocument(res.document);

      if (selectedDoc.type === "BRIEF" && shouldOfferCleanup(res?.extractedJson, taskNumbers)) {
        const lines = summarizeCleanupCandidates(res?.extractedJson, taskNumbers);
        const details = lines.length ? `\n\nDetected issues:\n- ${lines.join("\n- ")}` : "";
        const ok = window.confirm(
          `Re-extraction found warning patterns and can run OpenAI cleanup.${details}\n\nProceed with AI cleanup now?`
        );
        if (ok) {
          const cleanupRes = await jsonFetch<any>("/api/reference-documents/extract", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              documentId: selectedDoc.id,
              forceReextract: true,
              reason,
              runOpenAiCleanup: true,
              ...(taskNumbers.length ? { taskNumbers } : {}),
            }),
          });
          if (cleanupRes?.document) applyUpdatedDocument(cleanupRes.document);
          notifyToast(
            "success",
            taskNumbers.length
              ? `Task re-extraction complete with OpenAI cleanup (tasks: ${taskNumbers.join(", ")}).`
              : "Re-extraction complete with OpenAI cleanup."
          );
          await refreshAll({ keepSelection: true });
          return;
        }
      }
      await refreshAll({ keepSelection: true });
      notifyToast(
        "success",
        taskNumbers.length
          ? `Task re-extraction complete (tasks: ${taskNumbers.join(", ")}).`
          : "Re-extraction complete."
      );
    } catch (e: any) {
      setError(e?.message || "Re-extract failed");
    } finally {
      setBusy(null);
    }
  }

  async function lockSelected() {
    setError(null);
    setLockConflict(null);
    if (!selectedDoc) return;

    setBusy("Locking...");
    try {
      let draft: any = undefined;
      if (showRawJson && rawJson.trim()) {
        draft = JSON.parse(rawJson);
      } else {
        const savedDraft = (selectedDoc.sourceMeta as any)?.manualDraft;
        if (savedDraft && typeof savedDraft === "object" && !Array.isArray(savedDraft)) {
          draft = savedDraft;
        }
      }

      const body: any = { documentId: selectedDoc.id };
      if (draft) body.draft = draft;

      if (selectedDoc.type === "BRIEF") {
        if (assignmentCodeInput.trim()) body.assignmentCode = assignmentCodeInput.trim();
        if (briefUnitId) body.unitId = briefUnitId;
      }

      const res = await fetch("/api/reference-documents/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readResponseData(res);

      if (!res.ok) {
        if (res.status === 409 && data?.error === "BRIEF_ALREADY_LOCKED") {
          const unit = units.find((u) => u.id === briefUnitId);
          const fallbackAssignment = assignmentCodeInput.trim() || draft?.assignmentCode || "";
          setLockConflict({
            existingBriefId: data?.existingBriefId,
            existingTitle: data?.existingTitle,
            unitCode: unit?.unitCode || draft?.unitCodeGuess || null,
            assignmentCode: fallbackAssignment || null,
            retryPayload: { ...body, allowOverwrite: true },
          });
          const message = "A locked brief already exists for this unit and assignment.";
          setError(message);
          notifyToast("error", message);
          return;
        }
        const message = data?.message || data?.error || `Lock failed (${res.status}).`;
        setError(message);
        notifyToast("error", message);
        return;
      }

      if (data?.document) applyUpdatedDocument(data.document);
      await refreshAll({ keepSelection: true });
      notifyToast("success", "Reference document locked.");
    } catch (e: any) {
      const message = e?.message || "Lock failed";
      setError(message);
      notifyToast("error", message);
    } finally {
      setBusy(null);
    }
  }

  async function confirmLockOverwrite() {
    if (!lockConflict?.retryPayload) return;
    setError(null);
    setLockConflict(null);
    setBusy("Locking...");
    try {
      const res = await fetch("/api/reference-documents/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lockConflict.retryPayload),
      });
      const data = await readResponseData(res);
      if (!res.ok) {
        const message = data?.message || data?.error || `Lock failed (${res.status}).`;
        setError(message);
        notifyToast("error", message);
        return;
      }
      if (data?.document) applyUpdatedDocument(data.document);
      await refreshAll({ keepSelection: true });
      notifyToast("success", "Reference document locked.");
    } catch (e: any) {
      const message = e?.message || "Lock failed";
      setError(message);
      notifyToast("error", message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelectedDocument() {
    setError(null);
    if (!selectedDoc) return;
    if (selectedDoc.lockedAt) {
      const message = "Locked briefs cannot be deleted. Unlock first if deletion is required.";
      setError(message);
      notifyToast("error", message);
      return;
    }
    if (selectedDocUsage?.inUse) {
      const message = "This brief is already linked to submissions and cannot be deleted.";
      setError(message);
      notifyToast("error", message);
      return;
    }

    const ok = window.confirm("Delete this brief PDF? This cannot be undone.");
    if (!ok) return;

    setBusy("Deleting...");
    try {
      const res = await fetch(`/api/reference-documents/${selectedDoc.id}`, { method: "DELETE" });
      const data = await readResponseData(res);
      if (!res.ok) {
        const message =
          data?.message ||
          (data?.error === "BRIEF_IN_USE"
            ? "This brief is already linked to submissions and cannot be deleted."
            : data?.error) ||
          `Delete failed (${res.status}).`;
        setError(message);
        notifyToast("error", message);
        return;
      }

      await refreshAll({ keepSelection: false });
      notifyToast("success", "Brief deleted.");
    } catch (e: any) {
      const message = e?.message || "Delete failed";
      setError(message);
      notifyToast("error", message);
    } finally {
      setBusy(null);
    }
  }

  async function unlockSelectedDocument() {
    setError(null);
    if (!selectedDoc) return;
    if (!selectedDoc.lockedAt) {
      const message = "Brief is not locked.";
      setError(message);
      notifyToast("error", message);
      return;
    }
    if (selectedDocUsage?.inUse) {
      const message = "This brief is linked to submissions and cannot be unlocked.";
      setError(message);
      notifyToast("error", message);
      return;
    }

    const ok = window.confirm("Unlock this brief PDF? This removes the lock and returns it to extracted state.");
    if (!ok) return;

    setBusy("Unlocking...");
    try {
      const res = await fetch("/api/reference-documents/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: selectedDoc.id }),
      });
      const data = await readResponseData(res);
      if (!res.ok) {
        const message =
          data?.message ||
          (data?.error === "BRIEF_IN_USE"
            ? "This brief is already linked to submissions and cannot be unlocked."
            : data?.error) ||
          `Unlock failed (${res.status}).`;
        setError(message);
        notifyToast("error", message);
        return;
      }

      if (data?.document) applyUpdatedDocument(data.document);
      await refreshAll({ keepSelection: true });
      notifyToast("success", "Brief unlocked.");
    } catch (e: any) {
      const message = e?.message || "Unlock failed";
      setError(message);
      notifyToast("error", message);
    } finally {
      setBusy(null);
    }
  }

  function resetFilters() {
    setFilters({ q: "", type: "", status: "", onlyLocked: false, onlyUnlocked: false, sort: "updated" });
  }

  async function archiveSelectedDocument() {
    setError(null);
    if (!selectedDoc) return;

    setBusy("Archiving...");
    try {
      await jsonFetch(`/api/reference-documents/${selectedDoc.id}/archive`, { method: "POST" });
      await refreshAll({ keepSelection: false });
      notifyToast("success", "Reference document archived.");
    } catch (e: any) {
      const message = e?.message || "Archive failed";
      setError(message);
      throw e;
    } finally {
      setBusy(null);
    }
  }

  async function saveSelectedUnit() {
    setUnitNotice(null);
    if (!selectedUnit) return;

    setBusy("Saving unit...");
    try {
      const unitCode = String(editUnitCode || "").trim();
      const unitTitle = String(editUnitTitle || "").trim();
      const specLabel = String(editSpecLabel || "").trim();

      await jsonFetch(`/api/units/${selectedUnit.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitCode,
          unitTitle,
          specVersionLabel: specLabel,
          specIssue: specLabel,
        }),
      });

      if (selectedDoc) {
        await jsonFetch(`/api/reference-documents/${selectedDoc.id}/meta`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            unitCode,
            unitTitle,
            specVersionLabel: specLabel,
            specIssue: specLabel,
          }),
        });
      }

      await refreshAll({ keepSelection: true });
      setUnitNotice({ tone: "success", text: "Saved unit metadata." });
      notifyToast("success", "Unit metadata saved.");
    } catch (e: any) {
      const message = e?.message || "Save failed";
      setUnitNotice({ tone: "error", text: `Failed to save: ${message}` });
    } finally {
      setBusy(null);
    }
  }

  async function saveSelectedDocEquationLatex(equationId: string, latex: string) {
    if (!selectedDoc?.id || !equationId || !latex.trim()) return;
    const prev = selectedDoc?.sourceMeta?.equationLatexOverrides || {};
    const merged = { ...prev, [equationId]: latex.trim() };
    await jsonFetch(`/api/reference-documents/${selectedDoc.id}/meta`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ equationLatexOverrides: merged }),
    });
    setDocuments((docs) =>
      docs.map((d) =>
        d.id === selectedDoc.id
          ? { ...d, sourceMeta: { ...(d.sourceMeta || {}), equationLatexOverrides: merged } }
          : d
      )
    );
    notifyToast("success", "Equation LaTeX saved.");
  }

  async function saveSelectedDocTaskLatex(taskNumber: number, overridesByPart: Record<string, string>) {
    if (!selectedDoc?.id || !Number.isFinite(taskNumber) || taskNumber < 1) return;
    const prev = (selectedDoc?.sourceMeta?.taskLatexOverrides || {}) as Record<string, string>;
    const next: Record<string, string> = { ...prev };
    const prefix = `${taskNumber}.`;
    for (const k of Object.keys(next)) {
      if (k.startsWith(prefix)) delete next[k];
    }
    for (const [partKey, latex] of Object.entries(overridesByPart || {})) {
      const key = `${taskNumber}.${String(partKey || "").trim().toLowerCase()}`;
      const value = String(latex || "").trim();
      if (!key || !value) continue;
      next[key] = value;
    }
    await jsonFetch(`/api/reference-documents/${selectedDoc.id}/meta`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskLatexOverrides: next }),
    });
    setDocuments((docs) =>
      docs.map((d) =>
        d.id === selectedDoc.id
          ? { ...d, sourceMeta: { ...(d.sourceMeta || {}), taskLatexOverrides: next } }
          : d
      )
    );
    notifyToast("success", "Task LaTeX overrides saved.");
  }

  async function toggleUnitArchive() {
    setUnitNotice(null);
    if (!selectedUnit) return;

    const nextArchived = !(selectedUnit.sourceMeta as any)?.archived;
    setBusy(nextArchived ? "Archiving..." : "Unarchiving...");
    try {
      await jsonFetch(`/api/units/${selectedUnit.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceMeta: { ...(selectedUnit.sourceMeta || {}), archived: nextArchived },
        }),
      });
      await refreshAll({ keepSelection: true });
      setUnitNotice({ tone: "success", text: nextArchived ? "Unit archived." : "Unit unarchived." });
      notifyToast("success", nextArchived ? "Unit archived." : "Unit unarchived.");
    } catch (e: any) {
      const message = e?.message || "Archive failed";
      setUnitNotice({ tone: "error", text: `Failed to archive: ${message}` });
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelectedUnit() {
    setUnitNotice(null);
    if (!selectedUnit) return;

    const briefsArr = Array.isArray(selectedUnit.assignmentBriefs) ? selectedUnit.assignmentBriefs : [];
    if (briefsArr.length) {
      const list = briefsArr
        .slice(0, 3)
        .map((b) => b?.assignmentCode || b?.title || b?.id)
        .filter(Boolean)
        .join(", ");

      setUnitNotice({
        tone: "error",
        text:
          `Cannot delete ${selectedUnit.unitCode} — it has ${briefsArr.length} bound brief(s). ` +
          (list ? `Examples: ${list}. ` : "") +
          "Archive it instead (or unbind briefs first).",
      });
      return;
    }

    const ok = window.confirm(
      `Delete ${selectedUnit.unitCode} — ${selectedUnit.unitTitle}?\n\nThis will remove its Learning Outcomes and Criteria too.`
    );
    if (!ok) return;

    setBusy("Deleting...");
    try {
      await jsonFetch(`/api/units/${selectedUnit.id}`, { method: "DELETE" });
      await refreshAll({ keepSelection: false });
      setUnitNotice({ tone: "success", text: "Unit deleted." });
      notifyToast("success", "Unit deleted.");
    } catch (e: any) {
      const message = e?.message || "Delete failed";
      setUnitNotice({ tone: "error", text: `Failed to delete: ${message}` });
    } finally {
      setBusy(null);
    }
  }

  return {
    // data
    documents,
    filteredDocuments,
    units,
    busy,
    error,
    selectedDoc,
    selectedUnit,
    selectedDocId,
    selectedDocUsage,
    usageLoading,

    // upload
    docType,
    docTitle,
    docVersion,
    docFile,

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
    setRawJson: updateRawJson,
    setAssignmentCodeInput,
    setEditUnitCode,
    setEditUnitTitle,
    setEditSpecLabel,

    // actions
    uploadDoc,
    uploadFiles,
    extractSelected,
    reextractSelected,
    lockSelected,
    confirmLockOverwrite,
    refreshAll,
    archiveSelectedDocument,
    deleteSelectedDocument,
    unlockSelectedDocument,
    saveSelectedUnit,
    saveSelectedDocEquationLatex,
    saveSelectedDocTaskLatex,
    saveRawJsonDraft,
    clearRawJsonDraft,
    toggleUnitArchive,
    deleteSelectedUnit,

    editUnitCode,
    editUnitTitle,
    editSpecLabel,
    unitDirty,
    unitNotice,
    lockConflict,
    setLockConflict,
  };
}
