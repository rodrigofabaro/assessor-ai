import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const assignments = await prisma.assignment.findMany({
    orderBy: [{ unitCode: "asc" }, { assignmentRef: "asc" }],
  });
  return NextResponse.json(assignments);
}
