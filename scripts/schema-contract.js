#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function hasDatabaseUrl() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];
  return candidates.some((v) => String(v || "").trim().length > 0);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1
    `,
    tableName
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function columnExists(prisma, tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    tableName,
    columnName
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  const requireSchemaContract = isTruthy(process.env.AUTH_REQUIRE_SCHEMA_CONTRACT);
  if (!hasDatabaseUrl()) {
    if (requireSchemaContract) {
      fail("schema contract failed: no DATABASE_URL available.");
    }
    console.log("schema contract warning: DATABASE_URL not set; check skipped.");
    process.exit(0);
  }

  const prisma = new PrismaClient({
    log: ["error"],
  });

  const requiredTables = [
    "Organization",
    "OrganizationMembership",
    "OrganizationSetting",
    "OrganizationSecret",
    "AppUser",
    "ReferenceDocument",
    "Unit",
    "PasswordResetToken",
    "ContactLead",
    "OutboundEmailEvent",
    "EmailProviderEvent",
    "TurnitinSubmissionSyncState",
  ];

  const requiredColumns = [
    ["AppUser", "organizationId"],
    ["AppUser", "platformRole"],
    ["ReferenceDocument", "organizationId"],
    ["Unit", "organizationId"],
    ["AppConfig", "turnitinConfig"],
    ["AppConfig", "automationPolicy"],
  ];

  const missingTables = [];
  const missingColumns = [];

  try {
    await prisma.$connect();

    for (const table of requiredTables) {
      const exists = await tableExists(prisma, table);
      if (!exists) missingTables.push(table);
    }

    for (const [table, column] of requiredColumns) {
      const exists = await columnExists(prisma, table, column);
      if (!exists) missingColumns.push(`${table}.${column}`);
    }
  } catch (error) {
    const message = String(error?.message || error || "unknown error");
    if (requireSchemaContract) {
      fail(`schema contract failed: unable to query schema (${message}).`);
    }
    console.log(`schema contract warning: unable to query schema (${message}).`);
    process.exit(0);
  } finally {
    await prisma.$disconnect().catch(() => null);
  }

  if (missingTables.length || missingColumns.length) {
    const chunks = [];
    if (missingTables.length) chunks.push(`missing tables: ${missingTables.join(", ")}`);
    if (missingColumns.length) chunks.push(`missing columns: ${missingColumns.join(", ")}`);
    fail(`schema contract failed: ${chunks.join(" | ")}.`);
  }

  console.log("schema contract passed.");
}

main().catch((error) => {
  fail(`schema contract crashed: ${String(error?.message || error)}`);
});
