const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const unitCode = String(process.argv[2] || "4017").trim();
  const assignmentRef = String(process.argv[3] || "A1").trim().toUpperCase();

  if (!unitCode || !assignmentRef) {
    throw new Error("Usage: node scripts/bootstrap-grade-baseline.cjs <unitCode> <assignmentRef>");
  }

  let assignment = await prisma.assignment.findFirst({
    where: { unitCode, assignmentRef },
    orderBy: { updatedAt: "desc" },
  });
  if (!assignment) {
    assignment = await prisma.assignment.create({
      data: {
        unitCode,
        assignmentRef,
        title: `${unitCode} ${assignmentRef} Baseline`,
      },
    });
  }

  let unit = await prisma.unit.findFirst({
    where: { unitCode },
    orderBy: { updatedAt: "desc" },
  });
  if (!unit) {
    unit = await prisma.unit.create({
      data: {
        unitCode,
        unitTitle: `Unit ${unitCode}`,
        status: "LOCKED",
        lockedAt: new Date(),
      },
    });
  } else if (!unit.lockedAt || unit.status !== "LOCKED") {
    unit = await prisma.unit.update({
      where: { id: unit.id },
      data: { status: "LOCKED", lockedAt: unit.lockedAt || new Date() },
    });
  }

  const lo = await prisma.learningOutcome.upsert({
    where: { unitId_loCode: { unitId: unit.id, loCode: "LO1" } },
    update: {},
    create: {
      unitId: unit.id,
      loCode: "LO1",
      description: "Baseline LO for reproducible local grading checks.",
    },
  });

  const criterion = await prisma.assessmentCriterion.upsert({
    where: { learningOutcomeId_acCode: { learningOutcomeId: lo.id, acCode: "P1" } },
    update: {},
    create: {
      learningOutcomeId: lo.id,
      acCode: "P1",
      gradeBand: "PASS",
      description: "Baseline PASS criterion for local grading checks.",
    },
  });

  const brief = await prisma.assignmentBrief.upsert({
    where: { unitId_assignmentCode: { unitId: unit.id, assignmentCode: assignmentRef } },
    update: {
      title: assignment.title || `${unitCode} ${assignmentRef}`,
      status: "LOCKED",
      lockedAt: new Date(),
    },
    create: {
      unitId: unit.id,
      assignmentCode: assignmentRef,
      title: assignment.title || `${unitCode} ${assignmentRef}`,
      status: "LOCKED",
      lockedAt: new Date(),
    },
  });

  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { assignmentBriefId: brief.id },
  });

  await prisma.assignmentCriterionMap.upsert({
    where: {
      assignmentBriefId_assessmentCriterionId: {
        assignmentBriefId: brief.id,
        assessmentCriterionId: criterion.id,
      },
    },
    update: { source: "MANUAL_OVERRIDE", confidence: 1 },
    create: {
      assignmentBriefId: brief.id,
      assessmentCriterionId: criterion.id,
      source: "MANUAL_OVERRIDE",
      confidence: 1,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        assignment: { id: assignment.id, unitCode, assignmentRef },
        unit: { id: unit.id, lockedAt: unit.lockedAt || null },
        brief: { id: brief.id, lockedAt: brief.lockedAt || null },
        criterion: { id: criterion.id, code: criterion.acCode },
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error("BOOTSTRAP_GRADE_BASELINE_FAILED", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
