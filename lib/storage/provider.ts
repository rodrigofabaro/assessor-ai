import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function normalizeInput(p: string) {
  return String(p || "").trim().replace(/\\/g, "/");
}

function getRepoRootFromCwd(cwd: string) {
  return path.basename(cwd).toLowerCase() === "webapp" ? path.resolve(cwd, "..") : null;
}

function getEnvRoot(cwd: string) {
  const raw = normalizeInput(process.env.FILE_STORAGE_ROOT || "");
  if (!raw) return null;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(cwd, raw);
}

function getVercelTmpRoot() {
  const isVercel = /^(1|true)$/i.test(String(process.env.VERCEL || "").trim());
  if (!isVercel) return null;
  return path.join(os.tmpdir(), "assessor-ai");
}

function getReadRoots() {
  const cwd = process.cwd();
  const repoRoot = getRepoRootFromCwd(cwd);
  const envRoot = getEnvRoot(cwd);
  const tmpRoot = getVercelTmpRoot();
  return [tmpRoot, cwd, repoRoot, envRoot].filter(Boolean) as string[];
}

function getWriteRoot() {
  const cwd = process.cwd();
  return getEnvRoot(cwd) || getVercelTmpRoot() || cwd;
}

function getWriteRoots() {
  const cwd = process.cwd();
  const roots = [getEnvRoot(cwd), getVercelTmpRoot(), cwd].filter(Boolean) as string[];
  return Array.from(new Set(roots.map((r) => path.normalize(r))));
}

function resolveReadCandidate(storagePath: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) return null;
  if (path.isAbsolute(normalized)) return path.normalize(normalized);
  return path.resolve(getWriteRoot(), normalized);
}

export function toStorageRelativePath(...parts: string[]) {
  return path.join(...parts).replace(/\\/g, "/");
}

export function resolveStorageAbsolutePath(storagePath: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) return null;
  if (path.isAbsolute(normalized)) return path.normalize(normalized);

  const roots = getReadRoots();
  for (const root of roots) {
    const candidate = path.resolve(root, normalized);
    if (fs.existsSync(candidate)) return candidate;
  }
  return resolveReadCandidate(normalized);
}

export function storageFileExists(storagePath: string) {
  const abs = resolveStorageAbsolutePath(storagePath);
  return Boolean(abs && fs.existsSync(abs));
}

export async function writeStorageFile(storagePath: string, data: Buffer | string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) throw new Error("Invalid storage path.");
  if (path.isAbsolute(normalized)) {
    await fsp.mkdir(path.dirname(normalized), { recursive: true });
    await fsp.writeFile(normalized, data);
    return { storagePath: normalized, absolutePath: normalized };
  }

  let lastError: unknown = null;
  const roots = getWriteRoots();
  for (const root of roots) {
    const abs = path.resolve(root, normalized);
    try {
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, data);
      return { storagePath: normalized, absolutePath: abs };
    } catch (error) {
      lastError = error;
    }
  }

  const fallbackAbs = resolveReadCandidate(normalized);
  if (!fallbackAbs) throw new Error("Invalid storage path.");
  try {
    await fsp.mkdir(path.dirname(fallbackAbs), { recursive: true });
    await fsp.writeFile(fallbackAbs, data);
    return { storagePath: normalized, absolutePath: fallbackAbs };
  } catch (error) {
    lastError = error;
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to persist storage file.");
}

export function writeStorageFileSync(storagePath: string, data: Buffer | string) {
  const abs = resolveReadCandidate(storagePath);
  if (!abs) throw new Error("Invalid storage path.");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  return { storagePath: normalizeInput(storagePath), absolutePath: abs };
}

export function appendStorageTextSync(storagePath: string, text: string) {
  const abs = resolveReadCandidate(storagePath);
  if (!abs) throw new Error("Invalid storage path.");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, text, "utf8");
  return { storagePath: normalizeInput(storagePath), absolutePath: abs };
}
