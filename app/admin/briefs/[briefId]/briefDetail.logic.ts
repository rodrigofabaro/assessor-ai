"use client";

import { useEffect, useMemo, useState } from "react";
import { jsonFetch } from "@/lib/http";
import { notifyToast } from "@/lib/ui/toast";

export type Unit = {
  id: string;
  unitCode: string;
  unitTitle: string;
  status: string;
  specIssue?: string | null;
  specVersionLabel?: string | null;
  lockedAt?: string | null;
  specDocumentId?: string | null;
  assignmentBriefs?: AssignmentBrief[];
};

export type AssignmentBrief = {
  id: string;
  assignmentCode: string;
  title: string;
  status: string;
  assignmentNumber?: number | null;
  totalAssignments?: number | null;
  aiasLevel?: string | null;
  lockedAt?: string | null;
  unitId: string;
  briefDocumentId?: string | null;
};

export type ReferenceDocument = {
  id: string;
  type: string;
  status: string;
  title: string;
  version: number;
  originalFilename: string;
  uploadedAt?: string;
  updatedAt?: string;
  lockedAt?: string | null;
  extractedJson?: any;
  extractionWarnings?: any;
  sourceMeta?: any;
};

export type BriefTask = {
  n: number;
  label: string;
  title?: string | null;
  heading?: string | null;
  text: string;
  warnings?: string[];
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

export type IvOutcome = "APPROVED" | "CHANGES_REQUIRED" | "REJECTED";

export type IvRecord = {
  id: string;
  academicYear: string; // e.g., "2025-26"
  verifierName?: string | null;
  verificationDate?: string | null; // keep as string for audit (matches PDF style)
  outcome: IvOutcome;
  notes?: string | null;
  createdAt: string;
  attachment?: {
    documentId: string;
    originalFilename: string;
    uploadedAt: string;
    size: number;
    storagePath?: string | null;
  } | null;
};

export type RubricAttachment = {
  documentId: string;
  originalFilename: string;
  uploadedAt: string;
  uploadedBy?: string | null;
};

function asArray<T>(x: any): T[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.documents)) return x.documents;
  if (x && Array.isArray(x.units)) return x.units;
  return [];
}

