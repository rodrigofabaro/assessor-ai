const { execSync } = require("node:child_process");

function run(command) {
  execSync(command, { stdio: "inherit" });
}

const env = String(process.env.VERCEL_ENV || "").toLowerCase();
const migrateFlag = String(process.env.PRISMA_MIGRATE_ON_BUILD || "");
const shouldRunMigrations = env === "production" || migrateFlag === "1";

if (shouldRunMigrations) {
  console.log("[vercel-build] Running prisma migrate deploy...");
  run("pnpm prisma migrate deploy");
} else {
  console.log("[vercel-build] Skipping prisma migrate deploy for non-production build.");
}

console.log("[vercel-build] Running application build...");
run("pnpm run build");
