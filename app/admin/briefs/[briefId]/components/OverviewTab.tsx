"use client";

import { useMemo, useState } from "react";
import { uniqSortedCriteriaCodes } from "@/lib/extraction/utils/criteriaCodes";
import { BriefCriteriaPanel } from "./BriefCriteriaPanel";

function dateEvidence(label: string, displayValue: any, isoValue?: any) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <span className="text-zinc-500">{label}:</span>{" "}
      <span className="font-semibold text-zinc-900">{displayValue || "—"}</span>
      <div className="mt-1 text-[11px] text-zinc-500">Evidence (ISO): {isoValue || "—"}</div>
    </div>
  );
}

function flattenSpecCriteria(specDoc: any): Array<{ acCode: string; description?: string; loCode?: string; loDescription?: string }> {
  const los = Array.isArray(specDoc?.extractedJson?.learningOutcomes) ? specDoc.extractedJson.learningOutcomes : [];
  const out: Array<{ acCode: string; description?: string; loCode?: string; loDescription?: string }> = [];
  for (const lo of los) {
    const loCode = String(lo?.loCode || "").trim().toUpperCase();
    const loDescription = String(lo?.description || "").trim();
    const criteria = Array.isArray(lo?.criteria) ? lo.criteria : [];
    for (const c of criteria) {
      const acCode = String(c?.acCode || "").trim();
      if (!acCode) continue;
      out.push({
        acCode: acCode.toUpperCase(),
        description: c?.description || "",
        loCode: loCode || undefined,
        loDescription: loDescription || undefined,
      });
    }
  }
  return out;
}

