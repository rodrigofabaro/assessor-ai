import fs from "fs/promises";
import path from "path";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function normalizePathInput(p: string) {
  return p.trim().replace(/\\/g, "/");
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
  const storagePathRaw = normalizePathInput(safeStr(doc.storagePath));
  const storedFilenameRaw = normalizePathInput(safeStr(doc.storedFilename));
  const storedFilename = storedFilenameRaw ? path.basename(storedFilenameRaw) : "";

  const cwd = process.cwd();
  const cwdBase = path.basename(cwd).toLowerCase();
  const repoRoot = cwdBase === "webapp" ? path.resolve(cwd, "..") : null;

  const envRootRaw = normalizePathInput(safeStr(process.env.FILE_STORAGE_ROOT));
  const envRoot = envRootRaw
    ? path.isAbsolute(envRootRaw)
      ? path.normalize(envRootRaw)
      : path.resolve(cwd, envRootRaw)
    : "";

  const candidateRoots = [cwd, repoRoot, envRoot].filter(Boolean) as string[];
  const referenceRoots = candidateRoots.map((root) => path.join(root, "reference_uploads"));

  const tried: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: string) => {
    if (!candidate) return;
    const abs = path.isAbsolute(candidate) ? path.normalize(candidate) : path.normalize(path.resolve(cwd, candidate));
    if (seen.has(abs)) return;
    seen.add(abs);
    tried.push(abs);
  };

  const addFromStoragePath = (storagePath: string, root?: string) => {
    const base = root ? path.resolve(root, storagePath) : storagePath;
    pushCandidate(base);
    if (storedFilename && path.basename(base) !== storedFilename) {
      pushCandidate(path.join(base, storedFilename));
    }
  };

  if (storagePathRaw) {
    const isAbs = path.isAbsolute(storagePathRaw);
    if (isAbs) {
      addFromStoragePath(storagePathRaw);

      const relFromRoot = path.relative(path.parse(storagePathRaw).root, storagePathRaw);
      if (relFromRoot && relFromRoot !== storagePathRaw) {
        for (const root of candidateRoots) {
          addFromStoragePath(relFromRoot, root);
        }
      }
    } else {
      for (const root of candidateRoots) {
        addFromStoragePath(storagePathRaw, root);
      }
    }
  }

  if (storedFilename) {
    for (const root of referenceRoots) {
      pushCandidate(path.join(root, storedFilename));
    }
  }

  for (const p of tried) {
    if (await fileExists(p)) return { ok: true as const, path: p, tried };
  }

  return { ok: false as const, path: null as string | null, tried };
}
