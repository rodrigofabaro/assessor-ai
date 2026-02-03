"use client";

import { useEffect, useMemo, useState } from "react";

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

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts?.headers || {}) },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${msg ? ` — ${msg}` : ""}`);
  }
  return (await res.json()) as T;
}

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

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const u = await jsonFetch<any>("/api/units");
      setUnits(asArray<Unit>(u));

      const d = await jsonFetch<any>("/api/reference-documents?type=BRIEF");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        body: JSON.stringify({ ivRecords: merged }),
      });
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
        body: JSON.stringify({ ivRecords: merged }),
      });
    } catch (e: any) {
      setIvError(e?.message || String(e));
    } finally {
      setIvBusy(false);
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
  };
}