function detectBriefIssue(extracted: any): string | null {
  const headerIssue = String(extracted?.header?.issue || extracted?.header?.issueLabel || "").trim();
  if (headerIssue) return headerIssue;

  const sources = [
    String(extracted?.preview || ""),
    String(extracted?.text || ""),
  ];
  for (const src of sources) {
    if (!src.trim()) continue;
    const full = src.match(/\bIssue\s*\d+\s*-\s*\d{4}\s*\/\s*\d{2}\b/i);
    if (full?.[0]) return full[0].replace(/\s+/g, " ").trim();
    const simple = src.match(/\bIssue\s*\d+\b/i);
    if (simple?.[0]) return simple[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

export function OverviewTab({ vm, pdfHref }: { vm: any; pdfHref: string }) {
  const [scopeBusyKey, setScopeBusyKey] = useState("");
  const extracted = vm.linkedDoc?.extractedJson ?? null;
  const header = extracted?.header || null;

  const safeExtracted = extracted && typeof extracted === "object" ? extracted : null;

  const criteriaCodes = uniqSortedCriteriaCodes([
    ...(Array.isArray(safeExtracted?.criteriaCodes) ? safeExtracted.criteriaCodes : []),
    ...(Array.isArray(safeExtracted?.detectedCriterionCodes) ? safeExtracted.detectedCriterionCodes : []),
    ...(Array.isArray(safeExtracted?.criteriaRefs) ? safeExtracted.criteriaRefs : []),
  ]);

  const safeHeader = safeExtracted?.header || null;
  const issueLabel = detectBriefIssue(safeExtracted);
  const specCriteria = useMemo(() => flattenSpecCriteria(vm.mappedSpecDoc), [vm.mappedSpecDoc]);
  const excludedCodes = useMemo(() => {
    const raw = Array.isArray(vm?.linkedDoc?.sourceMeta?.gradingCriteriaExclusions)
      ? vm.linkedDoc.sourceMeta.gradingCriteriaExclusions
      : [];
    return Array.from(
      new Set(
        raw
          .map((v: unknown) => {
            const m = String(v || "").trim().toUpperCase().match(/^([PMD])\s*(\d{1,2})$/);
            return m ? `${m[1]}${Number(m[2])}` : null;
          })
          .filter(Boolean) as string[]
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [vm?.linkedDoc?.sourceMeta?.gradingCriteriaExclusions]);
  const excludedSet = useMemo(() => new Set(excludedCodes), [excludedCodes]);
  const exclusionLog = useMemo(() => {
    const raw = Array.isArray(vm?.linkedDoc?.sourceMeta?.gradingCriteriaExclusionLog)
      ? vm.linkedDoc.sourceMeta.gradingCriteriaExclusionLog
      : [];
    return raw
      .map((entry: any, idx: number) => {
        const m = String(entry?.criterionCode || "").trim().toUpperCase().match(/^([PMD])\s*(\d{1,2})$/);
        const criterionCode = m ? `${m[1]}${Number(m[2])}` : "";
        return {
          key: String(entry?.at || "") + ":" + String(entry?.criterionCode || "") + ":" + idx,
          criterionCode,
          excluded: entry?.excluded === true,
          reason: String(entry?.reason || "").trim(),
          at: String(entry?.at || ""),
          actor: String(entry?.actor || "").trim(),
          gradedSubmissionCount: Number(entry?.gradedSubmissionCount || 0),
        };
      })
      .filter((entry: any) => !!entry.criterionCode && !!entry.at)
      .sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [vm?.linkedDoc?.sourceMeta?.gradingCriteriaExclusionLog]);

  const applyScopeChange = async (criterionCode: string, excluded: boolean, seedReason?: string) => {
    const reasonPrompt =
      excluded
        ? `Reason for excluding ${criterionCode} from grading (required):`
        : `Reason for including ${criterionCode} in grading (required):`;
    const reason = window.prompt(reasonPrompt, seedReason || "");
    if (reason === null) return;
    const cleanReason = String(reason || "").trim();
    if (cleanReason.length < 6) {
      window.alert("Please provide a short reason (minimum 6 characters).");
      return;
    }
    const action = excluded ? "exclude from" : "include in";
    const ok = window.confirm(
      `Confirm ${action} grading?\n\nCriterion ${criterionCode} will ${excluded ? "not" : ""} be requested during grading.\n\nReason: ${cleanReason}`
    );
    if (!ok) return;

    const key = `${criterionCode}:${excluded ? "1" : "0"}`;
    setScopeBusyKey(key);
    try {
      try {
        await vm.setLinkedDocCriterionExcluded?.(criterionCode, excluded, cleanReason);
      } catch (inner: any) {
        const msg = String(inner?.message || "");
        if (!msg.includes("BRIEF_CRITERIA_SCOPE_CHANGE_CONFIRM_REQUIRED")) throw inner;
        const confirmLive = window.confirm(
          `This brief has graded submissions. Confirm live grading scope change for ${criterionCode}?\n\nReason: ${cleanReason}`
        );
        if (!confirmLive) return;
        await vm.setLinkedDocCriterionExcluded?.(criterionCode, excluded, cleanReason, true);
      }
    } catch (e: any) {
      window.alert(e?.message || "Failed to update criterion grading scope.");
    } finally {
      setScopeBusyKey("");
    }
  };

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Brief overview</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
          {dateEvidence("Verification date", safeHeader?.verificationDate || header?.verificationDate, safeHeader?.verificationDateIso)}
          {dateEvidence("Issue date", safeHeader?.issueDate || header?.issueDate, safeHeader?.issueDateIso)}
          {dateEvidence("Final submission date", safeHeader?.finalSubmissionDate || header?.finalSubmissionDate, safeHeader?.finalSubmissionDateIso)}
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Qualification:</span> <span className="font-semibold text-zinc-900">{safeHeader?.qualification || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Unit number and title:</span> <span className="font-semibold text-zinc-900">{safeHeader?.unitNumberAndTitle || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Assignment title:</span> <span className="font-semibold text-zinc-900">{safeHeader?.assignmentTitle || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Assessor:</span> <span className="font-semibold text-zinc-900">{safeHeader?.assessor || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Academic year:</span> <span className="font-semibold text-zinc-900">{safeHeader?.academicYear || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Unit code (Pearson):</span> <span className="font-semibold text-zinc-900">{safeHeader?.unitCode || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Assignment:</span> <span className="font-semibold text-zinc-900">{safeHeader?.assignment || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Internal verifier:</span> <span className="font-semibold text-zinc-900">{safeHeader?.internalVerifier || "—"}</span></div>
          <div className="rounded-xl border border-zinc-200 p-3"><span className="text-zinc-500">Issue:</span> <span className="font-semibold text-zinc-900">{issueLabel || "—"}</span></div>
        </div>
      </section>

      <BriefCriteriaPanel
        codes={criteriaCodes}
        specCriteria={specCriteria}
        hasSpec={!!vm.mappedSpecDoc}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Criteria scope history</h2>
          <div className="text-xs text-zinc-600">
            Currently excluded:{" "}
            <span className="font-semibold text-zinc-900">
              {excludedCodes.length ? excludedCodes.join(", ") : "None"}
            </span>
          </div>
        </div>
        {exclusionLog.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-700">No criteria scope changes logged for this brief document.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {exclusionLog.slice(0, 20).map((entry: any) => {
              const isCurrentState = excludedSet.has(entry.criterionCode) === entry.excluded;
              const targetLabel = entry.excluded ? "excluded" : "included";
              const busy = scopeBusyKey === `${entry.criterionCode}:${entry.excluded ? "1" : "0"}`;
              return (
                <div key={entry.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-zinc-900">
                      {entry.criterionCode} → {targetLabel.toUpperCase()}
                    </div>
                    <div className="text-xs text-zinc-600">
                      {entry.at ? new Date(entry.at).toLocaleString() : "—"} {entry.actor ? `· ${entry.actor}` : ""}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-700">{entry.reason || "No reason recorded."}</div>
                  {entry.gradedSubmissionCount > 0 ? (
                    <div className="mt-1 text-xs text-amber-800">
                      Live brief at change time: {entry.gradedSubmissionCount} graded submission(s).
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={isCurrentState || busy}
                      onClick={() =>
                        void applyScopeChange(
                          entry.criterionCode,
                          entry.excluded,
                          `Restore from ${String(entry.at || "").slice(0, 10)}: ${entry.reason || ""}`
                        )
                      }
                      className={
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold " +
                        (isCurrentState || busy
                          ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                          : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100")
                      }
                    >
                      {isCurrentState ? "Current state" : busy ? "Applying…" : `Restore ${targetLabel}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Linked PDF</div>

        {vm.linkedDoc ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 truncate">{vm.linkedDoc.title || vm.linkedDoc.originalFilename}</div>
              <div className="text-xs text-zinc-600 truncate">{vm.linkedDoc.originalFilename} • v{vm.linkedDoc.version}</div>
              <div className="mt-1 text-xs text-zinc-600">Status: {(vm.linkedDoc.status || "—").toUpperCase()} • {vm.linkedDoc.lockedAt ? "Locked" : "Not locked"}</div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={pdfHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-sky-700 text-white hover:bg-sky-800"
              >
                Open
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-zinc-700">No linked PDF yet. Use Extract tools to select and lock a brief.</div>
        )}
      </section>

    </div>
  );
}

