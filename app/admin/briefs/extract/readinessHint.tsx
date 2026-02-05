"use client";

import { useMemo } from "react";
// This patch adds READINESS HINTS to the Extract Inbox.
// It does NOT block actions. It explains what will be missing later if you lock now.

type Readiness = "READY" | "ATTN" | "BLOCKED";

function pill(kind: Readiness) {
  if (kind === "READY") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  if (kind === "BLOCKED") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
  return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
}

function ReadinessHint({ level, reason }: { level: Readiness; reason: string }) {
  return (
    <span title={reason} className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " + pill(level)}>
      {level}
    </span>
  );
}

// Example usage: attach to each inbox row where you already render status/actions.
// Call this helper with computed signals from extractedJson + unit/spec linkage.
export function InboxReadinessCell({
  hasLinkedBrief,
  specLocked,
  headerYear,
  ivForYear,
}: {
  hasLinkedBrief: boolean;
  specLocked: boolean;
  headerYear?: string | null;
  ivForYear?: { outcome: "APPROVED" | "CHANGES_REQUIRED" | "REJECTED" } | null;
}) {
  const { level, reason } = useMemo(() => {
    if (!hasLinkedBrief) return { level: "ATTN" as Readiness, reason: "Not linked to a brief yet." };
    if (!specLocked) return { level: "ATTN" as Readiness, reason: "Unit spec is not locked." };
    if (!headerYear) return { level: "ATTN" as Readiness, reason: "Academic year not extracted from PDF header." };
    if (!ivForYear) return { level: "ATTN" as Readiness, reason: `No IV record for academic year ${headerYear}.` };
    if (ivForYear.outcome === "REJECTED") return { level: "BLOCKED" as Readiness, reason: "IV outcome is REJECTED." };
    if (ivForYear.outcome === "CHANGES_REQUIRED")
      return { level: "ATTN" as Readiness, reason: "IV outcome is CHANGES REQUIRED." };
    return { level: "READY" as Readiness, reason: "Will be ready for grading once locked." };
  }, [hasLinkedBrief, specLocked, headerYear, ivForYear]);

  return <ReadinessHint level={level} reason={reason} />;
}

// NOTE:
// Integrate <InboxReadinessCell /> into your existing inbox row renderer.
// This file is intentionally additive and non-breaking.
