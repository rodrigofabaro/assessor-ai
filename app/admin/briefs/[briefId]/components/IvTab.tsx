"use client";

import { Pill } from "../../components/ui";
import { tone } from "./briefStyles";
import { IvForm } from "./IvForm";

export function IvTab({ vm }: { vm: any }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Internal Verification (IV)</h2>
          <p className="mt-1 text-sm text-zinc-700">Store IV outcomes per academic year. Saved to the linked brief PDF’s metadata (audit-safe).</p>
        </div>

        <div className="flex items-center gap-2">
          <Pill cls={vm.ivBusy ? tone("info") : vm.ivError ? tone("bad") : tone("ok")}>
            {vm.ivBusy ? "Saving…" : vm.ivError ? "Error" : "Ready"}
          </Pill>
        </div>
      </div>

      {vm.ivError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{vm.ivError}</div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="text-sm font-semibold text-zinc-900">Add IV record</div>
        <p className="mt-1 text-sm text-zinc-700">
          Keep dates and names exactly as stated on your IV paperwork. This is an audit snapshot, not a “pretty” calendar.
        </p>

        <IvForm onAdd={vm.addIvRecord} busy={vm.ivBusy} />
      </div>

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
              vm.ivRecords.map((r: any) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="px-3 py-3 font-semibold text-zinc-900">{r.academicYear}</td>
                  <td className="px-3 py-3">
                    <Pill cls={r.outcome === "APPROVED" ? tone("ok") : r.outcome === "REJECTED" ? tone("bad") : tone("warn")}>
                      {String(r.outcome).replaceAll("_", " ")}
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
  );
}
