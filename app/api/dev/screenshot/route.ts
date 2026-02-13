import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeName(name: string) {
  return String(name || "screenshot.png")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const documentId = String(form?.get("documentId") || "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "MISSING_FILE", message: "No screenshot file provided." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "INVALID_TYPE", message: "Only image uploads are supported." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);
  const dir = path.join(process.cwd(), ".tmp-screens");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const extFromType = file.type.includes("png")
    ? ".png"
    : file.type.includes("jpeg") || file.type.includes("jpg")
      ? ".jpg"
      : file.type.includes("webp")
        ? ".webp"
        : "";
  const base = safeName(file.name || "screenshot");
  const ext = path.extname(base) || extFromType || ".png";
  const stem = path.basename(base, path.extname(base));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const savedName = `${stamp}${documentId ? `-${safeName(documentId).slice(0, 24)}` : ""}-${stem}${ext}`;
  const savedPath = path.join(".tmp-screens", savedName);
  const absPath = path.join(process.cwd(), savedPath);
  fs.writeFileSync(absPath, buf);

  return NextResponse.json({ ok: true, savedName, savedPath });
}

