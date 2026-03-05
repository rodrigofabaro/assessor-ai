import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  if (msg.includes("organization") && msg.includes("table") && msg.includes("does not exist")) return true;
  return false;
}

function includeUnitGraph() {
  return {
    specDocument: true,
    learningOutcomes: {
      orderBy: [{ loCode: "asc" as const }],
      include: {
        criteria: { orderBy: [{ acCode: "asc" as const }] },
      },
    },
    assignmentBriefs: {
      orderBy: [{ assignmentCode: "asc" as const }],
      include: { briefDocument: true },
    },
  };
}

export async function GET() {
  try {
    const organizationId = await getRequestOrganizationId();

    let units;
    try {
      units = await prisma.unit.findMany({
        where: addOrganizationReadScope({}, organizationId) as any,
        orderBy: [{ unitCode: "asc" }],
        include: includeUnitGraph(),
      });
    } catch (error) {
      if (!organizationId || !isOrgScopeCompatError(error)) throw error;
      units = await prisma.unit.findMany({
        orderBy: [{ unitCode: "asc" }],
        include: includeUnitGraph(),
      });
    }

    return NextResponse.json({ units });
  } catch (err: any) {
    console.error("UNITS_GET_ERROR:", err);
    return NextResponse.json(
      { error: "UNITS_GET_ERROR", message: String(err?.message || err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const organizationId = await getRequestOrganizationId();
    const body = await req.json();
    const unitCode = String(body.unitCode || "").trim();
    const unitTitle = String(body.unitTitle || "").trim();
    const specDocumentId = body.specDocumentId ? String(body.specDocumentId) : null;

    if (!unitCode || !unitTitle) {
      return NextResponse.json(
        { error: "Missing unitCode or unitTitle" },
        { status: 400 },
      );
    }

    let unit;
    try {
      unit = await prisma.unit.create({
        data: {
          unitCode,
          unitTitle,
          specDocumentId,
          organizationId,
        } as any,
      });
    } catch (error) {
      if (!organizationId || !isOrgScopeCompatError(error)) throw error;
      unit = await prisma.unit.create({
        data: {
          unitCode,
          unitTitle,
          specDocumentId,
        } as any,
      });
    }

    return NextResponse.json({ unit });
  } catch (err: any) {
    console.error("UNIT_CREATE_ERROR:", err);
    return NextResponse.json(
      { error: "UNIT_CREATE_ERROR", message: String(err?.message || err) },
      { status: 500 },
    );
  }
}
