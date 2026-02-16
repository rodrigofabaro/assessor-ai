import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/prisma";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/x-icon", "image/vnd.microsoft.icon", "image/png", "image/svg+xml"]);

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Invalid favicon size." }, { status: 400 });
  }
  if (!ALLOWED.has(String(file.type || "").toLowerCase())) {
    return NextResponse.json({ error: "Unsupported favicon type." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const target = path.join(process.cwd(), "public", "favicon.ico");
  await fs.writeFile(target, bytes);

  await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, faviconUpdatedAt: new Date() },
    update: { faviconUpdatedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    faviconPath: "/favicon.ico",
    note: "Favicon updated. Hard refresh may be required due to browser cache.",
  });
}

