const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const uploadDirRel = "reference_uploads";
const uploadDirAbs = path.join(process.cwd(), uploadDirRel);

const IDS = {
  specNormal: "11111111-1111-1111-1111-111111111111",
  specMissing: "22222222-2222-2222-2222-222222222222",
  specLocked: "33333333-3333-3333-3333-333333333333",
  specArchived: "44444444-4444-4444-4444-444444444444",
  unitNormal: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  unitMissing: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  unitLocked: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  unitArchived: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  loNormal: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  loMissing: "ffffffff-ffff-ffff-ffff-ffffffffffff",
  loLocked: "11111111-2222-3333-4444-555555555555",
  loArchived: "66666666-7777-8888-9999-000000000000",
  critNormal: "99999999-aaaa-bbbb-cccc-dddddddddddd",
  critMissing: "12121212-3434-5656-7878-909090909090",
  critLocked: "abababab-cdcd-efef-0101-121212121212",
  critArchived: "13131313-1414-1515-1616-171717171717",
  assignmentA1: "b5d2f983-32f5-4a13-9e55-aaaabbbbcccc",
  assignmentA2: "d2c6e9ef-9e4f-4ef8-9f66-ccccddddeeee",
};

function ensureUploadDir() {
  if (!fs.existsSync(uploadDirAbs)) {
    fs.mkdirSync(uploadDirAbs, { recursive: true });
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function writeFixtureFile(slug, content) {
  ensureUploadDir();
  const storedFilename = `${slug}.pdf`;
  const storagePath = path.join(uploadDirRel, storedFilename);
  const absPath = path.join(process.cwd(), storagePath);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  fs.writeFileSync(absPath, buffer);
  return {
    storedFilename,
    storagePath,
    checksumSha256: sha256(buffer),
    originalFilename: `${slug}.pdf`,
  };
}

function buildExtracted(unitCode, unitTitle) {
  return {
    kind: "SPEC",
    parserVersion: "seed-v1",
    unit: {
      unitCode,
      unitTitle,
      specIssue: "Issue 1",
    },
    learningOutcomes: [
      {
        loCode: "LO1",
        description: "Seeded learning outcome.",
        criteria: [
          {
            acCode: "P1",
            gradeBand: "PASS",
            description: "Seeded criterion.",
          },
        ],
      },
    ],
    detectedCriterionCodes: ["P1"],
  };
}

async function upsertReferenceDoc({
  id,
  title,
  status,
  unitCode,
  archive,
  missingFile,
  locked,
}) {
  const fileInfo = missingFile
    ? {
        storedFilename: "missing-file.pdf",
        storagePath: path.join(uploadDirRel, "missing-file.pdf"),
        checksumSha256: sha256(Buffer.from("missing-file")),
        originalFilename: "missing-file.pdf",
      }
    : writeFixtureFile(
        `seed-${unitCode}`,
        `%PDF-1.4\n% Seed fixture for ${unitCode}\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<<>>\nstartxref\n0\n%%EOF\n`
      );

  await prisma.referenceDocument.upsert({
    where: { id },
    update: {
      status,
      title,
      storagePath: fileInfo.storagePath,
      storedFilename: fileInfo.storedFilename,
      originalFilename: fileInfo.originalFilename,
      checksumSha256: fileInfo.checksumSha256,
      extractedJson: missingFile ? null : buildExtracted(unitCode, title),
      extractionWarnings: missingFile ? ["File not found in seed fixture."] : [],
      sourceMeta: archive ? { archived: true, unitCode } : { unitCode },
      lockedAt: locked ? new Date() : null,
    },
    create: {
      id,
      type: "SPEC",
      status,
      title,
      version: 1,
      originalFilename: fileInfo.originalFilename,
      storedFilename: fileInfo.storedFilename,
      storagePath: fileInfo.storagePath,
      checksumSha256: fileInfo.checksumSha256,
      extractedJson: missingFile ? null : buildExtracted(unitCode, title),
      extractionWarnings: missingFile ? ["File not found in seed fixture."] : [],
      sourceMeta: archive ? { archived: true, unitCode } : { unitCode },
      lockedAt: locked ? new Date() : null,
    },
  });
}

async function upsertUnit({ id, unitCode, unitTitle, status, specDocumentId, locked, archived, loId, critId }) {
  await prisma.unit.upsert({
    where: { id },
    update: {
      unitCode,
      unitTitle,
      status,
      specIssue: "Issue 1",
      specVersionLabel: "Issue 1",
      specDocumentId,
      lockedAt: locked ? new Date() : null,
      sourceMeta: archived ? { archived: true } : null,
    },
    create: {
      id,
      unitCode,
      unitTitle,
      status,
      specIssue: "Issue 1",
      specVersionLabel: "Issue 1",
      specDocumentId,
      lockedAt: locked ? new Date() : null,
      sourceMeta: archived ? { archived: true } : null,
    },
  });

  await prisma.learningOutcome.upsert({
    where: { unitId_loCode: { unitId: id, loCode: "LO1" } },
    update: {
      description: "Seeded learning outcome.",
      essentialContent: null,
    },
    create: {
      id: loId,
      loCode: "LO1",
      description: "Seeded learning outcome.",
      unitId: id,
    },
  });

  await prisma.assessmentCriterion.upsert({
    where: { learningOutcomeId_acCode: { learningOutcomeId: loId, acCode: "P1" } },
    update: {
      gradeBand: "PASS",
      description: "Seeded criterion.",
    },
    create: {
      id: critId,
      acCode: "P1",
      gradeBand: "PASS",
      description: "Seeded criterion.",
      learningOutcomeId: loId,
    },
  });
}

async function main() {
  await prisma.student.upsert({
    where: { externalRef: "TS001" },
    update: { fullName: "Test Student 1", email: "ts001@example.com" },
    create: {
      fullName: "Test Student 1",
      externalRef: "TS001",
      email: "ts001@example.com",
      courseName: "HNC Engineering",
      registrationDate: new Date("2024-09-01"),
    },
  });

  await prisma.student.upsert({
    where: { externalRef: "TS002" },
    update: { fullName: "Test Student 2", email: "ts002@example.com" },
    create: {
      fullName: "Test Student 2",
      externalRef: "TS002",
      email: "ts002@example.com",
      courseName: "HNC Engineering",
      registrationDate: new Date("2024-09-01"),
    },
  });

  await prisma.assignment.upsert({
    where: { id: IDS.assignmentA1 },
    update: {
      unitCode: "4017",
      title: "Quality Control Tools and Costing",
      assignmentRef: "A1",
    },
    create: {
      id: IDS.assignmentA1,
      unitCode: "4017",
      title: "Quality Control Tools and Costing",
      assignmentRef: "A1",
    },
  });

  await prisma.assignment.upsert({
    where: { id: IDS.assignmentA2 },
    update: {
      unitCode: "4017",
      title: "Industry Standards and Total Quality Management",
      assignmentRef: "A2",
    },
    create: {
      id: IDS.assignmentA2,
      unitCode: "4017",
      title: "Industry Standards and Total Quality Management",
      assignmentRef: "A2",
    },
  });

  await upsertReferenceDoc({
    id: IDS.specNormal,
    title: "Unit 4017 Spec (Seeded)",
    status: "EXTRACTED",
    unitCode: "4017",
    archive: false,
    missingFile: false,
    locked: false,
  });

  await upsertReferenceDoc({
    id: IDS.specMissing,
    title: "Unit 4018 Spec (Missing File)",
    status: "FAILED",
    unitCode: "4018",
    archive: false,
    missingFile: true,
    locked: false,
  });

  await upsertReferenceDoc({
    id: IDS.specLocked,
    title: "Unit 4019 Spec (Locked)",
    status: "LOCKED",
    unitCode: "4019",
    archive: false,
    missingFile: false,
    locked: true,
  });

  await upsertReferenceDoc({
    id: IDS.specArchived,
    title: "Unit 4020 Spec (Archived)",
    status: "EXTRACTED",
    unitCode: "4020",
    archive: true,
    missingFile: false,
    locked: false,
  });

  await upsertUnit({
    id: IDS.unitNormal,
    unitCode: "4017",
    unitTitle: "Quality Control Tools and Costing",
    status: "DRAFT",
    specDocumentId: IDS.specNormal,
    locked: false,
    archived: false,
    loId: IDS.loNormal,
    critId: IDS.critNormal,
  });

  await upsertUnit({
    id: IDS.unitMissing,
    unitCode: "4018",
    unitTitle: "Missing File Unit",
    status: "DRAFT",
    specDocumentId: IDS.specMissing,
    locked: false,
    archived: false,
    loId: IDS.loMissing,
    critId: IDS.critMissing,
  });

  await upsertUnit({
    id: IDS.unitLocked,
    unitCode: "4019",
    unitTitle: "Locked Spec Unit",
    status: "LOCKED",
    specDocumentId: IDS.specLocked,
    locked: true,
    archived: false,
    loId: IDS.loLocked,
    critId: IDS.critLocked,
  });

  await upsertUnit({
    id: IDS.unitArchived,
    unitCode: "4020",
    unitTitle: "Archived Spec Unit",
    status: "DRAFT",
    specDocumentId: IDS.specArchived,
    locked: false,
    archived: true,
    loId: IDS.loArchived,
    critId: IDS.critArchived,
  });

  console.log("Seed complete");
  console.log({
    studentCount: await prisma.student.count(),
    assignmentCount: await prisma.assignment.count(),
    referenceCount: await prisma.referenceDocument.count(),
    unitCount: await prisma.unit.count(),
  });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
