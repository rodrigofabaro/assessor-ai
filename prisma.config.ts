// prisma.config.ts
// Keep this file loadable by tools like Knip.
// Prisma CLI already reads .env automatically.

const DATABASE_URL = process.env.DATABASE_URL ?? "";

export default {
  schema: "prisma/schema.prisma",
  seed: "node prisma/seed.cjs",
  migrations: { path: "prisma/migrations" },
  engine: "classic",
  datasource: { url: DATABASE_URL },
};
