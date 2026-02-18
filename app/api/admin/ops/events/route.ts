import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

function logPath() {
  return path.join(process.cwd(), ".ops-events.jsonl");
}

export async function GET(req: Request) {
  const perm = await isAdminMutationAllowed();
  if (!perm.ok) {
    return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: perm.reason }, { status: 403 });
  }
  const url = new URL(req.url);
  const limit = Math.max(10, Math.min(500, Number(url.searchParams.get("limit") || 100)));
  const maxBytes = Math.max(8_192, Math.min(4_000_000, Number(process.env.OPS_EVENTS_MAX_READ_BYTES || 1_000_000)));
  const p = logPath();
  let raw = "";
  try {
    const stat = await fs.stat(p);
    if (!stat.isFile()) return NextResponse.json({ ok: true, events: [] });
    const bytes = Math.min(stat.size, maxBytes);
    if (bytes <= 0) return NextResponse.json({ ok: true, events: [] });
    const start = Math.max(0, stat.size - bytes);
    const fh = await fs.open(p, "r");
    try {
      const buf = Buffer.alloc(bytes);
      const read = await fh.read(buf, 0, bytes, start);
      raw = buf.slice(0, read.bytesRead).toString("utf8");
    } finally {
      await fh.close();
    }
    // Drop a potentially partial leading line when we read from the middle.
    if (start > 0) {
      const nl = raw.indexOf("\n");
      raw = nl >= 0 ? raw.slice(nl + 1) : "";
    }
  } catch {
    return NextResponse.json({ ok: true, events: [] });
  }
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  const slice = lines.slice(Math.max(0, lines.length - limit));
  const events = slice
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return NextResponse.json({ ok: true, events });
}
