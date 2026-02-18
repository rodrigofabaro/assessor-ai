"use client";

import { useState } from "react";

export function IvForm({
  onAdd,
  busy,
}: {
  onAdd: (r: {
    academicYear: string;
    verifierName?: string | null;
    verificationDate?: string | null;
    outcome: "APPROVED" | "CHANGES_REQUIRED" | "REJECTED";
    notes?: string | null;
  }) => void;
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
          className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-900 bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-50"
        >
          Add record
        </button>
      </div>
    </div>
  );
}

