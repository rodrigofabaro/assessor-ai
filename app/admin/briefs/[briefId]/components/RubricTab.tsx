"use client";

import { useRef } from "react";
import { Btn, Pill } from "../../components/ui";
import { tone } from "./briefStyles";

export function RubricTab({ vm }: { vm: any }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const attachment = vm.rubric;
  const busy = vm.rubricBusy;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Rubric (optional)</h2>
          <p className="mt-1 text-sm text-zinc-700">
            A brief may include a rubric/guidance block. No rubric versioning — just the rubric used for assessment.
          </p>
        </div>
        <Pill cls={busy ? tone("info") : vm.rubricError ? tone("bad") : tone("ok")}>
          {busy ? "Uploading…" : vm.rubricError ? "Error" : "Ready"}
        </Pill>
      </div>

      {vm.rubricError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {vm.rubricError}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-zinc-200 p-4">
        {attachment ? (
          <div className="grid gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{attachment.originalFilename}</div>
              <div className="text-xs text-zinc-600">
                Uploaded {attachment.uploadedAt ? new Date(attachment.uploadedAt).toLocaleString() : "—"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/reference-documents/${attachment.documentId}/file`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Open rubric
              </a>
              <Btn kind="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
                Replace
              </Btn>
              <Btn kind="ghost" disabled={busy} onClick={() => vm.removeRubric()}>
                Remove
              </Btn>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="text-sm text-zinc-700">No rubric attached yet.</div>
            <div className="flex flex-wrap gap-2">
              <Btn kind="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
                Upload rubric
              </Btn>
              <Btn kind="ghost" disabled>
                Import from PDF (later)
              </Btn>
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          try {
            if (file) {
              await vm.uploadRubric(file);
            }
          } finally {
            input.value = "";
          }
        }}
      />
    </section>
  );
}
