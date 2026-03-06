import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readStorageFile } from "@/lib/storage/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MIME = "image/x-icon";
const ALLOWED_MIME = new Set(["image/x-icon", "image/vnd.microsoft.icon", "image/png", "image/svg+xml"]);
const FALLBACK_PATH = path.join(process.cwd(), "public", "favicon.ico");

function normalizeMime(value: unknown) {
  const mime = String(value || "").trim().toLowerCase();
  if (!mime) return DEFAULT_MIME;
  return ALLOWED_MIME.has(mime) ? mime : DEFAULT_MIME;
}

function asIconResponse(payload: Buffer, contentType: string, source: string) {
  return new NextResponse(new Uint8Array(payload), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Favicon-Source": source,
    },
  });
}

export async function GET() {
  try {
    const cfg = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: {
        faviconStoragePath: true,
        faviconMimeType: true,
      },
    });

    const storagePath = String(cfg?.faviconStoragePath || "").trim();
    if (storagePath) {
      try {
        const bytes = await readStorageFile(storagePath);
        return asIconResponse(bytes, normalizeMime(cfg?.faviconMimeType), "storage");
      } catch {
        // fallback to default bundled icon below
      }
    }
  } catch {
    // fallback to default bundled icon below
  }

  try {
    const bytes = await fs.readFile(FALLBACK_PATH);
    return asIconResponse(bytes, DEFAULT_MIME, "fallback");
  } catch {
    return NextResponse.json({ error: "favicon not configured" }, { status: 404 });
  }
}
