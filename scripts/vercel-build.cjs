const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");

function run(bin, args) {
  const command = `${bin} ${args.join(" ")}`.trim();
  console.log(`[vercel-build] > ${command}`);
  execSync(command, { stdio: "inherit", env: process.env });
}

const env = String(process.env.VERCEL_ENV || "").toLowerCase();
const migrateFlag = String(process.env.PRISMA_MIGRATE_ON_BUILD || "").toLowerCase().trim();
const skipMigrateFlag = String(process.env.PRISMA_SKIP_MIGRATE_ON_BUILD || "").toLowerCase().trim();
const hasDatabaseUrl = !!String(process.env.DATABASE_URL || "").trim();
const explicitEnable = migrateFlag === "1" || migrateFlag === "true";
const explicitSkip = skipMigrateFlag === "1" || skipMigrateFlag === "true";
const productionDefault = env === "production";
const shouldRunMigrations = hasDatabaseUrl && !explicitSkip && (explicitEnable || productionDefault);

if (!hasDatabaseUrl) {
  console.log("[vercel-build] Skipping prisma migrate deploy (DATABASE_URL is missing).");
} else if (explicitSkip) {
  console.log("[vercel-build] Skipping prisma migrate deploy (PRISMA_SKIP_MIGRATE_ON_BUILD enabled).");
} else if (shouldRunMigrations) {
  const reason = explicitEnable ? "PRISMA_MIGRATE_ON_BUILD enabled" : "default production behavior";
  console.log(`[vercel-build] Running prisma migrate deploy (${reason})...`);
  run("pnpm", ["prisma", "migrate", "deploy"]);
} else {
  console.log(
    `[vercel-build] Skipping prisma migrate deploy (VERCEL_ENV=${env || "unknown"}; set PRISMA_MIGRATE_ON_BUILD=1 to enable outside production).`
  );
}

if (!existsSync("node_modules/.prisma/client")) {
  console.log("[vercel-build] Prisma client missing after install; generating client...");
  run("pnpm", ["prisma", "generate"]);
} else {
  console.log("[vercel-build] Prisma client already present; skipping redundant generate.");
}

console.log("[vercel-build] Running application build...");
run("pnpm", ["next", "build"]);
