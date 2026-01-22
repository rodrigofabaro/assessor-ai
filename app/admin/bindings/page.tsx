"use client";

import { useEffect, useMemo, useState } from "react";

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

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

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
    } catch (e: any) {
      setErr(e?.message || "Binding failed");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Phase 2.5 — Assignment Reference Binding</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Bind each operational assignment (A1/A2/etc.) to a <b>LOCKED</b> brief and its <b>LOCKED</b> unit/spec.
            No question/task extraction, no grading.
          </div>
        </div>
        <button onClick={load} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
          Refresh
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {assignments.map((a) => {
          const isLocked = a.bindingStatus === "LOCKED";
          const unit = a.assignmentBrief?.unit;
          const spec = unit?.specDocument;
          const briefDoc = a.assignmentBrief?.briefDocument;

          const matchingBriefs = lockedBriefs.filter((b) => (b.unit?.unitCode || "") === (a.unitCode || ""));

          return (
            <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {a.unitCode} — {a.assignmentRef || "Assignment"}: {a.title}
                  </div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}>
                    Status:{" "}
                    <span style={{ fontWeight: 700, color: isLocked ? "#065f46" : "#92400e" }}>
                      {a.bindingStatus}
                    </span>
                    {a.bindingLockedAt ? (
                      <>
                        {" "}
                        • Locked at {formatDate(a.bindingLockedAt)}{a.bindingLockedBy ? ` by ${a.bindingLockedBy}` : ""}
                      </>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.4 }}>
                    <div>
                      <b>Bound brief:</b>{" "}
                      {a.assignmentBrief ? (
                        <>
                          {a.assignmentBrief.assignmentCode} — {a.assignmentBrief.title}
                        </>
                      ) : (
                        <span style={{ opacity: 0.7 }}>None</span>
                      )}
                    </div>
                    <div>
                      <b>Unit:</b>{" "}
                      {unit ? (
                        <>
                          {unit.unitCode} — {unit.unitTitle} ({unit.status})
                        </>
                      ) : (
                        <span style={{ opacity: 0.7 }}>—</span>
                      )}
                    </div>
                    <div>
                      <b>Spec doc:</b>{" "}
                      {spec ? (
                        <>
                          {spec.title} (v{spec.version}) — {spec.status}
                        </>
                      ) : (
                        <span style={{ opacity: 0.7 }}>—</span>
                      )}
                    </div>
                    <div>
                      <b>Brief doc:</b>{" "}
                      {briefDoc ? (
                        <>
                          {briefDoc.title} (v{briefDoc.version}) — {briefDoc.status}
                        </>
                      ) : (
                        <span style={{ opacity: 0.7 }}>—</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ minWidth: 320 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Select LOCKED brief for this unit</div>
                  <select
                    disabled={isLocked}
                    defaultValue={a.assignmentBriefId || ""}
                    onChange={(e) => {
                      const val = e.target.value || "";
                      // We do not auto-save on change to avoid accidental locks.
                      // User must click "Lock binding".
                      setAssignments((prev) =>
                        prev.map((x) => (x.id === a.id ? ({ ...x, assignmentBriefId: val || null } as any) : x))
                      );
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: isLocked ? "#f9fafb" : "#fff",
                    }}
                  >
                    <option value="">— Select —</option>
                    {matchingBriefs.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.assignmentCode} — {b.title}
                      </option>
                    ))}
                  </select>

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      disabled={isLocked || savingId === a.id || !a.assignmentBriefId}
                      onClick={() => lockBinding(a.id, a.assignmentBriefId || null)}
                      style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1px solid #16a34a",
                        background: isLocked ? "#dcfce7" : "#16a34a",
                        color: isLocked ? "#065f46" : "#fff",
                        fontWeight: 800,
                        cursor: isLocked ? "not-allowed" : "pointer",
                        opacity: savingId === a.id ? 0.8 : 1,
                      }}
                    >
                      {savingId === a.id ? "Saving…" : isLocked ? "Locked" : "Lock binding"}
                    </button>

                    <button
                      disabled={isLocked || savingId === a.id}
                      onClick={() => lockBinding(a.id, null)}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        fontWeight: 700,
                        cursor: isLocked ? "not-allowed" : "pointer",
                      }}
                      title="Clear selection (keeps assignment editable)"
                    >
                      Clear
                    </button>
                  </div>

                  {!matchingBriefs.length && (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                      No LOCKED briefs found for unit <b>{a.unitCode}</b>. Lock a spec + brief in Phase 2.2 first.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>
        Note: Locking an assignment binding does <b>not</b> grade student work. It only fixes the reference set used later for grading & audit logs.
      </div>
    </div>
  );
}
