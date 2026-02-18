"use client";

import { useEffect, useMemo, useState } from "react";
import { jsonFetch } from "@/lib/http";
import { notifyToast } from "@/lib/ui/toast";

type RecordStatus = "DRAFT" | "LOCKED";

type ReferenceDocument = {
  id: string;
  type: "SPEC" | "BRIEF" | "RUBRIC";
  status: "UPLOADED" | "EXTRACTED" | "REVIEWED" | "LOCKED" | "FAILED";
  title: string;
  version: number;
  uploadedAt: string;
  lockedAt?: string | null;
};

type Unit = {
  id: string;
  unitCode: string;
  unitTitle: string;
  status: RecordStatus;
  specDocument?: ReferenceDocument | null;
};

type AssignmentBrief = {
  id: string;
  assignmentCode: string; // A1
  title: string;
  status: RecordStatus;
  unit: Unit;
  briefDocument?: ReferenceDocument | null;
};

type Assignment = {
  id: string;
  unitCode: string;
  title: string;
  assignmentRef?: string | null;
  assignmentBriefId?: string | null;
  bindingStatus: RecordStatus;
  bindingLockedAt?: string | null;
  bindingLockedBy?: string | null;

  assignmentBrief?: (AssignmentBrief & { unit: Unit }) | null;
};

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function AssignmentBindingsAdminPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [briefs, setBriefs] = useState<AssignmentBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const a = await jsonFetch<{ assignments: Assignment[] }>("/api/assignment-bindings");
      const b = await jsonFetch<{ briefs: AssignmentBrief[] }>("/api/assignment-briefs");
      setAssignments(a.assignments || []);
      setBriefs(b.briefs || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const lockedBriefs = useMemo(() => {
    return (briefs || [])
      .filter((b) => b.status === "LOCKED" && b.unit?.status === "LOCKED")
      .sort((x, y) => {
        const ux = x.unit?.unitCode || "";
        const uy = y.unit?.unitCode || "";
        if (ux !== uy) return ux.localeCompare(uy);
        return (x.assignmentCode || "").localeCompare(y.assignmentCode || "");
      });
  }, [briefs]);

  async function lockBinding(assignmentId: string, assignmentBriefId: string | null) {
    setSavingId(assignmentId);
    setErr(null);
    try {
      const res = await jsonFetch<{ assignment: Assignment }>("/api/assignment-bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          assignmentBriefId,
          lockedBy: "admin",
        }),
      });

      setAssignments((prev) => prev.map((a) => (a.id === assignmentId ? (res.assignment as any) : a)));
      notifyToast("success", "Assignment binding updated.");
    } catch (e: any) {
      setErr(e?.message || "Binding failed");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6">
        <div>
          <div className="h-6 w-72 animate-pulse rounded-lg bg-zinc-200" />
          <div className="mt-2 h-4 w-[34rem] animate-pulse rounded-lg bg-zinc-200" />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="h-4 w-56 animate-pulse rounded-lg bg-zinc-200" />
          <div className="mt-4 h-10 w-full animate-pulse rounded-xl bg-zinc-100" />
          <div className="mt-3 h-10 w-full animate-pulse rounded-xl bg-zinc-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
              Binding Governance
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">Phase 2.5 — Assignment Reference Binding</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-700">
              Bind each operational assignment (A1/A2/etc.) to a <span className="font-semibold">LOCKED</span> brief and its{" "}
              <span className="font-semibold">LOCKED</span> unit/spec. No question/task extraction, no grading.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="h-10 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Refresh
            </button>
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              {savingId ? "Saving..." : "Ready"}
            </span>
          </div>
        </div>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      <div className="grid gap-4">
        {assignments.map((a) => {
          const isLocked = a.bindingStatus === "LOCKED";
          const unit = a.assignmentBrief?.unit;
          const spec = unit?.specDocument;
          const briefDoc = a.assignmentBrief?.briefDocument;

          const matchingBriefs = lockedBriefs.filter((b) => (b.unit?.unitCode || "") === (a.unitCode || ""));

          return (
            <section key={a.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {a.unitCode} — {a.assignmentRef || "Assignment"}: {a.title}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Status:{" "}
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " +
                        (isLocked
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-200 bg-amber-50 text-amber-900")
                      }
                    >
                      {a.bindingStatus}
                    </span>
                    {a.bindingLockedAt ? (
                      <span>
                        {" "}• Locked at {formatDate(a.bindingLockedAt)}{a.bindingLockedBy ? ` by ${a.bindingLockedBy}` : ""}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-1 text-sm text-zinc-800">
                    <div>
                      <span className="font-semibold">Bound brief:</span>{" "}
                      {a.assignmentBrief ? (
                        <span>
                          {a.assignmentBrief.assignmentCode} — {a.assignmentBrief.title}
                        </span>
                      ) : (
                        <span className="text-zinc-500">None</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold">Unit:</span>{" "}
                      {unit ? (
                        <span>
                          {unit.unitCode} — {unit.unitTitle} ({unit.status})
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold">Spec doc:</span>{" "}
                      {spec ? (
                        <span>
                          {spec.title} (v{spec.version}) — {spec.status}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold">Brief doc:</span>{" "}
                      {briefDoc ? (
                        <span>
                          {briefDoc.title} (v{briefDoc.version}) — {briefDoc.status}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold">Select LOCKED brief for this unit</div>
                  <select
                    disabled={isLocked}
                    value={a.assignmentBriefId || ""}
                    onChange={(e) => {
                      const val = e.target.value || "";
                      // We do not auto-save on change to avoid accidental locks.
                      // User must click "Lock binding".
                      setAssignments((prev) =>
                        prev.map((x) => (x.id === a.id ? ({ ...x, assignmentBriefId: val || null } as any) : x))
                      );
                    }}
                    className={
                      "mt-2 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm shadow-sm " +
                      (isLocked ? "bg-zinc-50" : "bg-white")
                    }
                  >
                    <option value="">— Select —</option>
                    {matchingBriefs.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.assignmentCode} — {b.title}
                      </option>
                    ))}
                  </select>

                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={isLocked || savingId === a.id || !a.assignmentBriefId}
                      onClick={() => lockBinding(a.id, a.assignmentBriefId || null)}
                      className={
                        "h-10 flex-1 rounded-xl px-4 text-sm font-semibold shadow-sm " +
                        (isLocked || savingId === a.id || !a.assignmentBriefId
                          ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                          : "bg-emerald-600 text-white hover:bg-emerald-700")
                      }
                    >
                      {savingId === a.id ? "Saving…" : isLocked ? "Locked" : "Lock binding"}
                    </button>

                    <button
                      disabled={isLocked || savingId === a.id}
                      onClick={() => lockBinding(a.id, null)}
                      className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100"
                      title="Clear selection (keeps assignment editable)"
                    >
                      Clear
                    </button>
                  </div>

                  {!matchingBriefs.length && (
                    <div className="mt-3 text-xs text-zinc-600">
                      No LOCKED briefs found for unit <span className="font-semibold">{a.unitCode}</span>. Lock a spec + brief in Phase 2.2 first.
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="text-xs text-zinc-600">
        Note: Locking an assignment binding does <span className="font-semibold">not</span> grade student work. It only fixes the reference set used later for grading & audit logs.
      </div>
    </div>
  );
}
