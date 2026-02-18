import { promises as fs } from "node:fs";
import path from "node:path";

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
  // Non-blocking telemetry write; failures are intentionally ignored.
  void fs.appendFile(resolveLogPath(), `${JSON.stringify(payload)}\n`, "utf8").catch(() => null);
}
