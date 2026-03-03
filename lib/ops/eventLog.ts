import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

type OpsEvent = {
  ts?: string;
  type: string;
  actor?: string | null;
  route?: string;
  status?: number | null;
  details?: Record<string, unknown>;
};

function resolveLogPath() {
  return path.join(process.cwd(), ".ops-events.jsonl");
}

export function appendOpsEvent(event: OpsEvent) {
  const payload = {
    ts: event.ts || new Date().toISOString(),
    type: String(event.type || "UNKNOWN"),
    actor: event.actor || null,
    route: event.route || null,
    status: Number.isFinite(Number(event.status)) ? Number(event.status) : null,
    details: event.details || {},
  };
  const legacyFileFallback = () =>
    fs.appendFile(resolveLogPath(), `${JSON.stringify(payload)}\n`, "utf8").catch(() => null);

  // Non-blocking telemetry write; fallback to file sink if DB model/query is unavailable.
  const dbModel = (prisma as any)?.opsRuntimeEvent;
  if (!dbModel || typeof dbModel.create !== "function") {
    void legacyFileFallback();
    return;
  }

  void dbModel
    .create({
      data: {
        ts: new Date(payload.ts),
        type: payload.type,
        actor: payload.actor,
        route: payload.route,
        status: payload.status,
        details: payload.details,
      },
    })
    .catch(() => legacyFileFallback());
}
