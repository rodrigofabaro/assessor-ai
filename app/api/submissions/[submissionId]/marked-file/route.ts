import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await ctx.params;
  const latest = await prisma.assessment.findFirst({
    where: { submissionId },
    orderBy: { createdAt: "desc" },
    select: { annotatedPdfPath: true },
  });
  const rel = String(latest?.annotatedPdfPath || "").trim();
  if (!rel) return NextResponse.json({ error: "No marked PDF generated yet." }, { status: 404 });

  const abs = path.join(process.cwd(), rel);
  if (!fs.existsSync(abs)) {
    return NextResponse.json({ error: "Marked PDF file not found on disk." }, { status: 404 });
  }

  const bytes = fs.readFileSync(abs);
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename=\"${path.basename(rel)}\"`,
      "cache-control": "no-store",
    },
  });
}

