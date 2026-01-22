"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Student = { id: string; name: string; studentRef?: string | null };
type Assignment = { id: string; unitCode: string; title: string; assignmentRef?: string | null };

export default function UploadPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [studentId, setStudentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [sRes, aRes] = await Promise.all([
        fetch("/api/students"),
        fetch("/api/assignments"),
      ]);
      const s = await sRes.json();
      const a = await aRes.json();
      setStudents(s);
      setAssignments(a);
      if (s?.[0]?.id) setStudentId(s[0].id);
      if (a?.[0]?.id) setAssignmentId(a[0].id);
    })().catch((e) => setMsg(String(e)));
  }, []);

  const canUpload = useMemo(() => {
    return !!studentId && !!assignmentId && files.length > 0 && !busy;
  }, [studentId, assignmentId, files.length, busy]);

  async function onUpload() {
    setBusy(true);
    setMsg("");

    try {
      const fd = new FormData();
      fd.append("studentId", studentId);
      fd.append("assignmentId", assignmentId);
      files.forEach((f) => fd.append("files", f));

      const res = await fetch("/api/submissions/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setMsg(`Uploaded ${data?.submissions?.length ?? 0} file(s).`);
      setFiles([]);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Upload Submissions</h1>
      <p style={{ marginTop: 8, color: "#374151" }}>
        Select a student and assignment, then upload one or many files (PDF/DOCX).
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Student</span>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.studentRef ? ` (${s.studentRef})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Assignment</span>
          <select
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.unitCode} {a.assignmentRef ? a.assignmentRef : ""} — {a.title}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Files</span>
          <input
            type="file"
            multiple
            accept=".pdf,.docx"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
          {files.length > 0 && (
            <div style={{ fontSize: 14, color: "#374151" }}>
              Selected: {files.map((f) => f.name).join(", ")}
            </div>
          )}
        </label>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={onUpload}
            disabled={!canUpload}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: canUpload ? "#111827" : "#9ca3af",
              color: "white",
              cursor: canUpload ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Uploading..." : "Upload"}
          </button>

          <Link href="/submissions" style={{ color: "#111827", textDecoration: "underline" }}>
            View submissions
          </Link>
        </div>

        {msg && (
          <div style={{ padding: 12, borderRadius: 10, background: "#eef2ff", color: "#111827" }}>
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}
