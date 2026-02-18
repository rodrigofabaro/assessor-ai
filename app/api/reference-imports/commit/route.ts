import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateBriefLockQuality } from "@/lib/briefs/lockQualityGate";
import { selectBriefMappingCodes } from "@/lib/briefs/mappingCodes";

import type { ExtractDraft, SpecDraft, BriefDraft, GradeBand } from "@/lib/referenceParser";

function cleanCode(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const documentId = body?.documentId as string | undefined;
    const draft = body?.draft as ExtractDraft | undefined;
    const overrideUnitId = body?.unitId as string | undefined; // for BRIEF imports
    const allowQualityGateBypass = body?.allowQualityGateBypass as boolean | undefined;

    if (!documentId || !draft) {
      return NextResponse.json({ error: "Missing documentId or draft" }, { status: 400 });
    }

    const doc = await prisma.referenceDocument.findUnique({ where: { id: documentId } });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    if (draft.kind === "SPEC") {
      const spec = draft as SpecDraft;

      const unitCode = (spec.unit.unitCode || "").trim();
      const unitTitle = (spec.unit.unitTitle || doc.title || "").trim();
      if (!unitCode) {
        return NextResponse.json(
          { error: "Unit code is required for SPEC import (e.g. 4017)." },
          { status: 400 }
        );
      }
      if (!unitTitle) {
        return NextResponse.json(
          { error: "Unit title is required for SPEC import." },
          { status: 400 }
        );
      }

      // Find existing unit by code; if multiple exist, we pick the newest.
      let unit = await prisma.unit.findFirst({
        where: { unitCode },
        orderBy: { createdAt: "desc" },
      });

      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            unitCode,
            unitTitle,
            specDocumentId: doc.type === "SPEC" ? doc.id : null,
          },
        });
      } else {
        // Update title/spec link (non-destructive)
        unit = await prisma.unit.update({
          where: { id: unit.id },
          data: {
            unitTitle,
            specDocumentId: doc.type === "SPEC" ? doc.id : unit.specDocumentId,
          },
        });
      }

      // Upsert LOs + ACs
      const created: { learningOutcomes: number; criteria: number } = { learningOutcomes: 0, criteria: 0 };

      for (const lo of spec.learningOutcomes || []) {
        const loCode = lo.loCode.trim().toUpperCase();
        if (!loCode) continue;

        const loRec = await prisma.learningOutcome.upsert({
          where: { unitId_loCode: { unitId: unit.id, loCode } },
          update: {
            description: lo.description || "",
          },
          create: {
            unitId: unit.id,
            loCode,
            description: lo.description || "",
          },
        });
        created.learningOutcomes += 1;

        for (const c of lo.criteria || []) {
          const acCode = cleanCode(c.acCode);
          if (!acCode) continue;
          const gradeBand: GradeBand = c.gradeBand || (acCode.startsWith("P") ? "PASS" : acCode.startsWith("M") ? "MERIT" : "DISTINCTION");

          await prisma.assessmentCriterion.upsert({
            where: { learningOutcomeId_acCode: { learningOutcomeId: loRec.id, acCode } },
            update: {
              gradeBand: gradeBand as any,
              description: c.description || "",
            },
            create: {
              learningOutcomeId: loRec.id,
              acCode,
              gradeBand: gradeBand as any,
              description: c.description || "",
            },
          });
          created.criteria += 1;
        }
      }

      return NextResponse.json({ ok: true, kind: "SPEC", unitId: unit.id, created });
    }

    if (draft.kind === "BRIEF") {
      const brief = draft as BriefDraft;

      const assignmentCode = (brief.assignmentCode || "").trim().toUpperCase();
      if (!assignmentCode) {
        return NextResponse.json(
          { error: "Assignment code is required for BRIEF import (e.g. A1)." },
          { status: 400 }
        );
      }

      // Determine unit
      let unit = null;
      if (overrideUnitId) {
        unit = await prisma.unit.findUnique({ where: { id: overrideUnitId } });
      }
      if (!unit && brief.unitCodeGuess) {
        unit = await prisma.unit.findFirst({ where: { unitCode: brief.unitCodeGuess }, orderBy: { createdAt: "desc" } });
      }
      if (!unit) {
        return NextResponse.json(
          { error: "Could not determine Unit for this brief. Select a Unit and try again." },
          { status: 400 }
        );
      }

      const title = (brief.title || doc.title || "").trim();
      if (!title) {
        return NextResponse.json({ error: "Brief title is required." }, { status: 400 });
      }

      const unitCriteria = await prisma.assessmentCriterion.findMany({
        where: { learningOutcome: { unitId: unit.id } },
        select: {
          acCode: true,
          gradeBand: true,
          learningOutcome: { select: { loCode: true } },
        },
      });
      const mappedUnitCriteria = unitCriteria.map((c) => ({
        acCode: c.acCode,
        gradeBand: c.gradeBand as GradeBand,
        loCode: c.learningOutcome?.loCode || "",
      }));
      const pickedCodes = selectBriefMappingCodes(brief as any, mappedUnitCriteria);
      const codes = pickedCodes.selectedCodes;
      const qualityGate = evaluateBriefLockQuality({
        assignmentCode,
        title,
        hasUnitSignal: Boolean(overrideUnitId || brief.unitCodeGuess),
        selectedCodes: codes,
        rawText: String((brief as any)?.rawText || ""),
        unitCriteria: mappedUnitCriteria,
      });
      if (!qualityGate.ok && !allowQualityGateBypass) {
        return NextResponse.json(
          {
            error: "BRIEF_EXTRACTION_QUALITY_GATE_FAILED",
            message: "Brief extraction quality gate failed. Fix extraction/mapping before commit.",
            blockers: qualityGate.blockers,
            warnings: qualityGate.warnings,
            metrics: qualityGate.metrics,
            suggestion: "Re-extract the brief, then verify criteria mapping (or retry with allowQualityGateBypass=true after manual review).",
          },
          { status: 422 }
        );
      }

      // Upsert brief
      const briefRec = await prisma.assignmentBrief.upsert({
        where: { unitId_assignmentCode: { unitId: unit.id, assignmentCode } },
        update: {
          title,
          briefDocumentId: doc.type === "BRIEF" ? doc.id : null,
        },
        create: {
          unitId: unit.id,
          assignmentCode,
          title,
          briefDocumentId: doc.type === "BRIEF" ? doc.id : null,
        },
      });

      // Map detected criterion codes (best-effort)
      const criteria = await prisma.assessmentCriterion.findMany({
        where: {
          learningOutcome: { unitId: unit.id },
          acCode: { in: codes },
        },
      });

      // Replace mapping
      await prisma.assignmentCriterionMap.deleteMany({ where: { assignmentBriefId: briefRec.id } });
      if (criteria.length) {
        await prisma.assignmentCriterionMap.createMany({
          data: criteria.map((c) => ({ assignmentBriefId: briefRec.id, assessmentCriterionId: c.id })),
          skipDuplicates: true,
        });
      }

      return NextResponse.json({
        ok: true,
        kind: "BRIEF",
        briefId: briefRec.id,
        mapped: criteria.length,
        detected: codes.length,
        qualityGate,
      });
    }

    return NextResponse.json({ error: "Unknown draft kind" }, { status: 400 });
  } catch (err) {
    console.error("REFERENCE_COMMIT_ERROR:", err);
    return NextResponse.json({ error: "Commit failed" }, { status: 500 });
  }
}
