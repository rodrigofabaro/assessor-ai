import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeBriefDraftArtifacts } from "@/lib/extraction/brief/draftIntegrity";
import {
  applyGradingScopeChangeMeta,
  validateGradingScopeChangeRequest,
} from "@/lib/briefs/gradingScopeChange";
import type { GradingScopeChangeValidation } from "@/lib/briefs/gradingScopeChange";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

function asObject(x: any) {
  if (x && typeof x === "object" && !Array.isArray(x)) return x;
  return {};
}

function cleanTextValue(input: string) {
  const lines = String(input || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const kept = lines.filter((line) => {
    const s = String(line || "").trim();
    if (!s) return true;
    if (/tmp-screens/i.test(s)) return false;
    if (/^screenshot:\s*/i.test(s)) return false;
    return true;
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

function sanitizeArtifacts(value: any): any {
  if (typeof value === "string") return cleanTextValue(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeArtifacts(v));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeArtifacts(v);
    return out;
  }
  return value;
}

export async function GET(_req: Request, { params }: { params: { documentId: string } }) {
  const id = params.documentId;
  const doc = await prisma.referenceDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: doc.id, sourceMeta: doc.sourceMeta ?? {} });
}

export async function PATCH(req: Request, { params }: { params: { documentId: string } }) {
  const id = params.documentId;
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await prisma.referenceDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prev = asObject(existing.sourceMeta);
  const incoming = asObject(body);
  const hasGradingScopePatch = Object.prototype.hasOwnProperty.call(incoming, "gradingCriteriaExclusions");
  const route = "/api/reference-documents/[documentId]/meta";
  let scopeChangeAudit: Record<string, unknown> | null = null;
  if (hasGradingScopePatch) {
    if (String(existing.type || "").toUpperCase() !== "BRIEF") {
      return NextResponse.json(
        {
          error: "BRIEF_CRITERIA_SCOPE_CHANGE_UNSUPPORTED",
          message: "Grading criteria scope changes are supported only for BRIEF documents.",
        },
        { status: 400 }
      );
    }

    const validation = validateGradingScopeChangeRequest(
      prev?.gradingCriteriaExclusions,
      incoming?.gradingCriteriaExclusions,
      asObject(incoming?.gradingCriteriaScopeChange)
    );
    if (!validation.ok) {
      const failure = validation as Extract<GradingScopeChangeValidation, { ok: false }>;
      return NextResponse.json(
        {
          error: failure.error,
          message: failure.message,
          details: failure.details || {},
        },
        { status: 422 }
      );
    }

    const linkedBriefs = await prisma.assignmentBrief.findMany({
      where: { briefDocumentId: existing.id },
      select: { id: true },
    });
    const linkedBriefIds = linkedBriefs.map((b) => b.id);
    let gradedSubmissionCount = 0;
    if (linkedBriefIds.length) {
      gradedSubmissionCount = await prisma.submission.count({
        where: {
          assignment: { assignmentBriefId: { in: linkedBriefIds } },
          assessments: { some: {} },
        },
      });
    }

    if (gradedSubmissionCount > 0) {
      if (!validation.confirmLiveChange) {
        return NextResponse.json(
          {
            error: "BRIEF_CRITERIA_SCOPE_CHANGE_CONFIRM_REQUIRED",
            message:
              "This brief already has graded submissions. Confirm again to apply grading scope changes.",
            details: {
              gradedSubmissionCount,
              linkedBriefCount: linkedBriefIds.length,
              criterionCode: validation.criterionCode,
              excluded: validation.excluded,
            },
          },
          { status: 409 }
        );
      }
      const perm = await isAdminMutationAllowed();
      if (!perm.ok) {
        return NextResponse.json(
          {
            error: "ADMIN_PERMISSION_REQUIRED",
            message: perm.reason || "Admin permission required for live grading scope changes.",
            details: {
              gradedSubmissionCount,
              linkedBriefCount: linkedBriefIds.length,
            },
          },
          { status: 403 }
        );
      }
    }

    const actor = await getCurrentAuditActor();
    const metaPatch = applyGradingScopeChangeMeta({
      previousMeta: prev,
      change: {
        criterionCode: validation.criterionCode,
        excluded: validation.excluded,
        reason: validation.reason,
      },
      actor,
      gradedSubmissionCount,
    });
    incoming.gradingCriteriaExclusions = validation.nextExcluded;
    incoming.gradingCriteriaExclusionReasons = metaPatch.gradingCriteriaExclusionReasons;
    incoming.gradingCriteriaExclusionLog = metaPatch.gradingCriteriaExclusionLog;
    delete incoming.gradingCriteriaScopeChange;

    scopeChangeAudit = {
      documentId: existing.id,
      criterionCode: validation.criterionCode,
      excluded: validation.excluded,
      reason: validation.reason,
      actor,
      gradedSubmissionCount,
      linkedBriefCount: linkedBriefIds.length,
      previousExcluded: validation.previousExcluded,
      nextExcluded: validation.nextExcluded,
    };
  } else if (Object.prototype.hasOwnProperty.call(incoming, "gradingCriteriaScopeChange")) {
    delete incoming.gradingCriteriaScopeChange;
  }

  const next = sanitizeArtifacts({ ...prev, ...incoming }) as any;
  if (next?.manualDraft) {
    next.manualDraft = sanitizeBriefDraftArtifacts(next.manualDraft);
  }

  const updated = await prisma.referenceDocument.update({
    where: { id },
    data: { sourceMeta: next as any },
  });

  if (scopeChangeAudit) {
    appendOpsEvent({
      type: "BRIEF_CRITERIA_SCOPE_CHANGED",
      actor: String(scopeChangeAudit.actor || "system"),
      route,
      status: 200,
      details: scopeChangeAudit,
    });
  }

  return NextResponse.json({ id: updated.id, sourceMeta: updated.sourceMeta ?? {} });
}
