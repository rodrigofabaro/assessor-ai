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
  assignmentCode: string; // A1/A2/A3
  title: string;
  status: string;
  assignmentNumber?: number | null;
  totalAssignments?: number | null;
  aiasLevel?: string | null;
  lockedAt?: string | null;
  unitId: string;
  briefDocumentId?: string | null;
};

export type IvOutcome = "APPROVED" | "CHANGES_REQUIRED" | "REJECTED";

export type IvRecord = {
  id: string;
  academicYear: string;
  verifierName?: string | null;
  verificationDate?: string | null;
  outcome: IvOutcome;
  notes?: string | null;
  createdAt: string;
};

export type ReferenceDocument = {
  id: string;
  type: string; // BRIEF/SPEC
  status: string;
  title: string;
  version: number;
  originalFilename: string;
  uploadedAt?: string;
  updatedAt?: string;
  lockedAt?: string | null;
  extractedJson?: any;
  extractionWarnings?: any;
  sourceMeta?: any; // includes ivRecords
};

export function tone(kind: "ok" | "warn" | "bad" | "info" | "muted") {
  switch (kind) {
    case "ok":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "warn":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    case "bad":
      return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
    case "info":
      return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
    default:
      return "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200";
  }
}

export function statusTone(status: string) {
  const s = (status || "").toUpperCase();
  if (s.includes("LOCK")) return tone("ok");
  if (s.includes("FAIL") || s.includes("ERROR")) return tone("bad");
  if (s.includes("RUN") || s.includes("MAP")) return tone("info");
  if (s.includes("UPLOADED") || s.includes("PEND") || s.includes("DRAFT")) return tone("warn");
  return tone("muted");
}

export function ivTone(outcome: IvOutcome) {
  if (outcome === "APPROVED") return tone("ok");
  if (outcome === "REJECTED") return tone("bad");
  return tone("warn");
}

function asArray<T>(x: any): T[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.units)) return x.units;
  if (x && Array.isArray(x.documents)) return x.documents;
  return [];
}

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${msg ? ` — ${msg}` : ""}`);
  }
  return (await res.json()) as T;
}

function norm(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
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
    .filter((r) => r.id && r.academicYear);
}

function pickYearFromHeader(doc?: ReferenceDocument | null): string | null {
  const y = doc?.extractedJson?.header?.academicYear;
  if (typeof y === "string" && y.trim()) return y.trim();
  return null;
}

function pickHeaderDate(doc: ReferenceDocument | null | undefined, key: "issueDate" | "finalSubmissionDate" | "verificationDate") {
  const v = doc?.extractedJson?.header?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export type BriefRow = AssignmentBrief & {
  unit?: Unit;
  linkedDoc?: ReferenceDocument | null;
  headerYear?: string | null;
  issueDate?: string | null;
  finalSubmissionDate?: string | null;
  ivForYear?: IvRecord | null;
};

export function useBriefsAdmin() {
  const [tab, setTab] = useState<"library" | "extract">("library");

  const [units, setUnits] = useState<Unit[]>([]);
  const [docs, setDocs] = useState<ReferenceDocument[]>([]);

  const [q, setQ] = useState("");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [onlyLockedDocs, setOnlyLockedDocs] = useState<boolean>(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const u = await jsonFetch<any>("/api/units");
      setUnits(asArray<Unit>(u));

      const d = await jsonFetch<any>(`/api/reference-documents?type=BRIEF${onlyLockedDocs ? "&onlyLocked=true" : ""}`);
      setDocs(asArray<ReferenceDocument>(d));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // hash tabs: /admin/briefs#extract
    if (typeof window !== "undefined") {
      const h = window.location.hash.replace("#", "");
      if (h === "extract") setTab("extract");
      if (h === "library") setTab("library");
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyLockedDocs]);

  const unitOptions = useMemo(() => {
    const arr = Array.isArray(units) ? units : [];
    return arr.map((u) => ({ id: u.id, label: `${u.unitCode} — ${u.unitTitle}` }));
  }, [units]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of Array.isArray(units) ? units : []) for (const b of u.assignmentBriefs || []) set.add((b.status || "").toUpperCase());
    return Array.from(set).filter(Boolean).sort();
  }, [units]);

  const rows = useMemo(() => {
    const all: BriefRow[] = [];
    const unitsArr = Array.isArray(units) ? units : [];
    const docsArr = Array.isArray(docs) ? docs : [];

    // Map docs by id for quick lookup
    const docById = new Map(docsArr.map((d) => [d.id, d]));

    for (const u of unitsArr) {
      for (const b of u.assignmentBriefs || []) {
        const linkedDoc = b.briefDocumentId ? (docById.get(b.briefDocumentId) || null) : null;
        const headerYear = pickYearFromHeader(linkedDoc);
        const issueDate = pickHeaderDate(linkedDoc, "issueDate");
        const finalSubmissionDate = pickHeaderDate(linkedDoc, "finalSubmissionDate");

        let ivForYear: IvRecord | null = null;
        if (linkedDoc && headerYear) {
          const ivs = safeIvRecords(linkedDoc?.sourceMeta?.ivRecords);
          ivForYear = ivs.find((r) => norm(r.academicYear) === norm(headerYear)) || null;
        }

        all.push({ ...b, unit: u, linkedDoc, headerYear, issueDate, finalSubmissionDate, ivForYear });
      }
    }

    const query = q.trim().toLowerCase();

    return all
      .filter((r) => {
        if (unitFilter !== "all" && r.unitId !== unitFilter) return false;
        if (statusFilter !== "all" && (r.status || "").toUpperCase() !== statusFilter) return false;
        if (!query) return true;
        const hay = `${r.assignmentCode} ${r.title} ${r.unit?.unitCode || ""} ${r.unit?.unitTitle || ""} ${r.headerYear || ""} ${r.linkedDoc?.originalFilename || ""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => {
        const ua = a.unit?.unitCode || "";
        const ub = b.unit?.unitCode || "";
        if (ua !== ub) return ua.localeCompare(ub);
        return (a.assignmentCode || "").localeCompare(b.assignmentCode || "");
      });
  }, [units, docs, q, unitFilter, statusFilter]);

  // Library view = locked briefs only (register)
  const libraryRows = useMemo(() => rows.filter((r) => !!r.lockedAt), [rows]);

  return {
    tab,
    setTab,

    busy,
    error,
    refresh,

    q,
    setQ,
    unitFilter,
    setUnitFilter,
    statusFilter,
    setStatusFilter,

    onlyLockedDocs,
    setOnlyLockedDocs,

    unitOptions,
    statusOptions,

    rows,
    libraryRows,
    docs,
  };
}
