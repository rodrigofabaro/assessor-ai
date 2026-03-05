import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

type StorageBackend = "filesystem" | "vercel_blob";

function isTruthy(value: unknown) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function normalizeInput(p: string) {
  return String(p || "").trim().replace(/\\/g, "/");
}

function isRemoteStoragePath(p: string) {
  return /^https?:\/\//i.test(normalizeInput(p));
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
  const isVercel = isTruthy(process.env.VERCEL);
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

function backendFromEnv(): StorageBackend {
  const raw = normalizeInput(process.env.STORAGE_BACKEND || "");
  if (!raw || raw === "filesystem") return "filesystem";
  if (raw === "vercel_blob") return "vercel_blob";
  return "filesystem";
}

function getBlobToken() {
  return String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
}

function hashShort(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 20);
}

function parseRemoteObjectKey(remoteUrl: string) {
  try {
    const url = new URL(remoteUrl);
    const pathname = String(url.pathname || "").replace(/^\/+/, "");
    return normalizeInput(pathname);
  } catch {
    return "";
  }
}

function remoteCacheRelativePath(remoteUrl: string) {
  let ext = ".bin";
  try {
    const url = new URL(remoteUrl);
    const parsed = path.extname(url.pathname || "").toLowerCase();
    if (parsed && parsed.length <= 12) ext = parsed;
  } catch {}
  return toStorageRelativePath("storage", "remote_cache", `${hashShort(remoteUrl)}${ext}`);
}

function toRemoteObjectKey(storagePath: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) return "";
  if (isRemoteStoragePath(normalized)) {
    return parseRemoteObjectKey(normalized);
  }
  if (path.isAbsolute(normalized)) return "";
  return normalized;
}

function resolveReadCandidate(storagePath: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) return null;
  if (isRemoteStoragePath(normalized)) return null;
  if (path.isAbsolute(normalized)) return path.normalize(normalized);
  return path.resolve(getWriteRoot(), normalized);
}

async function writeLocalFile(storagePath: string, data: Buffer | string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized || isRemoteStoragePath(normalized)) throw new Error("Invalid storage path.");
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

function writeLocalFileSync(storagePath: string, data: Buffer | string) {
  const abs = resolveReadCandidate(storagePath);
  if (!abs) throw new Error("Invalid storage path.");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  return { storagePath: normalizeInput(storagePath), absolutePath: abs };
}

