import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

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
  aiWritingPercentage: number | null;
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
    aiWritingPercentage: null,
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

function normalizeIsoOrNow(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalizeIsoOrNull(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeOne(submissionId: string, value: Partial<TurnitinSubmissionState>): TurnitinSubmissionState {
  const base = makeDefault(submissionId);
  return {
    ...base,
    ...value,
    submissionId,
    turnitinSubmissionId: String(value.turnitinSubmissionId || "").trim() || null,
    status: normalizeStatus(value.status),
    aiWritingPercentage: toFiniteNumber(value.aiWritingPercentage),
    overallMatchPercentage: toFiniteNumber(value.overallMatchPercentage),
    internetMatchPercentage: toFiniteNumber(value.internetMatchPercentage),
    publicationMatchPercentage: toFiniteNumber(value.publicationMatchPercentage),
    submittedWorksMatchPercentage: toFiniteNumber(value.submittedWorksMatchPercentage),
    reportRequestedAt: String(value.reportRequestedAt || "").trim() || null,
    reportGeneratedAt: String(value.reportGeneratedAt || "").trim() || null,
    viewerUrl: String(value.viewerUrl || "").trim() || null,
    lastError: String(value.lastError || "").trim() || null,
    updatedAt: normalizeIsoOrNow(value.updatedAt),
  };
}

function parseTurnitinState(raw: string) {
  const parsed = JSON.parse(raw) as Record<string, Partial<TurnitinSubmissionState>>;
  if (!parsed || typeof parsed !== "object") return {};
  const out: Record<string, TurnitinSubmissionState> = {};
  for (const [submissionId, value] of Object.entries(parsed)) {
    out[submissionId] = normalizeOne(submissionId, value || {});
  }
  return out;
}

function readTurnitinSubmissionStateMapFromFile(): Record<string, TurnitinSubmissionState> {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    return parseTurnitinState(raw);
  } catch {
    return {};
  }
}

function writeTurnitinSubmissionStateMapToFile(next: Record<string, TurnitinSubmissionState>) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(next, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

function dateOrNull(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeFromDbRow(row: Record<string, unknown>): TurnitinSubmissionState {
  return normalizeOne(String(row.submissionId || "").trim(), {
    submissionId: String(row.submissionId || "").trim(),
    turnitinSubmissionId: String(row.turnitinSubmissionId || "").trim() || null,
    status: row.status as TurnitinSubmissionStatus,
    aiWritingPercentage: toFiniteNumber(row.aiWritingPercentage),
    overallMatchPercentage: toFiniteNumber(row.overallMatchPercentage),
    internetMatchPercentage: toFiniteNumber(row.internetMatchPercentage),
    publicationMatchPercentage: toFiniteNumber(row.publicationMatchPercentage),
    submittedWorksMatchPercentage: toFiniteNumber(row.submittedWorksMatchPercentage),
    reportRequestedAt:
      row.reportRequestedAt && row.reportRequestedAt instanceof Date
        ? row.reportRequestedAt.toISOString()
        : String(row.reportRequestedAt || "").trim() || null,
    reportGeneratedAt:
      row.reportGeneratedAt && row.reportGeneratedAt instanceof Date
        ? row.reportGeneratedAt.toISOString()
        : String(row.reportGeneratedAt || "").trim() || null,
    viewerUrl: String(row.viewerUrl || "").trim() || null,
    lastError: String(row.lastError || "").trim() || null,
    updatedAt:
      row.updatedAt && row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt || "").trim() || new Date().toISOString(),
  });
}

function toDbWritePayload(state: TurnitinSubmissionState) {
  return {
    turnitinSubmissionId: state.turnitinSubmissionId || null,
    status: state.status,
    aiWritingPercentage: toFiniteNumber(state.aiWritingPercentage),
    overallMatchPercentage: toFiniteNumber(state.overallMatchPercentage),
    internetMatchPercentage: toFiniteNumber(state.internetMatchPercentage),
    publicationMatchPercentage: toFiniteNumber(state.publicationMatchPercentage),
    submittedWorksMatchPercentage: toFiniteNumber(state.submittedWorksMatchPercentage),
    reportRequestedAt: dateOrNull(normalizeIsoOrNull(state.reportRequestedAt)),
    reportGeneratedAt: dateOrNull(normalizeIsoOrNull(state.reportGeneratedAt)),
    viewerUrl: String(state.viewerUrl || "").trim() || null,
    lastError: String(state.lastError || "").trim() || null,
  };
}

function syncFallbackFileState(submissionId: string, state: TurnitinSubmissionState) {
  const map = readTurnitinSubmissionStateMapFromFile();
  map[submissionId] = state;
  writeTurnitinSubmissionStateMapToFile(map);
}

export async function readTurnitinSubmissionStateMap(): Promise<Record<string, TurnitinSubmissionState>> {
  const dbModel = (prisma as any)?.turnitinSubmissionSyncState;
  if (dbModel && typeof dbModel.findMany === "function") {
    try {
      const rows = await dbModel.findMany({
        select: {
          submissionId: true,
          turnitinSubmissionId: true,
          status: true,
          aiWritingPercentage: true,
          overallMatchPercentage: true,
          internetMatchPercentage: true,
          publicationMatchPercentage: true,
          submittedWorksMatchPercentage: true,
          reportRequestedAt: true,
          reportGeneratedAt: true,
          viewerUrl: true,
          lastError: true,
          updatedAt: true,
        },
      });
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.reduce<Record<string, TurnitinSubmissionState>>((acc, row) => {
          const normalized = normalizeFromDbRow(row as Record<string, unknown>);
          acc[normalized.submissionId] = normalized;
          return acc;
        }, {});
      }
    } catch {
      // fallback to legacy file path
    }
  }

  return readTurnitinSubmissionStateMapFromFile();
}

export async function getTurnitinSubmissionState(submissionId: string): Promise<TurnitinSubmissionState | null> {
  const key = String(submissionId || "").trim();
  if (!key) return null;

  const dbModel = (prisma as any)?.turnitinSubmissionSyncState;
  if (dbModel && typeof dbModel.findUnique === "function") {
    try {
      const row = await dbModel.findUnique({
        where: { submissionId: key },
        select: {
          submissionId: true,
          turnitinSubmissionId: true,
          status: true,
          aiWritingPercentage: true,
          overallMatchPercentage: true,
          internetMatchPercentage: true,
          publicationMatchPercentage: true,
          submittedWorksMatchPercentage: true,
          reportRequestedAt: true,
          reportGeneratedAt: true,
          viewerUrl: true,
          lastError: true,
          updatedAt: true,
        },
      });
      if (row) return normalizeFromDbRow(row as Record<string, unknown>);
    } catch {
      // fallback to legacy file path
    }
  }

  const map = readTurnitinSubmissionStateMapFromFile();
  return map[key] || null;
}

export async function upsertTurnitinSubmissionState(
  submissionId: string,
  patch: Partial<TurnitinSubmissionState>
): Promise<TurnitinSubmissionState> {
  const key = String(submissionId || "").trim();
  if (!key) throw new Error("Missing submission id for Turnitin state update.");

  const existing = (await getTurnitinSubmissionState(key)) || makeDefault(key);
  const merged = normalizeOne(key, { ...existing, ...patch });

  const dbModel = (prisma as any)?.turnitinSubmissionSyncState;
  if (dbModel && typeof dbModel.upsert === "function") {
    try {
      const row = await dbModel.upsert({
        where: { submissionId: key },
        create: {
          submissionId: key,
          ...toDbWritePayload(merged),
        },
        update: toDbWritePayload(merged),
      });
      const normalized = normalizeFromDbRow(row as Record<string, unknown>);
      syncFallbackFileState(key, normalized);
      return normalized;
    } catch {
      // fallback to legacy file path
    }
  }

  const map = readTurnitinSubmissionStateMapFromFile();
  map[key] = merged;
  writeTurnitinSubmissionStateMapToFile(map);
  return merged;
}
