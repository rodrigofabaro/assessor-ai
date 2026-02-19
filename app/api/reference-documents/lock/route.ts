import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateBriefLockQuality } from "@/lib/briefs/lockQualityGate";
import { selectBriefMappingCodes } from "@/lib/briefs/mappingCodes";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

import type { ExtractDraft, SpecDraft, BriefDraft, GradeBand } from "@/lib/referenceParser";

function cleanCode(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}

function deriveBriefGateText(brief: BriefDraft) {
  const raw = String((brief as any)?.rawText || "").trim();
  if (raw) return raw;
  const chunks: string[] = [];
  const title = String((brief as any)?.title || "").trim();
  if (title) chunks.push(title);
  const header = (brief as any)?.header || {};
  for (const key of [
    "unitNumberAndTitle",
    "assignmentTitle",
    "qualification",
    "assessor",
    "internalVerifier",
    "academicYear",
  ]) {
    const value = String(header?.[key] || "").trim();
    if (value) chunks.push(value);
  }
  const scenarios = Array.isArray((brief as any)?.scenarios) ? (brief as any).scenarios : [];
  for (const s of scenarios) {
    const text = String(s?.text || "").trim();
    if (text) chunks.push(text);
  }
  const tasks = Array.isArray((brief as any)?.tasks) ? (brief as any).tasks : [];
  for (const task of tasks) {
    const text = String(task?.text || "").trim();
    if (text) chunks.push(text);
    const parts = Array.isArray(task?.parts) ? task.parts : [];
    for (const part of parts) {
      const pText = String(part?.text || "").trim();
      if (pText) chunks.push(pText);
    }
  }
  return chunks.join("\n\n").trim();
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
    const perm = await isAdminMutationAllowed();
    if (!perm.ok) {
      return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: perm.reason }, { status: 403 });
    }
    const body = await req.json();
    const documentId = body?.documentId as string | undefined;
    const draftOverride = body?.draft as ExtractDraft | undefined;
    const overrideUnitId = body?.unitId as string | undefined; // for BRIEF imports
    const mappingOverride = body?.mappingOverride as string[] | undefined; // array of AC codes
    const assignmentCodeOverride = body?.assignmentCode as string | undefined;
    const allowOverwrite = body?.allowOverwrite as boolean | undefined;
    const allowQualityGateBypass = body?.allowQualityGateBypass as boolean | undefined;
    const reviewConfirmed = body?.reviewConfirmed as boolean | undefined;
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
            specIssue: (spec.unit as any)?.specIssue || (doc.sourceMeta as any)?.specIssue || unit.specIssue || null,
            specVersionLabel:
              (spec.unit as any)?.specVersionLabel ||
              (doc.sourceMeta as any)?.specVersionLabel ||
              unit.specVersionLabel ||
              null,
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
      const requireReviewConfirm = ["1", "true", "yes", "on"].includes(
        String(process.env.REQUIRE_BRIEF_REVIEW_CONFIRM || "false").toLowerCase()
      );
      if (requireReviewConfirm && !reviewConfirmed) {
        return NextResponse.json(
          {
            error: "BRIEF_REVIEW_CONFIRM_REQUIRED",
            message: "Review confirmation is required before locking this brief.",
          },
          { status: 422 }
        );
      }
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
          where: { unitCode: brief.unitCodeGuess },
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
      const selectedCodes = (mappingOverride && mappingOverride.length ? mappingOverride : pickedCodes.selectedCodes)
        .map(cleanCode)
        .filter(Boolean);
      const qualityGate = evaluateBriefLockQuality({
        assignmentCode,
        title,
        hasUnitSignal: Boolean(overrideUnitId || brief.unitCodeGuess),
        selectedCodes,
        rawText: deriveBriefGateText(brief),
        unitCriteria: mappedUnitCriteria,
      });
      if (!qualityGate.ok && !allowQualityGateBypass) {
        appendOpsEvent({
          type: "BRIEF_LOCK_BLOCKED_QUALITY_GATE",
          actor: lockedBy || null,
          route: "/api/reference-documents/lock",
          status: 422,
          details: {
            documentId: doc.id,
            assignmentCode,
            blockers: qualityGate.blockers,
            warnings: qualityGate.warnings,
            metrics: qualityGate.metrics,
          },
        });
        return NextResponse.json(
          {
            error: "BRIEF_EXTRACTION_QUALITY_GATE_FAILED",
            message: "Brief extraction quality gate failed. Fix extraction/mapping before lock.",
            blockers: qualityGate.blockers,
            warnings: qualityGate.warnings,
            metrics: qualityGate.metrics,
            suggestion: "Re-extract the brief, then verify criteria mapping (or retry with allowQualityGateBypass=true after manual review).",
          },
          { status: 422 }
        );
      }

      // Prevent accidental duplicates: if there's already a LOCKED brief for this Unit+AssignmentCode,
      // require an explicit overwrite flag.
      const existing = await prisma.assignmentBrief.findUnique({
        where: { unitId_assignmentCode: { unitId: unit.id, assignmentCode } },
        select: { id: true, status: true, briefDocumentId: true, title: true },
      });

      if (
        existing &&
        existing.status === ("LOCKED" as any) &&
        existing.briefDocumentId &&
        existing.briefDocumentId !== doc.id &&
        !allowOverwrite
      ) {
        return NextResponse.json(
          {
            error: "BRIEF_ALREADY_LOCKED",
            message:
              `A ${assignmentCode} brief is already LOCKED for this unit. ` +
              `If you really want to replace it, pass allowOverwrite: true.`,
            existingBriefId: existing.id,
            existingTitle: existing.title,
          },
          { status: 409 }
        );
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
      const codes = (mappingOverride && mappingOverride.length ? mappingOverride : pickedCodes.selectedCodes)
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
          sourceMeta: {
            ...((doc.sourceMeta && typeof doc.sourceMeta === "object" ? doc.sourceMeta : {}) as any),
            reviewApproval: {
              confirmed: !!reviewConfirmed,
              confirmedAt: now.toISOString(),
              confirmedBy: lockedBy || null,
            },
          },
          extractedJson: draft as any,
        },
      });

      appendOpsEvent({
        type: "BRIEF_LOCKED",
        actor: lockedBy || null,
        route: "/api/reference-documents/lock",
        status: 200,
        details: {
          documentId: doc.id,
          briefId: briefRec.id,
          assignmentCode,
          mappedCount: criteria.length,
          qualityGate,
          allowOverwrite: !!allowOverwrite,
          allowQualityGateBypass: !!allowQualityGateBypass,
        },
      });

      return NextResponse.json({
        ok: true,
        kind: "BRIEF",
        briefId: briefRec.id,
        mapped: criteria.length,
        detected: pickedCodes.baseCodes.length,
        usedCodes: codes,
        qualityGate,
        document: updatedDoc,
      });
    }

    return NextResponse.json({ error: "Unknown draft kind" }, { status: 400 });
  } catch (err) {
    console.error("REFERENCE_LOCK_ERROR:", err);
    return NextResponse.json({ error: "Lock failed" }, { status: 500 });
  }
}