async function fetchRemoteBytes(remoteUrl: string) {
  const normalized = normalizeInput(remoteUrl);
  if (!isRemoteStoragePath(normalized)) throw new Error("Invalid remote storage URL.");
  const token = getBlobToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await fetch(normalized, { method: "GET", headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Remote storage fetch failed (${response.status}) for ${normalized}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function resolveBlobUrlForRelativePath(storagePath: string) {
  const key = toRemoteObjectKey(storagePath);
  if (!key) return null;
  const token = getBlobToken();
  if (!token) return null;
  try {
    const blobMod = await import("@vercel/blob");
    const metadata = await blobMod.head(key, { token });
    return String((metadata as { url?: unknown })?.url || "").trim() || null;
  } catch {
    return null;
  }
}

async function ensureRemoteCached(remoteUrl: string, preferredPath?: string) {
  const candidate =
    normalizeInput(preferredPath || "") ||
    toRemoteObjectKey(remoteUrl) ||
    remoteCacheRelativePath(remoteUrl);
  const existing = resolveStorageAbsolutePath(candidate);
  if (existing && fs.existsSync(existing)) return existing;
  const bytes = await fetchRemoteBytes(remoteUrl);
  const saved = await writeLocalFile(candidate, bytes);
  return saved.absolutePath;
}

export function toStorageRelativePath(...parts: string[]) {
  return path.join(...parts).replace(/\\/g, "/");
}

export function isRemoteStorageBackend() {
  return backendFromEnv() === "vercel_blob";
}

export function resolveStorageAbsolutePath(storagePath: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) return null;
  if (isRemoteStoragePath(normalized)) {
    const key = toRemoteObjectKey(normalized) || remoteCacheRelativePath(normalized);
    if (!key) return null;
    const roots = getReadRoots();
    for (const root of roots) {
      const candidate = path.resolve(root, key);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
  if (path.isAbsolute(normalized)) return path.normalize(normalized);

  const roots = getReadRoots();
  for (const root of roots) {
    const candidate = path.resolve(root, normalized);
    if (fs.existsSync(candidate)) return candidate;
  }
  return resolveReadCandidate(normalized);
}

export async function resolveStorageAbsolutePathAsync(storagePath: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) return null;
  const existing = resolveStorageAbsolutePath(normalized);
  if (existing && fs.existsSync(existing)) return existing;

  if (isRemoteStoragePath(normalized)) {
    return ensureRemoteCached(normalized);
  }

  if (backendFromEnv() === "vercel_blob" && !path.isAbsolute(normalized)) {
    const remoteUrl = await resolveBlobUrlForRelativePath(normalized);
    if (remoteUrl) return ensureRemoteCached(remoteUrl, normalized);
  }

  return existing;
}

export async function readStorageFile(storagePath: string) {
  const abs = await resolveStorageAbsolutePathAsync(storagePath);
  if (abs && fs.existsSync(abs)) {
    return fsp.readFile(abs);
  }
  const normalized = normalizeInput(storagePath);
  if (isRemoteStoragePath(normalized)) {
    return fetchRemoteBytes(normalized);
  }
  throw new Error(`Storage file not found: ${storagePath}`);
}

export function storageFileExists(storagePath: string) {
  const abs = resolveStorageAbsolutePath(storagePath);
  return Boolean(abs && fs.existsSync(abs));
}

export async function writeStorageFile(storagePath: string, data: Buffer | string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) throw new Error("Invalid storage path.");

  const backend = backendFromEnv();
  if (backend === "filesystem") {
    const saved = await writeLocalFile(normalized, data);
    return { storagePath: normalized, absolutePath: saved.absolutePath };
  }

  const key = toRemoteObjectKey(normalized);
  if (!key) throw new Error("Remote storage backend requires a relative path or remote URL key.");
  const token = getBlobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required for STORAGE_BACKEND=vercel_blob.");

  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
  const localSaved = await writeLocalFile(key, payload);
  const blobMod = await import("@vercel/blob");
  const uploaded = await blobMod.put(key, payload, {
    token,
    access: "private",
    addRandomSuffix: false,
  });
  const remoteUrl = String((uploaded as { url?: unknown })?.url || "").trim();
  if (!remoteUrl) throw new Error("Blob upload returned an empty URL.");
  return { storagePath: remoteUrl, absolutePath: localSaved.absolutePath };
}

export async function appendStorageText(storagePath: string, text: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) throw new Error("Invalid storage path.");
  let current = "";
  try {
    const bytes = await readStorageFile(normalized);
    current = bytes.toString("utf8");
  } catch {}
  const saved = await writeStorageFile(normalized, `${current}${String(text || "")}`);
  return saved;
}

export async function deleteStorageFile(storagePath: string) {
  const normalized = normalizeInput(storagePath);
  if (!normalized) return { removedLocal: false, removedRemote: false };

  let removedLocal = false;
  let removedRemote = false;

  const abs = resolveStorageAbsolutePath(normalized);
  if (abs && fs.existsSync(abs)) {
    try {
      await fsp.unlink(abs);
      removedLocal = true;
    } catch {}
  }

  if (backendFromEnv() === "vercel_blob") {
    const token = getBlobToken();
    const objectRef = isRemoteStoragePath(normalized) ? normalized : toRemoteObjectKey(normalized);
    if (token && objectRef) {
      try {
        const blobMod = await import("@vercel/blob");
        await blobMod.del(objectRef, { token });
        removedRemote = true;
      } catch {}
    }
  }

  return { removedLocal, removedRemote };
}

export function writeStorageFileSync(storagePath: string, data: Buffer | string) {
  if (backendFromEnv() !== "filesystem") {
    throw new Error("writeStorageFileSync is not supported with remote storage backend.");
  }
  return writeLocalFileSync(storagePath, data);
}

export function appendStorageTextSync(storagePath: string, text: string) {
  if (backendFromEnv() !== "filesystem") {
    throw new Error("appendStorageTextSync is not supported with remote storage backend.");
  }
  const abs = resolveReadCandidate(storagePath);
  if (!abs) throw new Error("Invalid storage path.");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, text, "utf8");
  return { storagePath: normalizeInput(storagePath), absolutePath: abs };
}
