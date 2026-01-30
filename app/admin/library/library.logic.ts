"use client";

import { useEffect, useMemo, useState } from "react";

type UnitApi = {
  id: string;
  unitCode: string;
  unitTitle: string;
  status: "DRAFT" | "LOCKED";
  specIssue?: string | null;
  specVersionLabel?: string | null;
  lockedAt?: string | null;
  specDocumentId?: string | null;
  learningOutcomes?: Array<{ id: string; loCode: string; criteria: any[] }> | null;
  sourceMeta?: any | null;
};

type BindingApi = {
  id: string;
  unitId: string;
  assignmentCode?: string | null;
  briefTitle?: string | null;
  briefDocumentId?: string | null;
  createdAt?: string | null;
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

export function badge(status: "ACTIVE" | "ARCHIVED"): { cls: string; text: string } {
  return status === "ARCHIVED"
    ? { cls: "bg-amber-50 text-amber-900 border-amber-200", text: "ARCHIVED" }
    : { cls: "bg-emerald-50 text-emerald-900 border-emerald-200", text: "ACTIVE" };
}

/**
 * ✅ Normalize any of these shapes into an array:
 * - [ ... ]
 * - { bindings: [ ... ] }
 * - { data: { bindings: [ ... ] } }
 * - anything else -> []
 */
function normalizeBindings(payload: any): BindingApi[] {
  if (Array.isArray(payload)) return payload as BindingApi[];
  if (Array.isArray(payload?.bindings)) return payload.bindings as BindingApi[];
  if (Array.isArray(payload?.data?.bindings)) return payload.data.bindings as BindingApi[];
  return [];
}

export function useLibraryAdmin() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [units, setUnits] = useState<UnitApi[]>([]);
  const [bindings, setBindings] = useState<BindingApi[]>([]);

  const [selectedUnitId, setSelectedUnitId] = useState("");

  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // edit fields
  const [editUnitTitle, setEditUnitTitle] = useState("");
  const [editSpecLabel, setEditSpecLabel] = useState("");

  const viewModels = useMemo(() => {
    const locked = (Array.isArray(units) ? units : []).filter((u) => u.status === "LOCKED");
    const bindingsArr = Array.isArray(bindings) ? bindings : [];

    return locked.map((u) => {
      const loCount = u.learningOutcomes?.length || 0;
      const criteriaCount =
        (u.learningOutcomes || []).reduce((n, lo) => n + ((lo.criteria as any[])?.length || 0), 0) || 0;

      const archived = !!u.sourceMeta?.archived;

      const bound = bindingsArr.filter((b) => b.unitId === u.id);

      return {
        ...u,
        archived,
        learningOutcomeCount: loCount,
        criteriaCount,
        boundBriefsCount: bound.length,
      };
    });
  }, [units, bindings]);

  // IMPORTANT: select from the computed view-models so UI can rely on derived fields
  // like `archived`, `boundBriefsCount`, and counts.
  const selected = useMemo(
    () => viewModels.find((u: any) => u.id === selectedUnitId) || null,
    [viewModels, selectedUnitId]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return viewModels
      .filter((u) => (showArchived ? true : !u.archived))
      .filter((u) => {
        if (!needle) return true;
        return (
          u.unitCode.toLowerCase().includes(needle) ||
          (u.unitTitle || "").toLowerCase().includes(needle) ||
          (u.specVersionLabel || u.specIssue || "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.unitCode.localeCompare(b.unitCode) || a.unitTitle.localeCompare(b.unitTitle));
  }, [viewModels, q, showArchived]);

  const boundBriefs = useMemo(() => {
    if (!selected) return [];
    const bindingsArr = Array.isArray(bindings) ? bindings : [];

    return bindingsArr
      .filter((b) => b.unitId === selected.id)
      .sort((a, b) => String(a.assignmentCode || "").localeCompare(String(b.assignmentCode || "")));
  }, [bindings, selected]);

  async function refreshAll() {
    setError(null);
    setBusy("Loading...");
    try {
      const [u, b] = await Promise.all([
        jsonFetch<{ units: UnitApi[] }>("/api/units"),
        jsonFetch<any>("/api/assignment-bindings"),
      ]);

      setUnits(Array.isArray(u?.units) ? u.units : []);
      setBindings(normalizeBindings(b));
    } catch (e: any) {
      setError(e?.message || "Failed to load library");
      setUnits([]);
      setBindings([]);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync edit fields on selection
  useEffect(() => {
    if (!selected) {
      setEditUnitTitle("");
      setEditSpecLabel("");
      return;
    }
    setEditUnitTitle(selected.unitTitle || "");
    setEditSpecLabel((selected.specVersionLabel || selected.specIssue || "") as string);
  }, [selected]);

  async function saveEdits() {
    setError(null);
    if (!selected) return;

    setBusy("Saving...");
    try {
      await jsonFetch(`/api/units/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitTitle: editUnitTitle,
          specVersionLabel: editSpecLabel,
          specIssue: editSpecLabel,
        }),
      });
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    setError(null);
    if (!selected) return;

    setBusy(selected.sourceMeta?.archived ? "Unarchiving..." : "Archiving...");
    try {
      await jsonFetch(`/api/units/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceMeta: { ...(selected.sourceMeta || {}), archived: !selected.sourceMeta?.archived },
        }),
      });
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Archive failed");
    } finally {
      setBusy(null);
    }
  }

  async function safeDelete() {
    setError(null);
    if (!selected) return;

    const bindingsArr = Array.isArray(bindings) ? bindings : [];
    const bound = bindingsArr.filter((b) => b.unitId === selected.id);

    if (bound.length) {
      setError(`Cannot delete: ${bound.length} brief(s)/assignment(s) are bound to this unit.`);
      return;
    }

    setBusy("Deleting...");
    try {
      await jsonFetch(`/api/units/${selected.id}`, { method: "DELETE" });
      setSelectedUnitId("");
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    error,

    q,
    setQ,
    showArchived,
    setShowArchived,

    filtered,

    selected,
    selectedUnitId,
    setSelectedUnitId,

    editUnitTitle,
    setEditUnitTitle,
    editSpecLabel,
    setEditSpecLabel,

    boundBriefs,

    refreshAll,
    saveEdits,
    toggleArchive,
    safeDelete,
  };
}
