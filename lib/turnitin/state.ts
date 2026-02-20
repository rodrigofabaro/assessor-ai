import fs from "node:fs";
import path from "node:path";

export type TurnitinSubmissionStatus =
  | "NOT_SENT"
  | "CREATED"
  | "UPLOADING"
  | "PROCESSING"
  | "COMPLETE"
  | "FAILED";

export type TurnitinSubmissionState = {
  submissionId: string;
  turnitinSubmissionId: string | null;
  status: TurnitinSubmissionStatus;
  overallMatchPercentage: number | null;
  internetMatchPercentage: number | null;
  publicationMatchPercentage: number | null;
  submittedWorksMatchPercentage: number | null;
  reportRequestedAt: string | null;
  reportGeneratedAt: string | null;
  viewerUrl: string | null;
  lastError: string | null;
  updatedAt: string;
};

const FILE_PATH = path.join(process.cwd(), ".turnitin-submission-state.json");

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(value: unknown): TurnitinSubmissionStatus {
  const v = String(value || "").trim().toUpperCase();
  if (v === "CREATED" || v === "UPLOADING" || v === "PROCESSING" || v === "COMPLETE" || v === "FAILED") {
    return v;
  }
  return "NOT_SENT";
}

function makeDefault(submissionId: string): TurnitinSubmissionState {
  return {
    submissionId,
    turnitinSubmissionId: null,
    status: "NOT_SENT",
    overallMatchPercentage: null,
    internetMatchPercentage: null,
    publicationMatchPercentage: null,
    submittedWorksMatchPercentage: null,
    reportRequestedAt: null,
    reportGeneratedAt: null,
    viewerUrl: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeOne(submissionId: string, value: Partial<TurnitinSubmissionState>): TurnitinSubmissionState {
  const base = makeDefault(submissionId);
  return {
    ...base,
    ...value,
    submissionId,
    turnitinSubmissionId: String(value.turnitinSubmissionId || "").trim() || null,
    status: normalizeStatus(value.status),
    overallMatchPercentage: toFiniteNumber(value.overallMatchPercentage),
    internetMatchPercentage: toFiniteNumber(value.internetMatchPercentage),
    publicationMatchPercentage: toFiniteNumber(value.publicationMatchPercentage),
    submittedWorksMatchPercentage: toFiniteNumber(value.submittedWorksMatchPercentage),
    reportRequestedAt: String(value.reportRequestedAt || "").trim() || null,
    reportGeneratedAt: String(value.reportGeneratedAt || "").trim() || null,
    viewerUrl: String(value.viewerUrl || "").trim() || null,
    lastError: String(value.lastError || "").trim() || null,
    updatedAt: new Date().toISOString(),
  };
}

export function readTurnitinSubmissionStateMap(): Record<string, TurnitinSubmissionState> {
  try {
    if (!fs.existsSync(FILE_PATH)) return {};
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Partial<TurnitinSubmissionState>>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, TurnitinSubmissionState> = {};
    for (const [submissionId, value] of Object.entries(parsed)) {
      out[submissionId] = normalizeOne(submissionId, value || {});
    }
    return out;
  } catch {
    return {};
  }
}

function writeTurnitinSubmissionStateMap(next: Record<string, TurnitinSubmissionState>) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(next, null, 2), "utf8");
}

export function getTurnitinSubmissionState(submissionId: string) {
  const key = String(submissionId || "").trim();
  if (!key) return null;
  const map = readTurnitinSubmissionStateMap();
  return map[key] || null;
}

export function upsertTurnitinSubmissionState(
  submissionId: string,
  patch: Partial<TurnitinSubmissionState>
): TurnitinSubmissionState {
  const key = String(submissionId || "").trim();
  if (!key) throw new Error("Missing submission id for Turnitin state update.");
  const map = readTurnitinSubmissionStateMap();
  const merged = normalizeOne(key, {
    ...(map[key] || makeDefault(key)),
    ...patch,
  });
  map[key] = merged;
  writeTurnitinSubmissionStateMap(map);
  return merged;
}
