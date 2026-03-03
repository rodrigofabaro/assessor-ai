import { PrismaClient } from "@prisma/client";
import { validateRuntimeEnvContract } from "@/lib/runtimeEnvContract";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let prismaInstance: PrismaClient | null = globalForPrisma.prisma ?? null;

function resolveDatabaseUrl() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];
  for (const raw of candidates) {
    const clean = String(raw || "").trim();
    if (clean) return clean;
  }
  return "";
}

function getPrismaClient(): PrismaClient {
  if (prismaInstance) return prismaInstance;

  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      "Missing database connection URL. Set DATABASE_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL).",
    );
  }

  validateRuntimeEnvContract();

  prismaInstance = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaInstance;
  }

  return prismaInstance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
}) as PrismaClient;

export {};
