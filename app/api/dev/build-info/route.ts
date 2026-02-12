import { execFileSync } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const commit = runGit(["rev-parse", "--short", "HEAD"]);
    const statusOutput = runGit(["status", "--porcelain"]);
    const changedFiles = statusOutput
      ? statusOutput.split("\n").map((line) => line.trim()).filter(Boolean)
      : [];

    return NextResponse.json(
      {
        branch,
        commit,
        dirty: changedFiles.length > 0,
        changedFilesCount: changedFiles.length,
        changedFiles: changedFiles.slice(0, 20),
        timestamp: Date.now(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  }
}
