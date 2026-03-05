import { NextResponse } from "next/server";
import { readStorageFile, toStorageRelativePath } from "@/lib/storage/provider";

export const runtime = "nodejs";

const MIME_BY_NAME: Record<string, string> = {
  "manifest.json": "application/json",
  "assessment-snapshot.json": "application/json",
  "feedback-summary.txt": "text/plain",
  "summary.csv": "text/csv",
  "marked.pdf": "application/pdf",
};

function isSafeFileName(name: string) {
  return /^[a-z0-9._-]+$/i.test(name);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ submissionId: string; exportId: string }> }
) {
  try {
    const { submissionId, exportId } = await ctx.params;
    const url = new URL(req.url);
    const name = String(url.searchParams.get("name") || "").trim();
    if (!name || !isSafeFileName(name)) {
      return NextResponse.json({ error: "Valid file name is required." }, { status: 400 });
    }

    const rel = toStorageRelativePath("storage", "exports", submissionId, exportId, name);
    let bytes: Buffer;
    try {
      bytes = await readStorageFile(rel);
    } catch {
      return NextResponse.json({ error: "Export file not found." }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": MIME_BY_NAME[name] || "application/octet-stream",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to download export file." },
      { status: 500 }
    );
  }
}
