"use client";

import { useState } from "react";
import { safeJson } from "@/lib/upload/utils";
import type { Student } from "@/lib/upload/types";
import { notifyToast } from "@/lib/ui/toast";

export function AddStudentModal({
  open,
  onClose,
  onCreated,
  refreshPicklists,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (student: Student) => void;
  refreshPicklists: () => Promise<void>;
}) {
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentRef, setNewStudentRef] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentCourse, setNewStudentCourse] = useState("");

  const [studentBusy, setStudentBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  async function addStudent() {
    setStudentBusy(true);
    setErr("");

    try {
      const fullName = newStudentName.trim();
      const externalRef = newStudentRef.trim() || null;
      const email = newStudentEmail.trim() || null;
      const courseName = newStudentCourse.trim() || null;

      if (!fullName) throw new Error("Student name is required.");

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, externalRef, email, courseName }),
      });

      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error((j as { error?: string })?.error || `Failed to create student (${res.status})`);
      }

      const createdJson = await safeJson(res);
      const created: Student = (createdJson as { student?: Student } & Partial<Student>)?.student ?? (createdJson as Student);

      await refreshPicklists();

      onCreated(created);
      setNewStudentName("");
      setNewStudentRef("");
      setNewStudentEmail("");
      setNewStudentCourse("");
      notifyToast("success", "Student created.");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setStudentBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => (studentBusy ? null : onClose())} />
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Add student</h2>
            <p className="mt-1 text-sm text-zinc-600">Create a student record for the dropdown.</p>
          </div>
          <button
            type="button"
            className="rounded-xl px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            onClick={() => (studentBusy ? null : onClose())}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {err ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div> : null}

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

          <label className="grid gap-1">
            <span className="text-sm font-medium">Course (optional)</span>
            <input
              value={newStudentCourse}
              onChange={(e) => setNewStudentCourse(e.target.value)}
              placeholder="e.g. HNC in Mechanical Engineering - HTQ"
              className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium">External ref (optional)</span>
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
            onClick={onClose}
            disabled={studentBusy}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={addStudent}
            disabled={studentBusy}
            className="h-10 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {studentBusy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
