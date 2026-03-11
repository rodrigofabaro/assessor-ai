import { NextResponse } from "next/server";
import { makeRequestId } from "@/lib/api/errors";
import { runDueSubmissionAutomationJobs } from "@/lib/submissions/automationQueue";
import { isSubmissionAutomationCronAuthorized } from "@/lib/submissions/automationRunnerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = makeRequestId();
  const auth = isSubmissionAutomationCronAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: auth.reason || "Unauthorized.",
        requestId,
      },
      {
        status: 401,
        headers: { "x-request-id": requestId },
      },
    );
  }

  const limit = Math.max(
    1,
    Math.min(8, Number(process.env.SUBMISSION_AUTOMATION_RUNNER_LIMIT || 4)),
  );

  try {
    const processed = await runDueSubmissionAutomationJobs(req.url, limit);
    return NextResponse.json(
      {
        ok: true,
        requestId,
        mode: auth.mode,
        processedCount: processed.length,
        processed,
      },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    const message = String(
      (error as { message?: unknown } | null)?.message || error || "Submission automation cron failed.",
    ).trim();
    return NextResponse.json(
      {
        ok: false,
        error: message || "Submission automation cron failed.",
        requestId,
      },
      {
        status: 500,
        headers: { "x-request-id": requestId },
      },
    );
  }
}
