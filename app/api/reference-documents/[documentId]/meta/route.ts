import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function asObject(x: any) {
  if (x && typeof x === "object" && !Array.isArray(x)) return x;
  return {};
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
  const next = { ...prev, ...asObject(body) };

  const updated = await prisma.referenceDocument.update({
    where: { id },
    data: { sourceMeta: next as any },
  });

  return NextResponse.json({ id: updated.id, sourceMeta: updated.sourceMeta ?? {} });
}
