import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type SettingsAuditEvent = {
  id: string;
  ts: string;
  actor: string;
  role: string;
  action: string;
  target:
    | "openai-model"
    | "grading-config"
    | "app-config"
    | "favicon"
    | "automation-policy"
    | "turnitin-config";
  changes?: Record<string, unknown>;
};

const FILE_PATH = path.join(process.cwd(), ".settings-audit.json");
const FALLBACK_MAX_EVENTS = 300;

function readAll(): SettingsAuditEvent[] {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SettingsAuditEvent[]) : [];
  } catch {
    return [];
  }
}

function writeAll(events: SettingsAuditEvent[]) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(events, null, 2), "utf8");
}

function appendFallbackEvent(event: SettingsAuditEvent) {
  const events = readAll();
  const next = [event, ...events].slice(0, FALLBACK_MAX_EVENTS);
  writeAll(next);
}

export function appendSettingsAuditEvent(input: Omit<SettingsAuditEvent, "id" | "ts">) {
  const event: SettingsAuditEvent = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    ...input,
  };

  // DB primary + file fallback for migration safety.
  const dbModel = (prisma as any)?.adminSettingsAuditEvent;
  if (!dbModel || typeof dbModel.create !== "function") {
    appendFallbackEvent(event);
    return event;
  }

  void dbModel
    .create({
      data: {
        ts: new Date(event.ts),
        actor: event.actor,
        role: event.role,
        action: event.action,
        target: event.target,
        changes: (event.changes || null) as Prisma.InputJsonValue | null,
      },
    })
    .catch(() => appendFallbackEvent(event));

  return event;
}

export async function listSettingsAuditEvents(take = 40) {
  const n = Number.isFinite(take) ? Math.max(1, Math.min(200, Math.floor(take))) : 40;

  try {
    const dbModel = (prisma as any)?.adminSettingsAuditEvent;
    if (dbModel && typeof dbModel.findMany === "function") {
      const rows = await dbModel.findMany({
        orderBy: { ts: "desc" },
        take: n,
        select: {
          id: true,
          ts: true,
          actor: true,
          role: true,
          action: true,
          target: true,
          changes: true,
        },
      });
      if (Array.isArray(rows) && rows.length) {
        return rows.map((row: any) => ({
          id: String(row.id || ""),
          ts: row.ts instanceof Date ? row.ts.toISOString() : new Date(row.ts).toISOString(),
          actor: String(row.actor || ""),
          role: String(row.role || ""),
          action: String(row.action || ""),
          target: String(row.target || "app-config") as SettingsAuditEvent["target"],
          changes: row.changes && typeof row.changes === "object" ? (row.changes as Record<string, unknown>) : undefined,
        }));
      }
    }
  } catch {
    // fallback below
  }

  const all = readAll();
  return all.slice(0, n);
}
