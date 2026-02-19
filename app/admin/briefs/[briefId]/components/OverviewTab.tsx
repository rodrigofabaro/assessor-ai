"use client";

import { useMemo } from "react";
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

