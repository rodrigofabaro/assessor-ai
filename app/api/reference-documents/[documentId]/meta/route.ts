import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeBriefDraftArtifacts } from "@/lib/extraction/brief/draftIntegrity";

function asObject(x: any) {
  if (x && typeof x === "object" && !Array.isArray(x)) return x;
  return {};
}

function cleanTextValue(input: string) {
  const lines = String(input || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const kept = lines.filter((line) => {
    const s = String(line || "").trim();
    if (!s) return true;
    if (/tmp-screens/i.test(s)) return false;
    if (/^screenshot:\s*/i.test(s)) return false;
    return true;
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

function sanitizeArtifacts(value: any): any {
  if (typeof value === "string") return cleanTextValue(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeArtifacts(v));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeArtifacts(v);
    return out;
  }
  return value;
}

export async function GET(_req: Request, { params }: { params: { documentId: string } }) {
  const id = params.documentId;
  const doc = await prisma.referenceDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: doc.id, sourceMeta: doc.sourceMeta ?? {} });
}

export async function PATCH(req: Request, { params }: { params: { documentId: string } }) {
  const id = params.documentId;
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await prisma.referenceDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prev = asObject(existing.sourceMeta);
  const next = sanitizeArtifacts({ ...prev, ...asObject(body) }) as any;
  if (next?.manualDraft) {
    next.manualDraft = sanitizeBriefDraftArtifacts(next.manualDraft);
  }

  const updated = await prisma.referenceDocument.update({
    where: { id },
    data: { sourceMeta: next as any },
  });

  return NextResponse.json({ id: updated.id, sourceMeta: updated.sourceMeta ?? {} });
}
