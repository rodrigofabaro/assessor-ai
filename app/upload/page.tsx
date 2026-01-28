"use client";

import { useState } from "react";
import { safeJson, cx } from "@/lib/upload/utils";
import { useUploadPicklists } from "@/lib/upload/useUploadPicklists";
import type { Student } from "@/lib/upload/types";
import { StudentPicker } from "@/components/upload/StudentPicker";
import { AssignmentPicker } from "@/components/upload/AssignmentPicker";
import { FilePicker } from "@/components/upload/FilePicker";
import { AddStudentModal } from "@/components/upload/AddStudentModal";
import { UploadActions } from "@/components/upload/UploadActions";

type UploadResponse = {
  submissions?: unknown[];
  error?: string;
};

export default function UploadPage() {
  const { studentsSafe, assignmentsSafe, err: picklistErr, setErr: setPicklistErr, refresh } = useUploadPicklists();

  const [studentId, setStudentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const [showAddStudent, setShowAddStudent] = useState(false);

  const canUpload = files.length > 0 && !busy;
  const mergedErr = err || picklistErr;

  async function onUpload() {
    setBusy(true);
    setMsg("");
    setErr("");
    setPicklistErr("");

    try {
      const fd = new FormData();
      if (studentId) fd.append("studentId", studentId);
      if (assignmentId) fd.append("assignmentId", assignmentId);
      files.forEach((f) => fd.append("files", f));

      const res = await fetch("/api/submissions/upload", { method: "POST", body: fd });
      const j = (await safeJson(res)) as UploadResponse;

      if (!res.ok) {
        throw new Error(j?.error || `Upload failed (${res.status})`);
      }

      const n = Array.isArray(j?.submissions) ? j.submissions.length : 0;

      setMsg(`Uploaded ${n} file${n === 1 ? "" : "s"}.`);
      setFiles([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  function onStudentCreated(created: Student) {
    if (created?.id) setStudentId(created.id);
    setStudentQuery(created?.fullName ?? "");
    setMsg(`Student added: ${created?.fullName ?? "Created"}`);
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload submissions</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Drop in one or more files (PDF/DOCX). Student and assignment are optional — leave them as{" "}
          <span className="font-medium">Auto / Unassigned</span> and confirm later in the submissions list. Each file
          becomes its own submission record.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <StudentPicker
            students={studentsSafe}
            studentId={studentId}
            setStudentId={setStudentId}
            studentQuery={studentQuery}
            setStudentQuery={setStudentQuery}
            onAddStudent={() => setShowAddStudent(true)}
          />

          <AssignmentPicker
            assignments={assignmentsSafe}
            assignmentId={assignmentId}
            setAssignmentId={setAssignmentId}
            assignmentQuery={assignmentQuery}
            setAssignmentQuery={setAssignmentQuery}
          />
        </div>

        <FilePicker files={files} setFiles={(updater) => setFiles((xs) => updater(xs))} />

        <UploadActions busy={busy} canUpload={canUpload} onUpload={onUpload} />

        {(mergedErr || msg) && (
          <div
            className={cx(
              "mt-4 rounded-xl border p-3 text-sm",
              mergedErr ? "border-red-200 bg-red-50 text-red-900" : "border-indigo-200 bg-indigo-50 text-indigo-900"
            )}
          >
            {mergedErr || msg}
          </div>
        )}
      </section>

      <AddStudentModal
        open={showAddStudent}
        onClose={() => setShowAddStudent(false)}
        onCreated={onStudentCreated}
        refreshPicklists={refresh}
      />
    </div>
  );
}
