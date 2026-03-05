const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");

function run(command) {
  console.log(`[vercel-build] > ${command}`);
  execSync(command, { stdio: "inherit" });
}

const env = String(process.env.VERCEL_ENV || "").toLowerCase();
const migrateFlag = String(process.env.PRISMA_MIGRATE_ON_BUILD || "").toLowerCase().trim();
const shouldRunMigrations = migrateFlag === "1" || migrateFlag === "true";

if (shouldRunMigrations) {
  console.log("[vercel-build] Running prisma migrate deploy (PRISMA_MIGRATE_ON_BUILD enabled)...");
  run("pnpm prisma migrate deploy");
} else {
  console.log(
    `[vercel-build] Skipping prisma migrate deploy (VERCEL_ENV=${env || "unknown"}; set PRISMA_MIGRATE_ON_BUILD=1 to enable).`
  );
}

if (!existsSync("node_modules/.prisma/client")) {
  console.log("[vercel-build] Prisma client missing after install; generating client...");
  run("pnpm prisma generate");
} else {
  console.log("[vercel-build] Prisma client already present; skipping redundant generate.");
}

console.log("[vercel-build] Running application build...");
run("pnpm next build");
