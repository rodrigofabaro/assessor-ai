"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  const sp = useSearchParams();
  const seedStudentId = String(sp.get("studentId") || "").trim();
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
  const selectedStudent = studentsSafe.find((s) => s.id === studentId) || null;
  const selectedAssignment = assignmentsSafe.find((a) => a.id === assignmentId) || null;

  useEffect(() => {
    if (!seedStudentId) return;
    if (studentId) return;
    const exists = studentsSafe.some((s) => s.id === seedStudentId);
    if (exists) setStudentId(seedStudentId);
  }, [seedStudentId, studentId, studentsSafe]);

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + (f?.size || 0), 0), [files]);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);

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
      if (!res.ok) throw new Error(j?.error || `Upload failed (${res.status})`);

      const n = Array.isArray(j?.submissions) ? j.submissions.length : 0;
      setMsg(`Uploaded ${n} file${n === 1 ? "" : "s"}. Extraction has been queued automatically.`);
      setFiles([]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
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
    <div className="grid gap-5">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Upload Student Work</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-700">
              Upload one or many student files (PDF/DOC/DOCX). We extract the cover page, identify unit/assignment, and prepare each submission for grading.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold text-zinc-700">
                Batch: {files.length} file{files.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold text-zinc-700">Size: {totalMb} MB</span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-semibold text-sky-800">Auto extract enabled</span>
            </div>
          </div>
        </div>
      </section>

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

        <div className="mt-4 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 md:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Student binding</div>
            <div className="mt-1 font-medium text-zinc-900">{selectedStudent?.fullName || "Auto / Unassigned"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assignment binding</div>
            <div className="mt-1 font-medium text-zinc-900">{selectedAssignment?.title || "Auto detect via cover page"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">After upload</div>
            <div className="mt-1 font-medium text-zinc-900">Extract → Triage → Ready for grading</div>
          </div>
        </div>

        <FilePicker files={files} setFiles={(updater) => setFiles((xs) => updater(xs))} />

        <UploadActions busy={busy} canUpload={canUpload} onUpload={onUpload} />

        {(mergedErr || msg) && (
          <div
            className={cx(
              "mt-4 rounded-xl border p-3 text-sm",
              mergedErr ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
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

