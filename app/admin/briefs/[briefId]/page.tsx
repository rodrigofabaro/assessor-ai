"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBriefDetail, type BriefTask, type ReferenceDocument } from "./briefDetail.logic";

function Pill({ tone, children }: { tone: string; children: any }) {
  return <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " + tone}>{children}</span>;
}

function tone(kind: "ok" | "warn" | "bad" | "info" | "muted") {
  switch (kind) {
    case "ok":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "warn":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    case "bad":
      return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
    case "info":
      return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
    default:
      return "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200";
  }
}

function statusTone(s: string) {
  const u = (s || "").toUpperCase();
  if (u.includes("LOCK")) return tone("ok");
  if (u.includes("FAIL") || u.includes("ERROR")) return tone("bad");
  if (u.includes("MAP") || u.includes("RUN")) return tone("info");
  if (u.includes("DRAFT") || u.includes("PEND") || u.includes("UPLOADED")) return tone("warn");
  return tone("muted");
}

function Btn({
  kind,
  children,
  onClick,
  disabled,
}: {
  kind: "primary" | "ghost";
  children: any;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls =
    kind === "primary"
      ? "rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900"
      : "rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

function LinkBtn({
  kind,
  children,
  href,
  disabled,
}: {
  kind: "primary" | "ghost";
  children: any;
  href: string;
  disabled?: boolean;
}) {
  const cls =
    kind === "primary"
      ? "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
      : "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50";

  if (disabled) {
    return <span className={cls + " opacity-50 cursor-not-allowed"}>{children}</span>;
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
    </a>
  );
}

function IvForm({
  onAdd,
  busy,
}: {
  onAdd: (r: { academicYear: string; verifierName?: string | null; verificationDate?: string | null; outcome: "APPROVED" | "CHANGES_REQUIRED" | "REJECTED"; notes?: string | null }) => void;
  busy: boolean;
}) {
  const [academicYear, setAcademicYear] = useState("");
  const [outcome, setOutcome] = useState<"APPROVED" | "CHANGES_REQUIRED" | "REJECTED">("CHANGES_REQUIRED");
  const [verifierName, setVerifierName] = useState("");
  const [verificationDate, setVerificationDate] = useState("");
  const [notes, setNotes] = useState("");

  const canAdd = academicYear.trim().length >= 4;

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-zinc-700">Academic year</label>
        <input
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          placeholder="2025-26"
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-700">Outcome</label>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as any)}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
        >
          <option value="APPROVED">APPROVED</option>
          <option value="CHANGES_REQUIRED">CHANGES REQUIRED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-700">Verifier name</label>
        <input
          value={verifierName}
          onChange={(e) => setVerifierName(e.target.value)}
          placeholder="Dr. Michael Shaw"
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-700">Verification date</label>
        <input
          value={verificationDate}
          onChange={(e) => setVerificationDate(e.target.value)}
          placeholder="1st September 2025"
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-zinc-700">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional notes / actions required..."
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div className="md:col-span-2 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={!canAdd || busy}
          onClick={() => {
            if (!canAdd) return;
            onAdd({
              academicYear: academicYear.trim(),
              outcome,
              verifierName: verifierName.trim() || null,
              verificationDate: verificationDate.trim() || null,
              notes: notes.trim() || null,
            });
            setAcademicYear("");
            setOutcome("CHANGES_REQUIRED");
            setVerifierName("");
            setVerificationDate("");
            setNotes("");
          }}
          className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Add record
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <div className="text-xs font-semibold text-zinc-700">{label}</div>
      <div className="mt-1 text-sm text-zinc-900">{value || "—"}</div>
    </div>
  );
}

export default function BriefDetailPage() {
  const params = useParams<{ briefId: string }>();
  const router = useRouter();
  const vm = useBriefDetail(params?.briefId || "");

  const [tab, setTab] = useState<"overview" | "versions" | "tasks" | "iv" | "rubric">("overview");

  const title = useMemo(() => {
    if (!vm.brief) return "Brief detail";
    return `${vm.brief.unit?.unitCode || ""} ${vm.brief.assignmentCode} — ${vm.brief.title}`;
  }, [vm.brief]);

  const pdfHref = vm.linkedDoc ? `/api/reference-documents/${vm.linkedDoc.id}/file` : "";
  const header = vm.linkedDoc?.extractedJson?.header || null;
  const extractedTasks = Array.isArray(vm.linkedDoc?.extractedJson?.tasks) ? vm.linkedDoc?.extractedJson?.tasks : [];
  const tasks = vm.tasksOverride ?? extractedTasks;
  const tasksWarnings = (vm.linkedDoc?.extractedJson?.warnings || []).filter(Boolean);

  return (
    <div className="grid gap-4 min-w-0">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate">{title}</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Inspector for a single brief. Versions, PDF link, and QA fields live here — not on the library page.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Btn kind="ghost" onClick={() => router.push("/admin/briefs")}>
              Back to briefs
            </Btn>

            <LinkBtn kind="ghost" href={pdfHref} disabled={!vm.linkedDoc}>
              Open PDF
            </LinkBtn>

            <Btn kind="primary" onClick={vm.refresh} disabled={vm.busy}>
              Refresh
            </Btn>

            <div className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-600">
              <span className={"h-2 w-2 rounded-full " + (vm.error ? "bg-rose-500" : "bg-emerald-500")} />
              {vm.busy ? "Working…" : "Ready"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn kind={tab === "overview" ? "primary" : "ghost"} onClick={() => setTab("overview")}>
            Overview
          </Btn>
          <Btn kind={tab === "versions" ? "primary" : "ghost"} onClick={() => setTab("versions")}>
            Versions
          </Btn>
          <Btn kind={tab === "tasks" ? "primary" : "ghost"} onClick={() => setTab("tasks")}>
            Tasks
          </Btn>
          <Btn kind={tab === "iv" ? "primary" : "ghost"} onClick={() => setTab("iv")}>
            IV
          </Btn>
          <Btn kind={tab === "rubric" ? "primary" : "ghost"} onClick={() => setTab("rubric")}>
            Rubric
          </Btn>
        </div>

        {vm.error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            {vm.error}
          </div>
        ) : null}
      </header>

      {!vm.brief ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-700">Brief not found. It may have been deleted or is not linked to a unit.</div>
          <div className="mt-2 text-xs text-zinc-600">
            ID: <span className="font-mono">{params?.briefId}</span>
          </div>
        </section>
      ) : null}

      {vm.brief && tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: key facts */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-semibold text-zinc-900">Brief summary</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Status" value={<Pill tone={statusTone(vm.brief.status)}>{(vm.brief.status || "").toUpperCase()}</Pill>} />
              <Field label="Spec issue" value={vm.brief.unit?.specIssue || vm.brief.unit?.specVersionLabel || "—"} />
              <Field
                label="Assignment"
                value={
                  vm.brief.assignmentNumber && vm.brief.totalAssignments
                    ? `Assignment ${vm.brief.assignmentNumber}/${vm.brief.totalAssignments}`
                    : "—"
                }
              />
              <Field label="PDF link" value={<Pill tone={vm.brief.briefDocumentId ? tone("ok") : tone("warn")}>{vm.brief.briefDocumentId ? "Linked" : "Missing"}</Pill>} />
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 p-3">
              <div className="text-xs font-semibold text-zinc-700">Linked PDF (reference document)</div>
              {vm.linkedDoc ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-900 truncate">
                      {vm.linkedDoc.title || vm.linkedDoc.originalFilename}
                    </div>
                    <div className="text-xs text-zinc-600 truncate">
                      {vm.linkedDoc.originalFilename} • v{vm.linkedDoc.version}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={statusTone(vm.linkedDoc.status)}>{(vm.linkedDoc.status || "").toUpperCase()}</Pill>
                    {vm.linkedDoc.lockedAt ? <Pill tone={tone("ok")}>Locked</Pill> : <Pill tone={tone("warn")}>Not locked</Pill>}
                    <LinkBtn kind="ghost" href={pdfHref}>
                      Preview
                    </LinkBtn>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-700">
                  No linked document found. Use Extract tools to lock the correct brief PDF.
                </div>
              )}
            </div>

            {/* Pearson header fields */}
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Pearson header (from PDF)</h3>
                  <p className="mt-1 text-sm text-zinc-700">
                    Snapshot of the brief’s cover/header fields. These are extracted for auditability.
                  </p>
                </div>
                <Pill tone={header ? tone("ok") : tone("warn")}>{header ? "Extracted" : "Not extracted yet"}</Pill>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Academic year" value={header?.academicYear} />
                <Field label="Qualification" value={header?.qualification} />
                <Field label="Assessor" value={header?.assessor} />
                <Field label="Internal verifier" value={header?.internalVerifier} />
                <Field label="Verification date" value={header?.verificationDate} />
                <Field label="Issue date" value={header?.issueDate} />
                <Field label="Final submission date" value={header?.finalSubmissionDate} />
                <Field label="Unit code (Pearson)" value={header?.unitCode} />
              </div>

              {header?.unitNumberAndTitle ? (
                <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">Unit number and title (raw)</div>
                  <div className="mt-1 text-sm text-zinc-900">{header.unitNumberAndTitle}</div>
                </div>
              ) : null}
            </div>
          </section>

          {/* Right: audit placeholders */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Audit later</h2>
            <p className="mt-1 text-sm text-zinc-700">These counters populate once grading is implemented.</p>

            <div className="mt-4 grid gap-2">
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2">
                <div className="text-sm text-zinc-700">Submissions graded with this brief</div>
                <div className="text-sm font-semibold text-zinc-900">—</div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2">
                <div className="text-sm text-zinc-700">Last graded</div>
                <div className="text-sm font-semibold text-zinc-900">—</div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2">
                <div className="text-sm text-zinc-700">IV status (per year)</div>
                <div className="text-sm font-semibold text-zinc-900">—</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-zinc-600">
              Rule: grading records will reference the exact brief document used at the time (no drift).
            </div>
          </section>
        </div>
      ) : null}

      {vm.brief && tab === "versions" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Document versions</h2>
              <p className="mt-1 text-sm text-zinc-700">
                All BRIEF PDFs that appear to match this unit + assignment code. Lock one in Extract tools to make it authoritative.
              </p>
            </div>
            <Btn kind="ghost" onClick={() => router.push("/admin/briefs#extract")}>
              Go to inbox
            </Btn>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Title / file</th>
                  <th className="px-3 py-2 text-left font-semibold">v</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Locked</th>
                  <th className="px-3 py-2 text-left font-semibold">PDF</th>
                </tr>
              </thead>
              <tbody>
                {vm.familyDocs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-zinc-600">
                      No matching documents found. Upload or extract a brief PDF first.
                    </td>
                  </tr>
                ) : (
                  vm.familyDocs.map((d) => (
                    <tr key={d.id} className="border-t border-zinc-100">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-zinc-900">{d.title || d.originalFilename}</div>
                        <div className="text-xs text-zinc-600">{d.originalFilename}</div>
                      </td>
                      <td className="px-3 py-3 text-zinc-700">v{d.version}</td>
                      <td className="px-3 py-3">
                        <Pill tone={statusTone(d.status)}>{(d.status || "").toUpperCase()}</Pill>
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={d.lockedAt ? tone("ok") : tone("muted")}>{d.lockedAt ? "Yes" : "No"}</Pill>
                      </td>
                      <td className="px-3 py-3">
                        <LinkBtn kind="ghost" href={`/api/reference-documents/${d.id}/file`}>
                          Open
                        </LinkBtn>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-zinc-600">
            Note: if header fields show “Not extracted yet”, run Extract (or Force) on the PDF in the inbox.
          </div>
        </section>
      ) : null}

      {vm.brief && tab === "tasks" ? (
        <TasksTab
          linkedDoc={vm.linkedDoc}
          tasksOverride={vm.tasksOverride}
          tasksBusy={vm.tasksBusy}
          tasksError={vm.tasksError}
          saveTasksOverride={vm.saveTasksOverride}
        />
      ) : null}

      {vm.brief && tab === "iv" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Internal Verification (IV)</h2>
              <p className="mt-1 text-sm text-zinc-700">
                Store IV outcomes per academic year. Saved to the linked brief PDF’s metadata (audit-safe).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={vm.ivBusy ? tone("info") : vm.ivError ? tone("bad") : tone("ok")}>
                {vm.ivBusy ? "Saving…" : vm.ivError ? "Error" : "Ready"}
              </Pill>
            </div>
          </div>

          {vm.ivError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              {vm.ivError}
            </div>
          ) : null}

          {/* Add IV record */}
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Add IV record</div>
            <p className="mt-1 text-sm text-zinc-700">
              Keep dates and names exactly as stated on your IV paperwork. This is an audit snapshot, not a “pretty” calendar.
            </p>

            <IvForm onAdd={vm.addIvRecord} busy={vm.ivBusy} />
          </div>

          {/* Existing records */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Academic year</th>
                  <th className="px-3 py-2 text-left font-semibold">Outcome</th>
                  <th className="px-3 py-2 text-left font-semibold">Verifier</th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Notes</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vm.ivRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-600">
                      No IV records yet.
                    </td>
                  </tr>
                ) : (
                  vm.ivRecords.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100">
                      <td className="px-3 py-3 font-semibold text-zinc-900">{r.academicYear}</td>
                      <td className="px-3 py-3">
                        <Pill
                          tone={
                            r.outcome === "APPROVED"
                              ? tone("ok")
                              : r.outcome === "REJECTED"
                              ? tone("bad")
                              : tone("warn")
                          }
                        >
                          {r.outcome.replaceAll("_", " ")}
                        </Pill>
                      </td>
                      <td className="px-3 py-3 text-zinc-700">{r.verifierName || "—"}</td>
                      <td className="px-3 py-3 text-zinc-700">{r.verificationDate || "—"}</td>
                      <td className="px-3 py-3 text-zinc-700">{r.notes || "—"}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => vm.deleteIvRecord(r.id)}
                          disabled={vm.ivBusy}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-zinc-600">
            Later: attach evidence files, add sign-off workflow, and gate “Activate for grading” on IV approval.
          </div>
        </section>
      ) : null}

      {vm.brief && tab === "rubric" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Rubric (optional)</h2>
          <p className="mt-1 text-sm text-zinc-700">
            A brief may include a rubric/guidance block. No rubric versioning — just the rubric used for assessment.
          </p>

          <div className="mt-4 rounded-xl border border-zinc-200 p-4">
            <div className="text-sm text-zinc-700">No rubric attached yet.</div>
            <div className="mt-3 flex gap-2">
              <Btn kind="primary" disabled onClick={() => {}}>
                Add rubric (next)
              </Btn>
              <Btn kind="ghost" disabled onClick={() => {}}>
                Import from PDF (later)
              </Btn>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TasksTab({
  linkedDoc,
  tasksOverride,
  tasksBusy,
  tasksError,
  saveTasksOverride,
}: {
  linkedDoc: ReferenceDocument | null;
  tasksOverride: BriefTask[] | null;
  tasksBusy: boolean;
  tasksError: string | null;
  saveTasksOverride: (tasks: BriefTask[] | null) => Promise<void>;
}) {
  const extracted = (linkedDoc?.extractedJson?.tasks || []) as BriefTask[];
  const warnings = (linkedDoc?.extractedJson?.warnings || []) as string[];
  const activeTasks = tasksOverride && tasksOverride.length ? tasksOverride : extracted;

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState(() =>
    JSON.stringify(tasksOverride && tasksOverride.length ? tasksOverride : extracted || [], null, 2)
  );
  const [localErr, setLocalErr] = useState<string | null>(null);

  // Keep editor content in sync when you switch docs/overrides.
  useEffect(() => {
    setDraft(JSON.stringify(tasksOverride && tasksOverride.length ? tasksOverride : extracted || [], null, 2));
    setLocalErr(null);
    setMode("view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedDoc?.id, !!tasksOverride, (tasksOverride || []).length, (extracted || []).length]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Tasks & questions</h2>
          <p className="mt-1 text-sm text-zinc-700">
            This is the brief&apos;s “question paper”. The grader will later check student evidence against these task blocks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Pill tone={tasksOverride ? tone("info") : tone("muted")}>{tasksOverride ? "OVERRIDE" : "EXTRACTED"}</Pill>
          <button
            type="button"
            onClick={() => setMode(mode === "view" ? "edit" : "view")}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            {mode === "view" ? "Edit override" : "Close editor"}
          </button>
        </div>
      </div>

      {warnings?.length ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Extraction warnings</div>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {tasksError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {tasksError}
        </div>
      ) : null}

      {mode === "view" ? (
        <div className="mt-4 grid gap-3">
          {activeTasks && activeTasks.length ? (
            activeTasks.map((t) => (
              <div key={`${t.label}-${t.n}`} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{t.heading || t.label}</div>
                    {t.warnings?.length ? (
                      <div className="mt-1 text-xs text-amber-900">Warning: {t.warnings.join(", ")}</div>
                    ) : null}
                  </div>
                  <Pill tone={tone("muted")}>#{t.n}</Pill>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900">
                  {t.text || "(no body detected)"}
                </pre>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              No tasks detected yet. Run Extract on the BRIEF PDF in the inbox. If the template is odd, use the override editor.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            Paste/edit a JSON array of task objects. Minimal shape:
            <span className="ml-2 font-mono">[{`{ n: 1, label: "Task 1", text: "..." }`}, …]</span>
          </div>

          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setLocalErr(null);
            }}
            rows={14}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
          />

          {localErr ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{localErr}</div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={tasksBusy}
              onClick={async () => {
                try {
                  const parsed = JSON.parse(draft);
                  if (!Array.isArray(parsed)) throw new Error("Override must be a JSON array");
                  // Light validation
                  const cleaned: BriefTask[] = parsed
                    .filter(Boolean)
                    .map((x: any) => ({
                      n: Number(x.n) || 0,
                      label: String(x.label || `Task ${x.n || ""}`),
                      heading: x.heading ?? null,
                      text: String(x.text || ""),
                      warnings: Array.isArray(x.warnings) ? x.warnings.map(String) : undefined,
                    }))
                    .filter((x) => x.n >= 1 && x.label && typeof x.text === "string");

                  if (!cleaned.length) throw new Error("No valid tasks found in override");
                  await saveTasksOverride(cleaned);
                  setMode("view");
                } catch (e: any) {
                  setLocalErr(e?.message || String(e));
                }
              }}
              className="rounded-xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Save override
            </button>

            <button
              type="button"
              disabled={tasksBusy}
              onClick={async () => {
                await saveTasksOverride(null);
                setDraft(JSON.stringify(extracted || [], null, 2));
                setMode("view");
              }}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            >
              Clear override
            </button>

            <div className="ml-auto text-xs text-zinc-600">{tasksBusy ? "Saving…" : "Ready"}</div>
          </div>
        </div>
      )}
    </section>
  );
}
