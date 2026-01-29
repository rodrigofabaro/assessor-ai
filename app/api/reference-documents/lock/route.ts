import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import type { ExtractDraft, SpecDraft, BriefDraft, GradeBand } from "@/lib/referenceParser";

function cleanCode(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}

function inferBand(acCode: string): GradeBand {
  const c = acCode.trim().toUpperCase();
  if (c.startsWith("P")) return "PASS";
  if (c.startsWith("M")) return "MERIT";
  return "DISTINCTION";
}

/**
 * Phase 2.2 "Lock" endpoint:
 * - Uses stored extractedJson (or a provided draft) and commits canonical Unit/LO/AC or Brief + mapping.
 * - Updates statuses on ReferenceDocument / Unit / AssignmentBrief.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const documentId = body?.documentId as string | undefined;
    const draftOverride = body?.draft as ExtractDraft | undefined;
    const overrideUnitId = body?.unitId as string | undefined; // for BRIEF imports
    const mappingOverride = body?.mappingOverride as string[] | undefined; // array of AC codes
    const assignmentCodeOverride = body?.assignmentCode as string | undefined;
    const lockedBy = body?.lockedBy as string | undefined;

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }

    const doc = await prisma.referenceDocument.findUnique({ where: { id: documentId } });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const draft: ExtractDraft | null = (draftOverride || (doc.extractedJson as any)) as any;
    if (!draft) {
      return NextResponse.json(
        { error: "No extracted draft found. Run Extract first." },
        { status: 400 }
      );
    }

    const now = new Date();

    if (draft.kind === "SPEC") {
      const spec = draft as SpecDraft;
      const unitCode = (spec.unit.unitCode || "").trim();
      const unitTitle = (spec.unit.unitTitle || doc.title || "").trim();
      if (!unitCode) {
        return NextResponse.json(
          { error: "Unit code is required for SPEC lock (e.g. 4017)." },
          { status: 400 }
        );
      }
      if (!unitTitle) {
        return NextResponse.json(
          { error: "Unit title is required for SPEC lock." },
          { status: 400 }
        );
      }

      // Find existing unit by code; if multiple exist, pick newest
      let unit = await prisma.unit.findFirst({
        where: { unitCode },
        orderBy: { createdAt: "desc" },
      });

      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            unitCode,
            unitTitle,
            status: "LOCKED" as any,
            specDocumentId: doc.type === "SPEC" ? doc.id : null,
            specIssue: (spec.unit as any)?.specIssue || (doc.sourceMeta as any)?.specIssue || null,
            specVersionLabel: (spec.unit as any)?.specVersionLabel || (doc.sourceMeta as any)?.specVersionLabel || null,
            lockedAt: now,
            lockedBy: lockedBy || null,
          },
        });
      } else {
        unit = await prisma.unit.update({
          where: { id: unit.id },
          data: {
            unitTitle,
            status: "LOCKED" as any,
            specDocumentId: doc.type === "SPEC" ? doc.id : unit.specDocumentId,
            lockedAt: unit.lockedAt || now,
            lockedBy: unit.lockedBy || lockedBy || null,
          },
        });
      }

      // Upsert LOs + ACs (canonical wording stays short; essentialContent holds long context)
      const created: { learningOutcomes: number; criteria: number } = {
        learningOutcomes: 0,
        criteria: 0,
      };

      for (const lo of spec.learningOutcomes || []) {
        const loCode = lo.loCode.trim().toUpperCase();
        if (!loCode) continue;

        const loRec = await prisma.learningOutcome.upsert({
          where: { unitId_loCode: { unitId: unit.id, loCode } },
          update: {
            description: lo.description || "",
            essentialContent: (lo as any).essentialContent || null,
          },
          create: {
            unitId: unit.id,
            loCode,
            description: lo.description || "",
            essentialContent: (lo as any).essentialContent || null,
          },
        });
        created.learningOutcomes += 1;

        for (const c of lo.criteria || []) {
          const acCode = cleanCode(c.acCode);
          if (!acCode) continue;
          const gradeBand: GradeBand = c.gradeBand || inferBand(acCode);

          await prisma.assessmentCriterion.upsert({
            where: {
              learningOutcomeId_acCode: {
                learningOutcomeId: loRec.id,
                acCode,
              },
            },
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

      const updatedDoc = await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: {
          status: "LOCKED" as any,
          lockedAt: now,
          lockedBy: lockedBy || null,
          extractedJson: draft as any,
        },
      });

      return NextResponse.json({ ok: true, kind: "SPEC", unitId: unit.id, created, document: updatedDoc });
    }

    if (draft.kind === "BRIEF") {
      const brief = draft as BriefDraft;
      const assignmentCode = (assignmentCodeOverride || brief.assignmentCode || "").trim().toUpperCase();
      if (!assignmentCode) {
        return NextResponse.json(
          { error: "Assignment code is required for BRIEF lock (e.g. A1)." },
          { status: 400 }
        );
      }

      // Determine unit
      let unit = null;
      if (overrideUnitId) unit = await prisma.unit.findUnique({ where: { id: overrideUnitId } });
if (!unit && brief.unitCodeGuess) {
  unit = await prisma.unit.findFirst({
    where: { unitCode: brief.unitCodeGuess, status: "LOCKED" as any },
    orderBy: { createdAt: "desc" },
  });
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

      // Upsert brief
      const briefRec = await prisma.assignmentBrief.upsert({
        where: { unitId_assignmentCode: { unitId: unit.id, assignmentCode } },
        update: {
          title,
          status: "LOCKED" as any,
          assignmentNumber: (brief as any).assignmentNumber ?? null,
          totalAssignments: (brief as any).totalAssignments ?? null,
          aiasLevel: (brief as any).aiasLevel ?? null,
          briefDocumentId: doc.type === "BRIEF" ? doc.id : null,
          lockedAt: now,
          lockedBy: lockedBy || null,
        },
        create: {
          unitId: unit.id,
          assignmentCode,
          title,
          status: "LOCKED" as any,
          assignmentNumber: (brief as any).assignmentNumber ?? null,
          totalAssignments: (brief as any).totalAssignments ?? null,
          aiasLevel: (brief as any).aiasLevel ?? null,
          briefDocumentId: doc.type === "BRIEF" ? doc.id : null,
          lockedAt: now,
          lockedBy: lockedBy || null,
        },
      });

      // Determine mapping codes
      const codesFromDraft = (brief.detectedCriterionCodes || []).map(cleanCode).filter(Boolean);
      const codes = (mappingOverride && mappingOverride.length ? mappingOverride : codesFromDraft)
        .map(cleanCode)
        .filter(Boolean);

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
          data: criteria.map((c) => ({
            assignmentBriefId: briefRec.id,
            assessmentCriterionId: c.id,
            source: mappingOverride?.length ? ("MANUAL_OVERRIDE" as any) : ("AUTO_FROM_BRIEF" as any),
            confidence: mappingOverride?.length ? 1 : 0.95,
          })),
          skipDuplicates: true,
        });
      }

      const updatedDoc = await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: {
          status: "LOCKED" as any,
          lockedAt: now,
          lockedBy: lockedBy || null,
          extractedJson: draft as any,
        },
      });

      return NextResponse.json({
        ok: true,
        kind: "BRIEF",
        briefId: briefRec.id,
        mapped: criteria.length,
        detected: codesFromDraft.length,
        usedCodes: codes,
        document: updatedDoc,
      });
    }

    return NextResponse.json({ error: "Unknown draft kind" }, { status: 400 });
  } catch (err) {
    console.error("REFERENCE_LOCK_ERROR:", err);
    return NextResponse.json({ error: "Lock failed" }, { status: 500 });
  }
}
