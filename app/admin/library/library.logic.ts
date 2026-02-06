"use client";

import { useEffect, useMemo, useState } from "react";
import { jsonFetch } from "@/lib/http";
import { notifyToast } from "@/lib/ui/toast";

type SpecDocApi = {
  id: string;
  originalFilename?: string | null;
  storedFilename?: string | null;
  storagePath?: string | null;
} | null;

type BriefDocApi = {
  id: string;
  originalFilename?: string | null;
} | null;

type AssignmentBriefApi = {
  id: string;
  assignmentCode?: string | null; // "A1"
  title?: string | null; // NOTE: your schema uses `title`, some older UI used briefTitle
  briefTitle?: string | null; // tolerate legacy field name
  briefDocumentId?: string | null;
  briefDocument?: BriefDocApi;
} | null;

type LearningOutcomeApi = {
  id: string;
  loCode: string;
  description?: string;
  criteria: any[];
};

export type UnitApi = {
  id: string;
  unitCode: string;
  unitTitle: string;
  status: "DRAFT" | "LOCKED";

  specIssue?: string | null;
  specVersionLabel?: string | null;

  lockedAt?: string | null;

  specDocumentId?: string | null;
  specDocument?: SpecDocApi;

  learningOutcomes?: LearningOutcomeApi[] | null;

  // included by GET /api/units (assignmentBriefs include)
  assignmentBriefs?: AssignmentBriefApi[] | null;

  sourceMeta?: any | null;
};

type UnitsResponse = { units: UnitApi[] };



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

function pickIssueLabel(u: Pick<UnitApi, "specVersionLabel" | "specIssue"> | null | undefined): string {
  const a = u?.specVersionLabel ? String(u.specVersionLabel).trim() : "";
  const b = u?.specIssue ? String(u.specIssue).trim() : "";
  return a || b || "";
}

function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function normalizeBriefTitle(b: AssignmentBriefApi): string {
  const t1 = b?.title ? String(b.title).trim() : "";
  const t2 = b?.briefTitle ? String(b.briefTitle).trim() : "";
  return t1 || t2 || "";
}