function norm(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function guessAssignmentCode(doc: ReferenceDocument): string | null {
  const a = doc?.extractedJson?.assignmentCode || doc?.extractedJson?.assignmentCodeGuess;
  if (typeof a === "string" && a.trim()) return a.trim().toUpperCase();
  const s = `${doc.title || ""} ${doc.originalFilename || ""}`;
  const m = s.match(/\bA\s*([123])\b/i) || s.match(/\bA([123])\b/i);
  return m ? `A${m[1]}` : null;
}

function guessUnitCode(doc: ReferenceDocument): string | null {
  const u = doc?.extractedJson?.unitCodeGuess || doc?.extractedJson?.unit?.unitCode || doc?.sourceMeta?.unitCode;
  if (typeof u === "string" && u.trim()) return u.trim();
  const s = `${doc.title || ""} ${doc.originalFilename || ""}`;
  const m = s.match(/\b(40\d{2}|50\d{2})\b/);
  return m ? m[1] : null;
}

function safeIvRecords(x: any): IvRecord[] {
  const arr = Array.isArray(x) ? x : [];
  return arr
    .filter(Boolean)
    .map((r: any) => ({
      id: String(r.id || ""),
      academicYear: String(r.academicYear || ""),
      verifierName: r.verifierName ?? null,
      verificationDate: r.verificationDate ?? null,
      outcome: (r.outcome || "CHANGES_REQUIRED") as IvOutcome,
      notes: r.notes ?? null,
      createdAt: String(r.createdAt || ""),
      attachment: r.attachment
        ? {
            documentId: String(r.attachment.documentId || ""),
            originalFilename: String(r.attachment.originalFilename || ""),
            uploadedAt: String(r.attachment.uploadedAt || ""),
            size: Number(r.attachment.size || 0),
            storagePath: r.attachment.storagePath ? String(r.attachment.storagePath) : null,
          }
        : null,
    }))
    .filter((r) => r.id && r.academicYear)
    .sort((a, b) => (b.academicYear || "").localeCompare(a.academicYear || ""));
}

export function useBriefDetail(briefId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [docs, setDocs] = useState<ReferenceDocument[]>([]);
  const [specDocs, setSpecDocs] = useState<ReferenceDocument[]>([]);

  const [ivBusy, setIvBusy] = useState(false);
  const [ivError, setIvError] = useState<string | null>(null);
  const [ivRecords, setIvRecords] = useState<IvRecord[]>([]);
  const [tasksBusy, setTasksBusy] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksOverride, setTasksOverride] = useState<BriefTask[] | null>(null);
  const [docUsage, setDocUsage] = useState<ReferenceDocumentUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [rubric, setRubric] = useState<RubricAttachment | null>(null);
  const [rubricBusy, setRubricBusy] = useState(false);
  const [rubricError, setRubricError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const u = await jsonFetch<any>("/api/units", { cache: "no-store" });
      setUnits(asArray<Unit>(u));

      const d = await jsonFetch<any>("/api/reference-documents?type=BRIEF", { cache: "no-store" });
      setDocs(asArray<ReferenceDocument>(d));

      const s = await jsonFetch<any>("/api/reference-documents?type=SPEC", { cache: "no-store" });
      setSpecDocs(asArray<ReferenceDocument>(s));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!briefId) return;
    refresh();
  }, [briefId]);

  const brief = useMemo(() => {
    for (const u of units || []) {
      for (const b of u.assignmentBriefs || []) {
        if (b.id === briefId) return { ...b, unit: u };
      }
    }
    return null as any;
  }, [units, briefId]);

  const familyDocs = useMemo(() => {
    if (!brief) return [];
    const unitCode = brief.unit?.unitCode;
    const assignmentCode = (brief.assignmentCode || "").toUpperCase();

    const filtered = (docs || []).filter((d) => {
      const du = guessUnitCode(d);
      const da = guessAssignmentCode(d);
      if (unitCode && du && du !== unitCode) return false;
      if (assignmentCode && da && da !== assignmentCode) return false;

      // If guesses are missing, fall back to weak title match
      if (!du && !da) {
        const hay = norm(`${d.title} ${d.originalFilename}`);
        const need = norm(`${brief.unit?.unitCode || ""} ${brief.assignmentCode || ""}`);
        if (need && !hay.includes(need)) return false;
      }
      return true;
    });

    // prefer locked first, then higher versions
    return filtered.sort((a, b) => {
      const al = a.lockedAt ? 1 : 0;
      const bl = b.lockedAt ? 1 : 0;
      if (al !== bl) return bl - al;
      return (b.version || 0) - (a.version || 0);
    });
  }, [docs, brief]);

  const linkedDoc = useMemo(() => {
    if (!brief) return null;
    if (brief.briefDocumentId) return (docs || []).find((d) => d.id === brief.briefDocumentId) || null;
    // fallback: first locked doc
    return familyDocs.find((d) => !!d.lockedAt) || familyDocs[0] || null;
  }, [brief, docs, familyDocs]);

  const mappedSpecDoc = useMemo(() => {
    if (!brief) return null;

    if (brief.unit?.specDocumentId) {
      const byId = (specDocs || []).find((d) => d.id === brief.unit?.specDocumentId);
      if (byId) return byId;
    }

    const unitCode = brief.unit?.unitCode || "";
    const targetIssue = (brief.unit?.specIssue || brief.unit?.specVersionLabel || "").toLowerCase().trim();

    const unitMatches = (specDocs || []).filter((d) => {
      const docUnitCode = (d.sourceMeta?.unitCode || d.extractedJson?.unit?.unitCode || "").toLowerCase().trim();
      return !unitCode || (docUnitCode && docUnitCode === unitCode.toLowerCase().trim());
    });

    if (targetIssue) {
      const withIssue = unitMatches.find((d) => {
        const issue = String(
          d.sourceMeta?.specIssue ||
            d.sourceMeta?.specVersionLabel ||
            d.extractedJson?.unit?.specIssue ||
            d.extractedJson?.unit?.specVersionLabel ||
            "",
        )
          .toLowerCase()
          .trim();
        return issue === targetIssue;
      });
      if (withIssue) return withIssue;
    }

    return unitMatches.sort((a, b) => {
      const al = a.lockedAt ? 1 : 0;
      const bl = b.lockedAt ? 1 : 0;
      if (al !== bl) return bl - al;
      return (b.version || 0) - (a.version || 0);
    })[0] || null;
  }, [brief, specDocs]);

  const title = useMemo(() => {
    if (!brief) return "Brief detail";
    return `${brief.unit?.unitCode || ""} ${brief.assignmentCode} — ${brief.title}`;
  }, [brief]);

  const pdfHref = linkedDoc ? `/api/reference-documents/${linkedDoc.id}/file` : "";

  useEffect(() => {
    if (!linkedDoc?.id) {
      setTasksOverride(null);
      return;
    }
    const next = linkedDoc?.sourceMeta?.tasksOverride;
    setTasksOverride(Array.isArray(next) ? (next as BriefTask[]) : null);
  }, [linkedDoc?.id, linkedDoc?.sourceMeta]);

  const refreshUsage = async (docId: string) => {
    setUsageLoading(true);
    try {
      const usage = await jsonFetch<ReferenceDocumentUsage>(`/api/reference-documents/${docId}/usage`, { cache: "no-store" });
      setDocUsage(usage);
    } catch (e: any) {
      setDocUsage(null);
      setError(e?.message || String(e));
      notifyToast("error", e?.message || "Failed to load brief usage.");
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (!linkedDoc?.id || linkedDoc.type !== "BRIEF") {
      setDocUsage(null);
      return;
    }
    refreshUsage(linkedDoc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedDoc?.id, linkedDoc?.lockedAt]);

  const canUnlock = !!linkedDoc?.lockedAt && !!docUsage?.canUnlock;
  const canDelete = !!linkedDoc && !linkedDoc.lockedAt && !!docUsage?.canDelete;

  const loadIv = async () => {
    if (!briefId) return;
    setIvBusy(true);
    setIvError(null);
    try {
      const res = await jsonFetch<any>(`/api/briefs/${briefId}/iv`, { cache: "no-store" });
      const recs = safeIvRecords(res?.records);
      setIvRecords(recs);
    } catch (e: any) {
      setIvError(e?.message || String(e));
      setIvRecords([]);
    } finally {
      setIvBusy(false);
    }
  };

  useEffect(() => {
    if (!briefId) return;
    loadIv();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefId, linkedDoc?.id]);

  const addIvRecord = async (partial: Omit<IvRecord, "id" | "createdAt">) => {
    if (!briefId) return;
    setIvBusy(true);
    setIvError(null);
    try {
      const res = await jsonFetch<any>(`/api/briefs/${briefId}/iv`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(partial),
      });
      const recs = safeIvRecords(res?.records);
      setIvRecords(recs);
      notifyToast("success", "IV record saved.");
    } catch (e: any) {
      const message = e?.message || "Failed to save IV record.";
      setIvError(message);
      notifyToast("error", message);
    } finally {
      setIvBusy(false);
    }
  };

  const deleteIvRecord = async (id: string) => {
    if (!briefId) return;
    setIvBusy(true);
    setIvError(null);
    try {
      const res = await jsonFetch<any>(`/api/briefs/${briefId}/iv/${id}`, { method: "DELETE" });
      const recs = safeIvRecords(res?.records);
      setIvRecords(recs);
      notifyToast("success", "IV record deleted.");
    } catch (e: any) {
      const message = e?.message || "Failed to delete IV record.";
      setIvError(message);
      notifyToast("error", message);
    } finally {
      setIvBusy(false);
    }
  };

  const uploadIvAttachment = async (id: string, file: File) => {
    if (!briefId) return;
    setIvBusy(true);
    setIvError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await jsonFetch<any>(`/api/briefs/${briefId}/iv/${id}/attachment`, {
        method: "POST",
        body: form,
      });
      const recs = safeIvRecords(res?.records);
      setIvRecords(recs);
      notifyToast("success", "IV form uploaded.");
    } catch (e: any) {
      const message = e?.message || "Failed to upload IV form.";
      setIvError(message);
      notifyToast("error", message);
    } finally {
      setIvBusy(false);
    }
  };

  const loadRubric = async () => {
    if (!briefId) return;
    setRubricBusy(true);
    setRubricError(null);
    try {
      const res = await jsonFetch<any>(`/api/briefs/${briefId}/rubric`, { cache: "no-store" });
      setRubric(res?.attachment || null);
    } catch (e: any) {
      const message = e?.message || "Failed to load rubric.";
      setRubricError(message);
    } finally {
      setRubricBusy(false);
    }
  };

  useEffect(() => {
    if (!briefId) return;
    loadRubric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefId, linkedDoc?.id]);

  const uploadRubric = async (file: File) => {
    if (!briefId) return;
    setRubricBusy(true);
    setRubricError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await jsonFetch<any>(`/api/briefs/${briefId}/rubric`, {
        method: "POST",
        body: form,
      });
      setRubric(res?.attachment || null);
      notifyToast("success", "Rubric uploaded.");
    } catch (e: any) {
      const message = e?.message || "Failed to upload rubric.";
      setRubricError(message);
      notifyToast("error", message);
    } finally {
      setRubricBusy(false);
    }
  };

  const removeRubric = async () => {
    if (!briefId) return;
    setRubricBusy(true);
    setRubricError(null);
    try {
      const res = await jsonFetch<any>(`/api/briefs/${briefId}/rubric`, { method: "DELETE" });
      setRubric(res?.attachment || null);
      notifyToast("success", "Rubric removed.");
    } catch (e: any) {
      const message = e?.message || "Failed to remove rubric.";
      setRubricError(message);
      notifyToast("error", message);
    } finally {
      setRubricBusy(false);
    }
  };

  const saveTasksOverride = async (next: BriefTask[] | null) => {
    if (!linkedDoc?.id) return;
    setTasksBusy(true);
    setTasksError(null);
    try {
      const res = await jsonFetch<any>(`/api/reference-documents/${linkedDoc.id}/meta`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tasksOverride: next }),
      });
      const nextMeta = res?.sourceMeta || {};
      setTasksOverride(Array.isArray(next) ? next : null);
      setDocs((prev) => prev.map((d) => (d.id === linkedDoc.id ? { ...d, sourceMeta: nextMeta } : d)));
      notifyToast("success", "Tasks override saved.");
    } catch (e: any) {
      const message = e?.message || "Failed to save tasks override.";
      setTasksError(message);
      notifyToast("error", message);
    } finally {
      setTasksBusy(false);
    }
  };

  const saveEquationLatex = async (equationId: string, latex: string) => {
    if (!linkedDoc?.id || !equationId || !latex.trim()) return;
    const prev = linkedDoc?.sourceMeta?.equationLatexOverrides || {};
    const merged = { ...prev, [equationId]: latex.trim() };
    try {
      const res = await jsonFetch<any>(`/api/reference-documents/${linkedDoc.id}/meta`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equationLatexOverrides: merged }),
      });
      const nextMeta = res?.sourceMeta || {};
      setDocs((docs) => docs.map((d) => (d.id === linkedDoc.id ? { ...d, sourceMeta: nextMeta } : d)));
      notifyToast("success", "Equation LaTeX saved.");
    } catch (e: any) {
      notifyToast("error", e?.message || "Failed to save equation LaTeX.");
      throw e;
    }
  };

  const unlockLinkedDoc = async () => {
    if (!linkedDoc?.id) return;
    setError(null);
    if (!linkedDoc.lockedAt) {
      const message = "Brief PDF is not locked.";
      setError(message);
      notifyToast("error", message);
      return;
    }
    if (docUsage?.inUse) {
      const message = "This brief is linked to submissions and cannot be unlocked.";
      setError(message);
      notifyToast("error", message);
      return;
    }

    const ok = window.confirm("Unlock this brief PDF? This removes the lock and returns it to extracted state.");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await jsonFetch<any>("/api/reference-documents/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: linkedDoc.id }),
      });
      if (res?.document) {
        setDocs((prev) => prev.map((d) => (d.id === linkedDoc.id ? res.document : d)));
        await refreshUsage(linkedDoc.id);
      }
      notifyToast("success", "Brief unlocked.");
    } catch (e: any) {
      const message = e?.message || "Unlock failed";
      setError(message);
      notifyToast("error", message);
    } finally {
      setBusy(false);
    }
  };

  const deleteLinkedDoc = async () => {
    if (!linkedDoc?.id) return;
    setError(null);
    if (linkedDoc.lockedAt) {
      const message = "Locked briefs cannot be deleted. Unlock first if deletion is required.";
      setError(message);
      notifyToast("error", message);
      return;
    }
    if (docUsage?.inUse) {
      const message = "This brief is already linked to submissions and cannot be deleted.";
      setError(message);
      notifyToast("error", message);
      return;
    }

    const ok = window.confirm("Delete this brief PDF? This cannot be undone.");
    if (!ok) return;

    setBusy(true);
    try {
      await jsonFetch(`/api/reference-documents/${linkedDoc.id}`, { method: "DELETE" });
      await refresh();
      notifyToast("success", "Brief deleted.");
    } catch (e: any) {
      const message = e?.message || "Delete failed";
      setError(message);
      notifyToast("error", message);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    refresh,
    brief,
    linkedDoc,
    mappedSpecDoc,
    familyDocs,
    title,
    pdfHref,

    ivBusy,
    ivError,
    ivRecords,
    addIvRecord,
    deleteIvRecord,
    uploadIvAttachment,
    rubric,
    rubricBusy,
    rubricError,
    uploadRubric,
    removeRubric,
    canUnlock,
    canDelete,
    tasksOverride,
    tasksBusy,
    tasksError,
    saveTasksOverride,
    saveEquationLatex,
    docUsage,
    usageLoading,
    unlockLinkedDoc,
    deleteLinkedDoc,
  };
}
