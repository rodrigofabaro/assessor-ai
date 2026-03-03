import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  resolveStorageAbsolutePath,
  toStorageRelativePath,
  writeStorageFile,
} from "@/lib/storage/provider";

export type IvAdStorageBucket = "templates" | "inputs" | "outputs";

const IV_AD_STORAGE_ROOT_REL = toStorageRelativePath("storage", "iv-ad");

function safeName(name: string) {
  return String(name || "file")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 140) || "file";
}

export function ivAdStorageRootAbs() {
  return resolveStorageAbsolutePath(IV_AD_STORAGE_ROOT_REL) || path.join(process.cwd(), IV_AD_STORAGE_ROOT_REL);
}

export function ivAdToAbsolutePath(storagePath: string) {
  return resolveStorageAbsolutePath(storagePath) || storagePath;
}

export async function ensureIvAdStorageDirs() {
  const dirs = [
    path.join(ivAdStorageRootAbs(), "templates"),
    path.join(ivAdStorageRootAbs(), "inputs"),
    path.join(ivAdStorageRootAbs(), "outputs"),
  ];
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
}

export async function writeIvAdBuffer(args: {
  bucket: IvAdStorageBucket;
  originalFilename: string;
  buffer: Buffer;
  prefix?: string;
}) {
  await ensureIvAdStorageDirs();
  const safe = safeName(args.originalFilename);
  const stem = args.prefix ? `${args.prefix}-` : "";
  const storedFilename = `${stem}${randomUUID()}-${safe}`;
  const rel = toStorageRelativePath(IV_AD_STORAGE_ROOT_REL, args.bucket, storedFilename);
  await writeStorageFile(rel, args.buffer);
  return { storagePath: rel, storedFilename };
}

export async function writeIvAdUpload(args: {
  bucket: IvAdStorageBucket;
  file: File;
  prefix?: string;
}) {
  const bytes = await args.file.arrayBuffer();
  return writeIvAdBuffer({
    bucket: args.bucket,
    originalFilename: args.file.name,
    buffer: Buffer.from(bytes),
    prefix: args.prefix,
  });
}

export function ivAdDocxContentType() {
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}
