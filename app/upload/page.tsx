"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Student = { id: string; name: string; studentRef?: string | null; email?: string | null };
type Assignment = { id: string; unitCode: string; title: string; assignmentRef?: string | null };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function UploadPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [studentId, setStudentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  // Quick-add Student modal
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentRef, setNewStudentRef] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);

  async function loadPicklists() {
    setErr("");
    const [sRes, aRes] = await Promise.all([fetch("/api/students"), fetch("/api/assignments")]);
    if (!sRes.ok) throw new Error(`Failed to load students (${sRes.status})`);
    if (!aRes.ok) throw new Error(`Failed to load assignments (${aRes.status})`);
    const s = (await sRes.json()) as Student[];
    const a = (await aRes.json()) as Assignment[];
    setStudents(s);
    setAssignments(a);
    if (s?.[0]?.id && !studentId) setStudentId(s[0].id);
    if (a?.[0]?.id && !assignmentId) setAssignmentId(a[0].id);
  }

  useEffect(() => {
    loadPicklists().catch((e) => setErr(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canUpload = useMemo(() => {
    return !!studentId && !!assignmentId && files.length > 0 && !busy;
  }, [studentId, assignmentId, files.length, busy]);

  async function onUpload() {
    setBusy(true);
    setMsg("");
    setErr("");

    try {
      const fd = new FormData();
      fd.append("studentId", studentId);
      fd.append("assignmentId", assignmentId);
      files.forEach((f) => fd.append("files", f));

      const res = await fetch("/api/submissions/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      const n = data?.submissions?.length ?? 0;
      setMsg(`Uploaded ${n} file${n === 1 ? "" : "s"}.`);
      setFiles([]);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addStudent() {
    setStudentBusy(true);
    setErr("");
    setMsg("");

    try {
      const name = newStudentName.trim();
      const studentRef = newStudentRef.trim() || null;
      const email = newStudentEmail.trim() || null;

      if (!name) throw new Error("Student name is required.");

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, studentRef, email }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed to create student (${res.status})`);
      }

      const created = (await res.json()) as Student;
      await loadPicklists();
      setStudentId(created.id);
      setShowAddStudent(false);
      setNewStudentName("");
      setNewStudentRef("");
      setNewStudentEmail("");
      setMsg(`Student added: ${created.name}`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setStudentBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload submissions</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Pick a student and an assignment, then drop in one or more files (PDF/DOCX). Each file becomes its own submission record.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="student">
                Student
              </label>
              <button
                type="button"
                onClick={() => setShowAddStudent(true)}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                + Add student
              </button>
            </div>
            <select
              id="student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
            >
              {students.length === 0 && <option value="">No students yet</option>}
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.studentRef ? ` (${s.studentRef})` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              Students are stored in the database. Add them once, then reuse forever.
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="assignment">
              Assignment
            </label>
            <select
              id="assignment"
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm shadow-sm"
            >
              {assignments.length === 0 && <option value="">No assignments yet</option>}
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.unitCode} {a.assignmentRef ? a.assignmentRef : ""} — {a.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              Tip: keep assignment titles short — they end up in logs and exports.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <label className="text-sm font-medium" htmlFor="files">
            Files
          </label>
          <input
            id="files"
            type="file"
            multiple
            accept=".pdf,.docx"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
          />

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {files.map((f) => (
                <span
                  key={f.name + f.size}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs"
                  title={`${f.name} (${Math.round(f.size / 1024)} KB)`}
                >
                  <span className="max-w-[240px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((xs) => xs.filter((x) => x !== f))}
                    className="rounded-full px-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                    aria-label={`Remove ${f.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={onUpload}
            disabled={!canUpload}
            className={classNames(
              "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm",
              canUpload ? "bg-zinc-900 text-white hover:bg-zinc-800" : "cursor-not-allowed bg-zinc-300 text-zinc-600"
            )}
          >
            {busy ? "Uploading…" : "Upload"}
          </button>

          <Link
            href="/submissions"
            className="text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            View submissions
          </Link>

          <Link
            href="/admin/students"
            className="text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800"
          >
            Manage students
          </Link>
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

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (studentBusy ? null : setShowAddStudent(false))}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add student</h2>
                <p className="mt-1 text-sm text-zinc-600">Create a student record for the dropdown.</p>
              </div>
              <button
                type="button"
                className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => (studentBusy ? null : setShowAddStudent(false))}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Name</span>
                <input
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="e.g. Joseph Barber"
                  className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Student ref (optional)</span>
                  <input
                    value={newStudentRef}
                    onChange={(e) => setNewStudentRef(e.target.value)}
                    placeholder="e.g. TA49186"
                    className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Email (optional)</span>
                  <input
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddStudent(false)}
                disabled={studentBusy}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addStudent}
                disabled={studentBusy}
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {studentBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