export function useLibraryAdmin() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warn"; text: string } | null>(null);

  const [units, setUnits] = useState<UnitApi[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // edit fields
  const [editUnitCode, setEditUnitCode] = useState("");
  const [editUnitTitle, setEditUnitTitle] = useState("");
  const [editSpecLabel, setEditSpecLabel] = useState("");

  // ---- Derived view-models (single source of truth for UI)
  const viewModels = useMemo(() => {
    const locked = asArray(units).filter((u) => u.status === "LOCKED");

    return locked.map((u) => {
      const los = asArray(u.learningOutcomes);
      const loCount = los.length;
      const criteriaCount = los.reduce(
        (n, lo) => n + (Array.isArray(lo.criteria) ? lo.criteria.length : 0),
        0
      );

      const archived = !!u.sourceMeta?.archived;

      const briefsArr = asArray(u.assignmentBriefs).filter(Boolean) as any[];
      const boundBriefsCount = briefsArr.length;

      // Delete rules:
      // - if any briefs -> cannot delete (must archive)
      // - if no briefs -> can delete, but backend must handle LO/criteria cascade
      const canDelete = boundBriefsCount === 0;
      const deleteReason = canDelete
        ? null
        : `Refuse delete: ${boundBriefsCount} brief(s) are bound to this unit. Archive instead.`;

      return {
        ...u,
        archived,
        learningOutcomeCount: loCount,
        criteriaCount,
        boundBriefsCount,
        issueLabel: pickIssueLabel(u),
        canDelete,
        deleteReason,
      };
    });
  }, [units]);

  const selected = useMemo(
    () => viewModels.find((u: any) => u.id === selectedUnitId) || null,
    [viewModels, selectedUnitId]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return viewModels
      .filter((u: any) => (showArchived ? true : !u.archived))
      .filter((u: any) => {
        if (!needle) return true;
        return (
          String(u.unitCode || "").toLowerCase().includes(needle) ||
          String(u.unitTitle || "").toLowerCase().includes(needle) ||
          String(u.issueLabel || "").toLowerCase().includes(needle)
        );
      })
      .sort(
        (a: any, b: any) =>
          String(a.unitCode).localeCompare(String(b.unitCode)) ||
          String(a.unitTitle).localeCompare(String(b.unitTitle))
      );
  }, [viewModels, q, showArchived]);

  // briefs list for inspector
  const boundBriefs = useMemo(() => {
    if (!selected) return [];
    const arr = asArray((selected as any).assignmentBriefs).filter(Boolean) as any[];
    return arr
      .map((b) => ({
        id: b.id,
        assignmentCode: b.assignmentCode || null,
        title: normalizeBriefTitle(b),
        briefDocumentId: b.briefDocumentId || null,
        briefDocument: b.briefDocument || null,
      }))
      .sort((a, b) => String(a.assignmentCode || "").localeCompare(String(b.assignmentCode || "")));
  }, [selected]);

  // ---- Data loading
  async function refreshAll() {
    setError(null);
    setBusy("Loading...");
    try {
      const u = await jsonFetch<UnitsResponse>("/api/units");
      const list = Array.isArray(u?.units) ? u.units : [];
      setUnits(list);

      // keep selection stable after refresh
      if (selectedUnitId) {
        const stillExists = list.some((x) => x.id === selectedUnitId);
        if (!stillExists) setSelectedUnitId("");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load library");
      setUnits([]);
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
      setEditUnitCode("");
      setEditUnitTitle("");
      setEditSpecLabel("");
      setNotice(null);
      return;
    }
    setEditUnitCode(String(selected.unitCode || ""));
    setEditUnitTitle(String(selected.unitTitle || ""));
    setEditSpecLabel(pickIssueLabel(selected));
    setNotice(null);
  }, [selected]);

  const dirtyLabels = useMemo(() => {
    if (!selected) return false;

    const aCode = String(selected.unitCode || "").trim();
    const aTitle = String(selected.unitTitle || "").trim();
    const aIssue = pickIssueLabel(selected);

    const bCode = String(editUnitCode || "").trim();
    const bTitle = String(editUnitTitle || "").trim();
    const bIssue = String(editSpecLabel || "").trim();

    return aCode !== bCode || aTitle !== bTitle || aIssue !== bIssue;
  }, [selected, editUnitCode, editUnitTitle, editSpecLabel]);

  // ---- Mutations
  async function saveEdits() {
    setError(null);
    setNotice(null);
    if (!selected) return;
    if (!dirtyLabels) {
      setNotice({ tone: "warn", text: "No label changes to save." });
      return;
    }

    setBusy("Saving...");
    try {
      await jsonFetch(`/api/units/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitCode: String(editUnitCode || "").trim(),
          unitTitle: String(editUnitTitle || "").trim(),
          specVersionLabel: String(editSpecLabel || "").trim(),
          specIssue: String(editSpecLabel || "").trim(),
        }),
      });

      await refreshAll();
      setNotice({ tone: "success", text: "Saved labels." });
      notifyToast("success", "Unit labels saved.");
    } catch (e: any) {
      const message = e?.message || "Save failed";
      setError(message);
      setNotice({ tone: "error", text: `Failed to save: ${message}` });
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    setError(null);
    if (!selected) return;

    const nextArchived = !selected.sourceMeta?.archived;
    setBusy(nextArchived ? "Archiving..." : "Unarchiving...");
    try {
      await jsonFetch(`/api/units/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceMeta: { ...(selected.sourceMeta || {}), archived: nextArchived },
        }),
      });

      await refreshAll();
      setNotice({ tone: "success", text: nextArchived ? "Unit archived." : "Unit unarchived." });
      notifyToast("success", nextArchived ? "Unit archived." : "Unit unarchived.");
    } catch (e: any) {
      setError(e?.message || "Archive failed");
    } finally {
      setBusy(null);
    }
  }

async function safeDelete() {
  setError(null);
  if (!selected) return;

  // Use the same truth source as UI count
  const briefsArr = Array.isArray((selected as any).assignmentBriefs) ? (selected as any).assignmentBriefs : [];

  if (briefsArr.length) {
    const list = briefsArr
      .slice(0, 3)
      .map((b: any) => b.assignmentCode || b.title || b.id)
      .filter(Boolean)
      .join(", ");

    setError(
      `Cannot delete ${selected.unitCode} — it has ${briefsArr.length} bound brief(s). ` +
        (list ? `Examples: ${list}` : "") +
        `\nArchive it instead (or unbind briefs first).`
    );
    return;
  }

  // Optional: confirm to prevent accidental nukes
  const ok = window.confirm(
    `Delete ${selected.unitCode} — ${selected.unitTitle}?\n\nThis will remove its Learning Outcomes and Criteria too.`
  );
  if (!ok) return;

  setBusy("Deleting...");
  try {
    await jsonFetch(`/api/units/${selected.id}`, { method: "DELETE" });
    setSelectedUnitId("");
    await refreshAll();
    setNotice({ tone: "success", text: "Unit deleted." });
    notifyToast("success", "Unit deleted.");
  } catch (e: any) {
    setError(e?.message || "Delete failed");
  } finally {
    setBusy(null);
  }
}


  return {
    busy,
    error,
    notice,

    q,
    setQ,
    showArchived,
    setShowArchived,

    filtered,

    selected,
    selectedUnitId,
    setSelectedUnitId,

    editUnitCode,
    setEditUnitCode,
    editUnitTitle,
    setEditUnitTitle,
    editSpecLabel,
    setEditSpecLabel,

    dirtyLabels,

    boundBriefs,

    refreshAll,

    // names your UI uses
    saveEdits,
    saveLabels: saveEdits,
    toggleArchive,
    archive: toggleArchive,
    safeDelete,
  };
}
