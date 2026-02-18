import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

function normalizeCodes(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(
      arr
        .map((v) => String(v || "").trim().toUpperCase())
        .filter((v) => /^[PMD]\d{1,2}$/.test(v))
    )
  ).sort();
}

function pickBriefExtractedCodes(extractedJson: any): string[] {
  const ex = extractedJson || {};
  const options = [ex?.criteriaCodes, ex?.criteriaRefs, ex?.detectedCriterionCodes];
  for (const opt of options) {
    const normalized = normalizeCodes(opt);
    if (normalized.length) return normalized;
  }
  return [];
}

export async function GET() {
  const perm = await isAdminMutationAllowed();
  if (!perm.ok) {
    return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: perm.reason }, { status: 403 });
  }
  const briefs = await prisma.assignmentBrief.findMany({
    include: {
      unit: { select: { unitCode: true } },
      briefDocument: { select: { id: true, originalFilename: true, extractedJson: true, lockedAt: true } },
      criteriaMaps: {
        include: { assessmentCriterion: true },
      },
    },
    orderBy: [{ unit: { unitCode: "asc" } }, { assignmentCode: "asc" }],
  });

  const rows = briefs.map((b) => {
    const mapped = normalizeCodes(b.criteriaMaps.map((m) => m.assessmentCriterion.acCode));
    const extracted = pickBriefExtractedCodes(b.briefDocument?.extractedJson);
    const mappedSet = new Set(mapped);
    const extractedSet = new Set(extracted);
    const missingInMap = extracted.filter((c) => !mappedSet.has(c));
    const extraInMap = mapped.filter((c) => !extractedSet.has(c));
    const overlap = mapped.filter((c) => extractedSet.has(c));
    const denominator = Math.max(1, Math.max(mapped.length, extracted.length));
    const overlapRatio = overlap.length / denominator;
    const mismatchCount = missingInMap.length + extraInMap.length;
    return {
      briefId: b.id,
      unitCode: b.unit?.unitCode || null,
      assignmentCode: b.assignmentCode,
      briefDocId: b.briefDocument?.id || null,
      briefFilename: b.briefDocument?.originalFilename || null,
      locked: !!b.lockedAt,
      mappedCount: mapped.length,
      extractedCount: extracted.length,
      mismatchCount,
      overlapRatio,
      missingInMap,
      extraInMap,
      mappedCodes: mapped,
      extractedCodes: extracted,
    };
  });

  const mismatched = rows.filter((r) => r.mismatchCount > 0);
  return NextResponse.json({
    ok: true,
    summary: {
      totalBriefs: rows.length,
      mismatched: mismatched.length,
      healthy: rows.length - mismatched.length,
    },
    rows,
  });
}
