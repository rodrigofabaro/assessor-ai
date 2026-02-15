import { execFileSync } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BUILD_INFO_CACHE_TTL_MS = 30000;

type BuildInfoPayload = {
  branch: string;
  commit: string;
  dirty: boolean;
  changedFilesCount: number;
  changedFiles: string[];
  timestamp: number;
};

let cachedBuildInfo: BuildInfoPayload | null = null;

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
    const now = Date.now();
    if (cachedBuildInfo && now - cachedBuildInfo.timestamp < BUILD_INFO_CACHE_TTL_MS) {
      return NextResponse.json(cachedBuildInfo, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      });
    }

    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const commit = runGit(["rev-parse", "--short", "HEAD"]);
    const statusOutput = runGit(["status", "--porcelain"]);
    const changedFiles = statusOutput
      ? statusOutput.split("\n").map((line) => line.trim()).filter(Boolean)
      : [];

    const payload: BuildInfoPayload = {
      branch,
      commit,
      dirty: changedFiles.length > 0,
      changedFilesCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, 20),
      timestamp: now,
    };
    cachedBuildInfo = payload;

    return NextResponse.json(
      payload,
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
