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
    }))
    .filter((r) => r.id && r.academicYear)
    .sort((a, b) => (b.academicYear || "").localeCompare(a.academicYear || ""));
}

function mkId() {
  // cheap unique ID for client-side creation
  return `iv_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function useBriefDetail(briefId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [docs, setDocs] = useState<ReferenceDocument[]>([]);

  const [ivBusy, setIvBusy] = useState(false);
  const [ivError, setIvError] = useState<string | null>(null);
  const [ivRecords, setIvRecords] = useState<IvRecord[]>([]);
  const [tasksBusy, setTasksBusy] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksOverride, setTasksOverride] = useState<BriefTask[] | null>(null);
  const [docUsage, setDocUsage] = useState<ReferenceDocumentUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const u = await jsonFetch<any>("/api/units", { cache: "no-store" });
      setUnits(asArray<Unit>(u));

      const d = await jsonFetch<any>("/api/reference-documents?type=BRIEF", { cache: "no-store" });
      setDocs(asArray<ReferenceDocument>(d));
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

  const loadIv = async (docId: string) => {
    setIvBusy(true);
    setIvError(null);
    try {
      const meta = await jsonFetch<any>(`/api/reference-documents/${docId}/meta`);
      const recs = safeIvRecords(meta?.sourceMeta?.ivRecords);
      setIvRecords(recs);
    } catch (e: any) {
      setIvError(e?.message || String(e));
      setIvRecords([]);
    } finally {
      setIvBusy(false);
    }
  };

  useEffect(() => {
    if (!linkedDoc?.id) return;
    loadIv(linkedDoc.id);
  }, [linkedDoc?.id]);

  const addIvRecord = async (partial: Omit<IvRecord, "id" | "createdAt">) => {
    if (!linkedDoc?.id) return;
    setIvBusy(true);
    setIvError(null);
    try {
      const next: IvRecord = {
        id: mkId(),
        createdAt: new Date().toISOString(),
        ...partial,
      };
      const merged = [next, ...ivRecords];
      setIvRecords(merged);

      await jsonFetch<any>(`/api/reference-documents/${linkedDoc.id}/meta`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ivRecords: merged }),
      });
      notifyToast("success", "IV record saved.");
    } catch (e: any) {
      setIvError(e?.message || String(e));
    } finally {
      setIvBusy(false);
    }
  };

  const deleteIvRecord = async (id: string) => {
    if (!linkedDoc?.id) return;
    setIvBusy(true);
    setIvError(null);
    try {
      const merged = ivRecords.filter((r) => r.id !== id);
      setIvRecords(merged);

      await jsonFetch<any>(`/api/reference-documents/${linkedDoc.id}/meta`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ivRecords: merged }),
      });
      notifyToast("success", "IV record deleted.");
    } catch (e: any) {
      setIvError(e?.message || String(e));
    } finally {
      setIvBusy(false);
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
    familyDocs,

    ivBusy,
    ivError,
    ivRecords,
    addIvRecord,
    deleteIvRecord,
    tasksOverride,
    tasksBusy,
    tasksError,
    saveTasksOverride,
    docUsage,
    usageLoading,
    unlockLinkedDoc,
    deleteLinkedDoc,
  };
}
