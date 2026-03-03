import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { validateRuntimeEnvContract } from "@/lib/runtimeEnvContract";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

if (!process.env.DATABASE_URL) {
  loadEnvConfig(process.cwd());
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL. Set it in your environment or .env (e.g. postgresql://user:pass@host:5432/db).",
  );
}

validateRuntimeEnvContract();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export {};
