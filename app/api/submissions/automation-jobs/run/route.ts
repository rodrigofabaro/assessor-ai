import { NextResponse } from "next/server";
import { makeRequestId } from "@/lib/api/errors";
import { runDueSubmissionAutomationJobs } from "@/lib/submissions/automationQueue";

export async function POST(req: Request) {
  const requestId = makeRequestId();
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(4, Number(url.searchParams.get("limit") || 1)));

  try {
    const processed = await runDueSubmissionAutomationJobs(req.url, limit);
    return NextResponse.json(
      {
        ok: true,
        requestId,
        processedCount: processed.length,
        processed,
      },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    const message = String((error as { message?: unknown } | null)?.message || error || "Automation job runner failed.").trim();
    return NextResponse.json(
      {
        ok: false,
        error: message || "Automation job runner failed.",
        requestId,
      },
      {
        status: 500,
        headers: { "x-request-id": requestId },
      },
    );
  }
}
