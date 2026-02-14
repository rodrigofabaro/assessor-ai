import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

type ApiErrorInput = {
  status?: number;
  code: string;
  userMessage: string;
  requestId?: string;
  route: string;
  details?: unknown;
  cause?: unknown;
};

function toErrorMessage(cause: unknown) {
  if (!cause) return "";
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

export function makeRequestId() {
  return randomUUID();
}

export function apiError(input: ApiErrorInput) {
  const status = input.status ?? 500;
  const requestId = input.requestId || makeRequestId();
  const isDev = process.env.NODE_ENV !== "production";

  // Always log rich details server-side with request id for traceability.
  console.error(
    JSON.stringify({
      level: "error",
      route: input.route,
      requestId,
      code: input.code,
      status,
      userMessage: input.userMessage,
      details: input.details ?? null,
      cause: toErrorMessage(input.cause),
    })
  );

  const body: Record<string, unknown> = {
    error: input.userMessage,
    code: input.code,
    requestId,
  };
  if (isDev && input.details !== undefined) {
    body.details = input.details;
  }

  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
    },
  });
}

