import fs from "fs/promises";
import path from "path";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve where the uploaded file actually lives.
 * Supports:
 * - absolute storagePath
 * - relative storagePath
 * - path stored from repo root while running in /webapp
 * - fallback: canonicalRoot + storedFilename
 */
export async function resolveStoredFile(doc: {
  storagePath: string | null;
  storedFilename: string | null;
}) {
  const storagePathRaw = safeStr(doc.storagePath);
  const storedFilename = safeStr(doc.storedFilename);

  const projectRoot = process.cwd(); // typically .../webapp
  const legacyUploadDir = path.join(projectRoot, "reference_uploads");
  const envRoot = safeStr(process.env.FILE_STORAGE_ROOT);
  const canonicalRoot = envRoot || legacyUploadDir;

  const candidates: string[] = [];

  if (storagePathRaw) {
    candidates.push(storagePathRaw);
    candidates.push(path.resolve(projectRoot, storagePathRaw));
    candidates.push(path.resolve(projectRoot, "..", storagePathRaw));
  }

  if (storedFilename) {
    candidates.push(path.join(canonicalRoot, storedFilename));
  }

  const tried = Array.from(
    new Set(
      candidates
        .map((p) => (p || "").trim())
        .filter(Boolean)
        .map((p) => path.normalize(p))
    )
  );

  for (const p of tried) {
    if (await fileExists(p)) return { ok: true as const, path: p, tried };
  }

  return { ok: false as const, path: null as string | null, tried };
}
