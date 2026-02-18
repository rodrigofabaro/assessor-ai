import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type SettingsAuditEvent = {
  id: string;
  ts: string;
  actor: string;
  role: string;
  action: string;
  target: "openai-model" | "grading-config" | "app-config" | "favicon";
  changes?: Record<string, unknown>;
};

const FILE_PATH = path.join(process.cwd(), ".settings-audit.json");

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

export function appendSettingsAuditEvent(input: Omit<SettingsAuditEvent, "id" | "ts">) {
  const events = readAll();
  const event: SettingsAuditEvent = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    ...input,
  };
  const next = [event, ...events].slice(0, 300);
  writeAll(next);
  return event;
}

export function listSettingsAuditEvents(take = 40) {
  const all = readAll();
  const n = Number.isFinite(take) ? Math.max(1, Math.min(200, Math.floor(take))) : 40;
  return all.slice(0, n);
}
