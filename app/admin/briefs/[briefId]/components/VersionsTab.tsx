"use client";

import { useRouter } from "next/navigation";
import { Btn, Pill } from "../../components/ui";
import { statusTone, tone } from "./briefStyles";

function detectIssueLabel(doc: any): string {
  const headerIssue = String(doc?.extractedJson?.header?.issue || doc?.extractedJson?.header?.issueLabel || "").trim();
  if (headerIssue) return headerIssue;
  const src = `${String(doc?.extractedJson?.preview || "")}\n${String(doc?.extractedJson?.text || "")}`;
  const full = src.match(/\bIssue\s*\d+\s*-\s*\d{4}\s*\/\s*\d{2}\b/i);
  if (full?.[0]) return full[0].replace(/\s+/g, " ").trim();
  const simple = src.match(/\bIssue\s*\d+\b/i);
  return simple?.[0] ? simple[0].replace(/\s+/g, " ").trim() : "—";
}

export function VersionsTab({ vm }: { vm: any }) {
  const router = useRouter();
  const targetIssue = String(vm?.brief?.unit?.specIssue || vm?.brief?.unit?.specVersionLabel || "").trim().toLowerCase();

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Document versions</h2>
          <p className="mt-1 text-sm text-zinc-700">
            Version control is driven by brief issue. Pick the PDF whose issue matches your spec issue, then lock it as authoritative.
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
              <th className="px-3 py-2 text-left font-semibold">Issue</th>
              <th className="px-3 py-2 text-left font-semibold">v</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Locked</th>
              <th className="px-3 py-2 text-left font-semibold">PDF</th>
            </tr>
          </thead>
          <tbody>
            {vm.familyDocs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-600">
                  No matching documents found. Upload or extract a brief PDF first.
                </td>
              </tr>
            ) : (
              vm.familyDocs.map((d: any) => {
                const issue = detectIssueLabel(d);
                const issueMatch = targetIssue ? issue.toLowerCase().includes(targetIssue) : false;
                return (
                <tr key={d.id} className="border-t border-zinc-100">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-zinc-900">{d.title || d.originalFilename}</div>
                    <div className="text-xs text-zinc-600">{d.originalFilename}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-700">{issue}</span>
                      {targetIssue ? (
                        <Pill cls={issueMatch ? tone("ok") : tone("warn")}>{issueMatch ? "Matches spec" : "Check issue"}</Pill>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-zinc-700">v{d.version}</td>
                  <td className="px-3 py-3">
                    <Pill cls={statusTone(d.status)}>{(d.status || "").toUpperCase()}</Pill>
                  </td>
                  <td className="px-3 py-3">
                    <Pill cls={d.lockedAt ? tone("ok") : tone("muted")}>{d.lockedAt ? "Yes" : "No"}</Pill>
                  </td>
                  <td className="px-3 py-3">
                    <a
                      href={`/api/reference-documents/${d.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-zinc-600">
        Note: if Issue shows “—”, run Extract (or Force) on that PDF so footer/header issue data is captured.
      </div>
    </section>
  );
}
