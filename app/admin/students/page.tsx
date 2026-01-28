"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Student = {
  id: string;
  fullName: string | null;
  email: string | null;
  externalRef: string | null;
  courseName: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function safeShort(s?: string | null, max = 42) {
  if (!s) return "—";
  const t = String(s);
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export default function AdminStudentsPage() {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Create
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRef, setNewRef] = useState("");
  const [newCourse, setNewCourse] = useState("");

  // Edit
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editCourse, setEditCourse] = useState("");

  // Import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // UX niceties
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  async function refresh(nextQuery?: string) {
    setErr("");
    const q = (nextQuery ?? query).trim();
    const url = q ? `/api/students?query=${encodeURIComponent(q)}` : `/api/students`;
    const list = await jsonFetch<any>(url, { cache: "no-store" });

    // tolerate "array" or "{students:[...]}" shapes
    const arr: Student[] = Array.isArray(list) ? list : Array.isArray(list?.students) ? list.students : [];
    setStudents(arr);
    setSelectedIds({});
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return Array.isArray(students) ? students : [];
  }, [students]);

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

  async function createStudent() {
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const payload = {
        fullName: newName,
        email: newEmail || null,
        externalRef: newRef || null,
        courseName: newCourse || null,
      };

      const created = await jsonFetch<Student>("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setMsg(`Student created: ${created.fullName ?? "—"}`);
      setNewName("");
      setNewEmail("");
      setNewRef("");
      setNewCourse("");
      await refresh("");
      setQuery("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(s: Student) {
    setEditId(s.id);
    setEditName(s.fullName || "");
    setEditEmail(s.email || "");
    setEditRef(s.externalRef || "");
    setEditCourse(s.courseName || "");
    setEditOpen(true);
    setErr("");
    setMsg("");
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      await jsonFetch<Student>(`/api/students/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editName,
          email: editEmail || null,
          externalRef: editRef || null,
          courseName: editCourse || null,
        }),
      });

      setMsg("Student updated.");
      setEditOpen(false);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function askDelete(s: Student) {
    setDeleteTarget(s);
    setConfirmDeleteOpen(true);
    setErr("");
    setMsg("");
  }

  async function deleteStudentConfirmed() {
    if (!deleteTarget) return;
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      await jsonFetch(`/api/students/${deleteTarget.id}`, { method: "DELETE" });
      setMsg("Student deleted.");
      setConfirmDeleteOpen(false);
      setDeleteTarget(null);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!importFile) return;
    setImportBusy(true);
    setErr("");
    setMsg("");

    try {
      const fd = new FormData();
      fd.append("file", importFile);

      const res = await fetch("/api/students/import", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Import failed (${res.status})`);

      const { created = 0, updated = 0, skipped = 0, conflicts = 0 } = data?.summary || {};
      setMsg(
        `Import complete: created ${created}, updated ${updated}, skipped ${skipped}${
          conflicts ? `, conflicts ${conflicts}` : ""
        }.`
      );
      setImportFile(null);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setImportBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleSelectAll() {
    if (filtered.length === 0) return;
    const allSelected = filtered.every((s) => selectedIds[s.id]);
    if (allSelected) {
      setSelectedIds({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const s of filtered) next[s.id] = true;
    setSelectedIds(next);
  }

  async function copySelectedIds() {
    const ids = filtered.filter((s) => selectedIds[s.id]).map((s) => s.id);
    if (ids.length === 0) return;

    try {
      await navigator.clipboard.writeText(ids.join("\n"));
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  }

  function resetCreateForm() {
    setNewName("");
    setNewEmail("");
    setNewRef("");
    setNewCourse("");
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Manage students used for linking and reporting. Import will upsert by{" "}
            <span className="font-medium">email</span>/<span className="font-medium">AB number</span> (externalRef).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/submissions/new"
            className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
          >
            Upload submission
          </Link>
          <Link
            href="/submissions"
            className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
          >
            Submissions
          </Link>
        </div>
      </div>

      {/* Create + Search */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Search */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold">Search</div>
              <button
                onClick={() => {
                  setQuery("");
                  refresh("").catch((e) => setErr(e?.message || String(e)));
                }}
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                type="button"
              >
                Clear
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, email, AB number, course..."
                className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
              />
              <button
                onClick={() => refresh().catch((e) => setErr(e?.message || String(e)))}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
                type="button"
              >
                Refresh
              </button>
            </div>

            {selectedCount > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <div className="text-xs text-zinc-700">
                  Selected: <span className="font-semibold">{selectedCount}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={copySelectedIds}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                    type="button"
                  >
                    {copied ? "Copied!" : "Copy IDs"}
                  </button>
                  <button
                    onClick={() => setSelectedIds({})}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                    type="button"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Create */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Create (one-off)</div>
              <button
                onClick={resetCreateForm}
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                type="button"
              >
                Reset
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-sm font-medium">Full name</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Joseph Barber"
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Email (optional)</span>
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">AB Number (optional)</span>
                <input
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                  placeholder="e.g. TA49186"
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>

              <label className="grid gap-1 sm:col-span-2">
                <span className="text-sm font-medium">Course (optional)</span>
                <input
                  value={newCourse}
                  onChange={(e) => setNewCourse(e.target.value)}
                  placeholder="e.g. HNC in Mechanical Engineering - HTQ"
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={createStudent}
                disabled={busy || !newName.trim()}
                className={classNames(
                  "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm",
                  busy || !newName.trim()
                    ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                    : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
                type="button"
              >
                {busy ? "Saving…" : "Create"}
              </button>

              <div className="text-xs text-zinc-500">Tip: Import is better for bulk.</div>
            </div>
          </div>
        </div>

        {/* Import */}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold">Import students (XLSX)</div>
            <div className="text-xs text-zinc-600">
              Expected: <span className="font-medium">Full Name</span>,{" "}
              <span className="font-medium">Email</span>,{" "}
              <span className="font-medium">AB Number</span>,{" "}
              <span className="font-medium">Course</span>,{" "}
              <span className="font-medium">Registration Date</span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
            />
            <button
              onClick={doImport}
              disabled={importBusy || !importFile}
              className={classNames(
                "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm",
                importBusy || !importFile
                  ? "cursor-not-allowed bg-zinc-300 text-zinc-600"
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
              type="button"
            >
              {importBusy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>

        {(err || msg) && (
          <div
            className={classNames(
              "mt-4 rounded-xl border p-3 text-sm",
              err ? "border-red-200 bg-red-50 text-red-900" : "border-indigo-200 bg-indigo-50 text-indigo-900"
            )}
          >
            {err || msg}
          </div>
        )}

        {/* Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold text-zinc-700">
                <th className="border-b border-zinc-200 bg-white px-4 py-3 w-[48px]">
                  <button
                    onClick={toggleSelectAll}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-zinc-50"
                    type="button"
                    title="Select all / none"
                  >
                    All
                  </button>
                </th>
                <th className="border-b border-zinc-200 bg-white px-4 py-3">Name</th>
                <th className="border-b border-zinc-200 bg-white px-4 py-3">Email</th>
                <th className="border-b border-zinc-200 bg-white px-4 py-3">Course</th>
                <th className="border-b border-zinc-200 bg-white px-4 py-3">AB</th>
                <th className="border-b border-zinc-200 bg-white px-4 py-3">Created</th>
                <th className="border-b border-zinc-200 bg-white px-4 py-3 w-[320px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-600" colSpan={7}>
                    No students yet.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="text-sm">
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!!selectedIds[s.id]}
                        onChange={() => toggleSelect(s.id)}
                        className="h-4 w-4"
                        aria-label={`Select ${s.fullName ?? "student"}`}
                      />
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 font-medium text-zinc-900">
                      <div className="flex flex-col">
                        <span>{s.fullName || "—"}</span>
                        <span className="text-xs text-zinc-500">{safeShort(s.id, 28)}</span>
                      </div>
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{s.email || "—"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700" title={s.courseName || ""}>
                      {safeShort(s.courseName, 42)}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{s.externalRef || "—"}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{safeDate(s.createdAt)}</td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/students/${s.id}`}
                          className="rounded-xl border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                        >
                          Profile
                        </Link>

                        <Link
                          href={`/submissions/new?studentId=${encodeURIComponent(s.id)}`}
                          className="rounded-xl border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                        >
                          Upload
                        </Link>

                        <button
                          onClick={() => openEdit(s)}
                          className="rounded-xl border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                          type="button"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => askDelete(s)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : setEditOpen(false))} />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Edit student</h2>
                <p className="mt-1 text-sm text-zinc-600">Update student details. Unique constraints apply.</p>
              </div>
              <button
                type="button"
                className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => (busy ? null : setEditOpen(false))}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Full name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Course (optional)</span>
                <input
                  value={editCourse}
                  onChange={(e) => setEditCourse(e.target.value)}
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Email (optional)</span>
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">AB Number / externalRef (optional)</span>
                  <input
                    value={editRef}
                    onChange={(e) => setEditRef(e.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                disabled={busy}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy || !editName.trim()}
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (busy ? null : (setConfirmDeleteOpen(false), setDeleteTarget(null)))}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Delete student?</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  This is blocked if submissions exist. You are deleting:{" "}
                  <span className="font-medium">{deleteTarget.fullName ?? "—"}</span>
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => (busy ? null : (setConfirmDeleteOpen(false), setDeleteTarget(null)))}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setDeleteTarget(null);
                }}
                disabled={busy}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteStudentConfirmed}
                disabled={busy}
                className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
