const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");

function run(command) {
  console.log(`[vercel-build] > ${command}`);
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

if (!existsSync("node_modules/.prisma/client")) {
  console.log("[vercel-build] Prisma client missing after install; generating client...");
  run("pnpm prisma generate");
} else {
  console.log("[vercel-build] Prisma client already present; skipping redundant generate.");
}

console.log("[vercel-build] Running application build...");
run("pnpm next build");
