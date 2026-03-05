"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { put as putBlobClient } from "@vercel/blob/client";
import { safeJson, cx } from "@/lib/upload/utils";
import { useUploadPicklists } from "@/lib/upload/useUploadPicklists";
import type { Student } from "@/lib/upload/types";
import { StudentPicker } from "@/components/upload/StudentPicker";
import { AssignmentPicker } from "@/components/upload/AssignmentPicker";
import { FilePicker } from "@/components/upload/FilePicker";
import { AddStudentModal } from "@/components/upload/AddStudentModal";
import { UploadActions } from "@/components/upload/UploadActions";
import { TinyIcon } from "@/components/ui/TinyIcon";

type UploadResponse = {
  submissions?: unknown[];
  error?: string;
  code?: string;
};

const BLOB_MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;

type BlobTokenResponse = {
  clientToken: string;
  storagePath: string;
  storedFilename: string;
  maxBytes: number;
  allowedType: "pdf" | "docx";
};

type SubmissionBlobFinalizeResponse = {
  submission?: { id: string };
  error?: string;
  message?: string;
  code?: string;
};

type UploadResult = {
  fileName: string;
  ok: boolean;
  reason?: string;
};

class UploadFlowError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function guessMimeType(file: File) {
  if (file.type) return file.type;
  const lower = String(file.name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function cleanErrorMessage(raw: unknown, fallback: string) {
  const msg = String(raw || "").trim();
  return msg || fallback;
}

export function UploadPageClient() {
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
      const uploadLegacyBatch = async (batch: File[]): Promise<UploadResult[]> => {
        if (!batch.length) return [];
        const fd = new FormData();
        if (studentId) fd.append("studentId", studentId);
        if (assignmentId) fd.append("assignmentId", assignmentId);
        batch.forEach((f) => fd.append("files", f));

        const res = await fetch("/api/submissions/upload", { method: "POST", body: fd });
        const payload = (await safeJson(res)) as UploadResponse;
        if (!res.ok) {
          const reason = cleanErrorMessage(payload?.error, `Upload failed (${res.status})`);
          return batch.map((f) => ({ fileName: f.name, ok: false, reason }));
        }
        return batch.map((f) => ({ fileName: f.name, ok: true }));
      };

      const uploadViaBlob = async (file: File): Promise<UploadResult> => {
        const tokenRes = await fetch("/api/submissions/blob-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
          }),
        });
        const tokenJson = (await safeJson(tokenRes)) as Partial<BlobTokenResponse> & {
          error?: string;
          message?: string;
          code?: string;
        };
        if (!tokenRes.ok) {
          const errorCode = cleanErrorMessage(tokenJson.error || tokenJson.code, "BLOB_TOKEN_FAILED");
          if (errorCode === "CLIENT_BLOB_UPLOAD_DISABLED") {
            throw new UploadFlowError("Client Blob upload is disabled.", "CLIENT_BLOB_UPLOAD_DISABLED", tokenRes.status);
          }
          const reason = cleanErrorMessage(tokenJson.error || tokenJson.message, `Upload token failed (${tokenRes.status})`);
          throw new UploadFlowError(reason, errorCode, tokenRes.status);
        }

        if (!tokenJson.clientToken || !tokenJson.storagePath || !tokenJson.storedFilename) {
          throw new UploadFlowError("Upload token response is incomplete.");
        }

        const mimeType = guessMimeType(file);
        const blob = await putBlobClient(tokenJson.storagePath, file, {
          token: tokenJson.clientToken,
          access: "private",
          multipart: file.size >= BLOB_MULTIPART_THRESHOLD_BYTES,
          contentType: mimeType,
        });

        const finalizeRes = await fetch("/api/submissions/blob-finalize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            originalFilename: file.name,
            storedFilename: tokenJson.storedFilename,
            storagePath: tokenJson.storagePath,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            contentType: blob.contentType || mimeType,
            sizeBytes: file.size,
            studentId: studentId || null,
            assignmentId: assignmentId || null,
            sourceLastModifiedAt: Number.isFinite(file.lastModified) && file.lastModified > 0 ? new Date(file.lastModified).toISOString() : null,
          }),
        });

        const finalizeJson = (await safeJson(finalizeRes)) as SubmissionBlobFinalizeResponse;
        if (!finalizeRes.ok) {
          const reason = cleanErrorMessage(finalizeJson.error || finalizeJson.message, `Upload finalize failed (${finalizeRes.status})`);
          throw new UploadFlowError(reason, finalizeJson.code, finalizeRes.status);
        }

        return { fileName: file.name, ok: true };
      };

      const settled: UploadResult[] = [];
      let blobUploadEnabled: boolean | null = null;

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (blobUploadEnabled !== false) {
          try {
            const result = await uploadViaBlob(file);
            blobUploadEnabled = true;
            settled.push(result);
            continue;
          } catch (error) {
            const e = error as UploadFlowError;
            if (e.code === "CLIENT_BLOB_UPLOAD_DISABLED") {
              blobUploadEnabled = false;
              const remaining = files.slice(i);
              const fallbackResults = await uploadLegacyBatch(remaining);
              settled.push(...fallbackResults);
              break;
            }
            settled.push({
              fileName: file.name,
              ok: false,
              reason: cleanErrorMessage(e?.message, "Upload failed"),
            });
            continue;
          }
        }
      }

      const okCount = settled.filter((r) => r.ok).length;
      const failCount = settled.length - okCount;
      if (okCount > 0 && failCount === 0) {
        setMsg(`Uploaded ${okCount} file${okCount === 1 ? "" : "s"}. Extraction has been queued automatically.`);
        setFiles([]);
      }
      if (failCount > 0) {
        const reason = settled.find((r) => !r.ok)?.reason || "Upload failed";
        throw new Error(reason);
      }
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
      <section className="rounded-3xl border border-slate-300 bg-gradient-to-r from-slate-100 via-white to-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-900">
              <TinyIcon name="workflow" />
              Workflow Operations
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Upload Student Work</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-700">
              Upload one or many student files (PDF/DOC/DOCX). We extract the cover page, identify unit/assignment, and prepare each submission for grading.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold text-zinc-700">
                Batch: {files.length} file{files.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold text-zinc-700">Size: {totalMb} MB</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-semibold text-sky-800">
                <TinyIcon name="status" className="h-3 w-3" />
                Auto extract enabled
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/help/operations-playbook"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              <TinyIcon name="workflow" className="h-3.5 w-3.5" />
              Open Operations Playbook
            </Link>
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
