"use client";

import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  name: string;
  studentRef?: string | null;
  email?: string | null;
  createdAt?: string;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function AdminStudentsPage() {
  const [items, setItems] = useState<Student[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [studentRef, setStudentRef] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    const res = await fetch("/api/students");
    if (!res.ok) throw new Error(`Failed to load students (${res.status})`);
    const data = (await res.json()) as Student[];
    setItems(data);
  }

  useEffect(() => {
    load().catch((e) => setErr(e?.message || String(e)));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((s) => {
      const hay = `${s.name} ${s.studentRef ?? ""} ${s.email ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  async function createStudent() {
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const n = name.trim();
      if (!n) throw new Error("Name is required.");

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          studentRef: studentRef.trim() || null,
          email: email.trim() || null,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Create failed (${res.status})`);
      }

      const created = (await res.json()) as Student;
      setName("");
      setStudentRef("");
      setEmail("");
      await load();
      setMsg(`Added: ${created.name}`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudent(id: string) {
    const target = items.find((x) => x.id === id);
    if (!target) return;
    if (!confirm(`Delete student "${target.name}"?\n\nThis does NOT delete past submissions, but will remove the student record.`)) {
      return;
    }

    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const res = await fetch(`/api/students/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Delete failed (${res.status})`);
      }
      await load();
      setMsg(`Deleted: ${target.name}`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Manage the student list used by the Upload dropdown. You only need to do this once per cohort.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Add new student</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name *"
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />
          <input
            value={studentRef}
            onChange={(e) => setStudentRef(e.target.value)}
            placeholder="Student ref (optional)"
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={createStudent}
            disabled={busy}
            className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => load().catch((e) => setErr(e?.message || String(e)))}
            disabled={busy}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
          >
            Refresh
          </button>
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
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Student list</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-10 w-full max-w-sm rounded-xl border border-zinc-300 px-3 text-sm"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Ref</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100">
                  <td className="py-3 pr-4 font-medium text-zinc-900">{s.name}</td>
                  <td className="py-3 pr-4 text-zinc-700">{s.studentRef ?? "-"}</td>
                  <td className="py-3 pr-4 text-zinc-700">{s.email ?? "-"}</td>
                  <td className="py-3 pr-2 text-right">
                    <button
                      type="button"
                      onClick={() => deleteStudent(s.id)}
                      disabled={busy}
                      className="rounded-xl px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-zinc-500">
                    No students.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
