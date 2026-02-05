"use client";

import { useRouter } from "next/navigation";
import { Btn, Pill } from "../../components/ui";
import { statusTone, tone } from "./briefStyles";

export function VersionsTab({ vm }: { vm: any }) {
  const router = useRouter();

  return (
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
              vm.familyDocs.map((d: any) => (
                <tr key={d.id} className="border-t border-zinc-100">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-zinc-900">{d.title || d.originalFilename}</div>
                    <div className="text-xs text-zinc-600">{d.originalFilename}</div>
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-zinc-600">
        Note: if header fields show “Not extracted yet”, run Extract (or Force) on the PDF in the inbox.
      </div>
    </section>
  );
}
