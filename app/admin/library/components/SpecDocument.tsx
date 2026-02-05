"use client";

import LearningOutcomeCard from "./LearningOutcomeCard";

export default function SpecDocument({ unit }: { unit: any }) {
  const los = Array.isArray(unit?.learningOutcomes) ? unit.learningOutcomes : [];
  const loCount = los.length;
  const criteriaCount = los.reduce((n: number, lo: any) => n + (Array.isArray(lo?.criteria) ? lo.criteria.length : 0), 0);

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="text-xs text-zinc-600">Extracted content</div>
        <div className="mt-0.5 text-sm text-zinc-900">
          {loCount} learning outcomes • {criteriaCount} assessment criteria
        </div>
      </div>

      {los.length === 0 ? (
        <div className="text-sm text-zinc-600">No learning outcomes were stored for this unit.</div>
      ) : (
        <div className="grid gap-3">
          {los.map((lo: any, idx: number) => (
            <LearningOutcomeCard key={lo.id || `${lo.loCode}-${idx}`} lo={lo} />
          ))}
        </div>
      )}
    </div>
  );
}
