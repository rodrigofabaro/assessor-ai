"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";

type Student = {
  id: string;
  fullName: string | null;
  email: string | null;
  externalRef: string | null;
  courseName: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function short(s?: string | null, max = 44) {
  if (!s) return "—";
  const t = String(s);
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)) + "…";
}

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

function Icon({ name }: { name: "user" | "upload" | "edit" | "trash" }) {
  const common = "h-4 w-4";
  switch (name) {
    case "user":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 13a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "upload":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "edit":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-.2-.2a2 2 0 0 0-2.8 0L5.9 16.1 4 20Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
  }
}

export default function AdminStudentsPage() {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRef, setNewRef] = useState("");
  const [newCourse, setNewCourse] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editCourse, setEditCourse] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const showResults = query.trim().length > 0;

  async function refresh() {
    setErr("");
    setMsg("");
    const q = query.trim();
    if (!q) {
      setStudents([]);
      return;
    }

    const url = `/api/students?query=${encodeURIComponent(q)}`;
    const list = await jsonFetch<any>(url, { cache: "no-store" });
    const arr: Student[] = Array.isArray(list) ? list : Array.isArray(list?.students) ? list.students : [];
    setStudents(arr);
  }

  const filtered = useMemo(() => (Array.isArray(students) ? students : []), [students]);

  async function createStudent() {
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const created = await jsonFetch<Student>("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: newName, email: newEmail || null, externalRef: newRef || null, courseName: newCourse || null }),
      });

      setMsg(`Student created: ${created.fullName ?? "—"}`);
      setNewName("");
      setNewEmail("");
      setNewRef("");
      setNewCourse("");
      await refresh();
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
        body: JSON.stringify({ fullName: editName, email: editEmail || null, externalRef: editRef || null, courseName: editCourse || null }),
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

  async function deleteStudent(id: string) {
    const ok = confirm("Delete this student? This is blocked if they have linked submissions.");
    if (!ok) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await jsonFetch(`/api/students/${id}`, { method: "DELETE" });
      setMsg("Student deleted.");
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
      setMsg(`Import complete: created ${created}, updated ${updated}, skipped ${skipped}${conflicts ? `, conflicts ${conflicts}` : ""}.`);
      setImportFile(null);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <PageContainer fullWidth>
      <div className="grid gap-6 min-w-0">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Students</h1>
              <p className="mt-1 text-sm text-zinc-700">Search, create, and maintain student records used across submission and grading workflows.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500" href="/submissions/new">
                Upload submission
              </Link>
              <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50" href="/submissions">
                Submissions
              </Link>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, AB number, course…" className="h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm" />
            <button onClick={() => refresh().catch((e) => setErr(e?.message || String(e)))} className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStudents([]);
                setErr("");
                setMsg("");
              }}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
            >
              Clear
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold">Create student</div>
              <div className="mt-3 grid gap-3">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email (optional)" className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                  <input value={newRef} onChange={(e) => setNewRef(e.target.value)} placeholder="AB number (optional)" className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                </div>
                <input value={newCourse} onChange={(e) => setNewCourse(e.target.value)} placeholder="Course (optional)" className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                <button
                  onClick={createStudent}
                  disabled={busy || !newName.trim()}
                  className={cn("h-10 rounded-xl px-4 text-sm font-semibold shadow-sm", busy || !newName.trim() ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")}
                >
                  {busy ? "Saving…" : "Create"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold">Import students (XLSX)</div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800" />
                <button
                  onClick={doImport}
                  disabled={importBusy || !importFile}
                  className={cn("h-10 rounded-xl px-4 text-sm font-semibold shadow-sm", importBusy || !importFile ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")}
                >
                  {importBusy ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {(err || msg) && <div className={cn("mb-4 rounded-xl border p-3 text-sm", err ? "border-red-200 bg-red-50 text-red-900" : "border-indigo-200 bg-indigo-50 text-indigo-900")}>{err || msg}</div>}

          {!showResults ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-sm font-semibold">Nothing to show yet</div>
              <p className="mt-1 text-sm text-zinc-600">Type a search term and hit Search. This view stays quiet by default.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs font-semibold text-zinc-700">
                    <th className="border-b border-zinc-200 bg-white px-4 py-3">Name</th>
                    <th className="border-b border-zinc-200 bg-white px-4 py-3">Email</th>
                    <th className="border-b border-zinc-200 bg-white px-4 py-3">Course</th>
                    <th className="border-b border-zinc-200 bg-white px-4 py-3">AB</th>
                    <th className="border-b border-zinc-200 bg-white px-4 py-3">Created</th>
                    <th className="border-b border-zinc-200 bg-white px-4 py-3 w-[170px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td className="px-4 py-8 text-center text-sm text-zinc-600" colSpan={6}>No matches.</td></tr>
                  ) : (
                    filtered.map((s) => (
                      <tr key={s.id} className="text-sm">
                        <td className="border-b border-zinc-100 px-4 py-3 font-medium text-zinc-900"><Link href={`/students/${s.id}`} className="hover:underline">{s.fullName || "—"}</Link><div className="mt-0.5 text-xs text-zinc-500">{short(s.email, 60) !== "—" ? short(s.email, 60) : ""}</div></td>
                        <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{s.email || "—"}</td>
                        <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{s.courseName || "—"}</td>
                        <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{s.externalRef || "—"}</td>
                        <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{safeDate(s.createdAt)}</td>
                        <td className="border-b border-zinc-100 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link href={`/students/${s.id}`} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50" title="Open profile"><Icon name="user" /></Link>
                            <Link href={`/submissions/new?studentId=${encodeURIComponent(s.id)}`} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100" title="Upload for this student"><Icon name="upload" /></Link>
                            <button onClick={() => openEdit(s)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50" title="Edit"><Icon name="edit" /></button>
                            <button onClick={() => deleteStudent(s.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100" title="Delete"><Icon name="trash" /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : setEditOpen(false))} />
            <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Edit student</h2>
                  <p className="mt-1 text-sm text-zinc-600">Update details (unique constraints apply).</p>
                </div>
                <button type="button" className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" onClick={() => (busy ? null : setEditOpen(false))} aria-label="Close">✕</button>
              </div>
              <div className="mt-4 grid gap-3">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                <input value={editCourse} onChange={(e) => setEditCourse(e.target.value)} className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                  <input value={editRef} onChange={(e) => setEditRef(e.target.value)} className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditOpen(false)} disabled={busy} className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60">Cancel</button>
                <button type="button" onClick={saveEdit} disabled={busy || !editName.trim()} className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
