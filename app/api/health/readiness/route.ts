import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOpenAiApiKey, fetchOpenAiJson } from "@/lib/openai/client";
import { getAuthEmailReadiness } from "@/lib/auth/inviteEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean;
  required: boolean;
  message: string;
  detail?: Record<string, unknown>;
};

function isTruthy(value: unknown) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function safeErrorMessage(error: unknown) {
  return String((error as { message?: string })?.message || "Unknown error");
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return { ok: true, required: true, message: "Database reachable." };
  } catch (error) {
    return {
      ok: false,
      required: true,
      message: "Database check failed.",
      detail: { error: safeErrorMessage(error) },
    };
  }
}

async function checkStorage(): Promise<CheckResult> {
  const backend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
  if (backend === "vercel_blob") {
    const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    return {
      ok: !!token,
      required: true,
      message: token
        ? "Blob storage backend configured."
        : "Blob storage backend selected but BLOB_READ_WRITE_TOKEN is missing.",
      detail: { backend },
    };
  }

  if (backend !== "filesystem") {
    return {
      ok: false,
      required: true,
      message: "Unsupported storage backend.",
      detail: { backend },
    };
  }

  const configuredRoot = String(process.env.FILE_STORAGE_ROOT || "").trim();
  const root =
    configuredRoot ||
    (isTruthy(process.env.VERCEL) ? path.join(os.tmpdir(), "assessor-ai") : process.cwd());
  try {
    await fs.mkdir(root, { recursive: true });
    const probePath = path.join(root, `.readiness-${Date.now()}.tmp`);
    await fs.writeFile(probePath, "ok", "utf8");
    await fs.unlink(probePath).catch(() => null);
    return {
      ok: true,
      required: true,
      message: "Filesystem storage writable.",
      detail: { backend, root },
    };
  } catch (error) {
    return {
      ok: false,
      required: true,
      message: "Filesystem storage is not writable.",
      detail: { backend, root, error: safeErrorMessage(error) },
    };
  }
}

function checkEmail(): CheckResult {
  const readiness = getAuthEmailReadiness();
  const required = isTruthy(process.env.AUTH_REQUIRE_RECOVERY_EMAIL);
  if (!required) {
    return {
      ok: true,
      required: false,
      message: readiness.configured
        ? "Email provider configured."
        : "Email provider not configured (optional in current mode).",
      detail: readiness,
    };
  }
  return {
    ok: readiness.configured,
    required: true,
    message: readiness.configured
      ? "Recovery email provider configured."
      : "Recovery email provider missing.",
    detail: readiness,
  };
}

function checkEmailWebhook(): CheckResult {
  const provider = String(process.env.AUTH_INVITE_EMAIL_PROVIDER || process.env.AUTH_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  const required = isTruthy(process.env.AUTH_REQUIRE_EMAIL_WEBHOOK);
  if (provider !== "resend") {
    return {
      ok: true,
      required: false,
      message: "Email webhook check skipped (provider is not resend).",
      detail: { provider },
    };
  }

  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  const allowUnsigned = isTruthy(process.env.RESEND_WEBHOOK_ALLOW_UNSIGNED);

  if (!required) {
    return {
      ok: true,
      required: false,
      message: webhookSecret
        ? "Resend webhook signing secret configured."
        : "Resend webhook signing secret not configured (optional in current mode).",
      detail: {
        provider,
        configured: !!webhookSecret,
        allowUnsigned,
      },
    };
  }

  return {
    ok: !!webhookSecret && !allowUnsigned,
    required: true,
    message:
      !!webhookSecret && !allowUnsigned
        ? "Signed Resend webhook configuration is ready."
        : "Signed Resend webhook configuration is missing or unsigned mode is enabled.",
    detail: {
      provider,
      configured: !!webhookSecret,
      allowUnsigned,
    },
  };
}

async function checkOpenAi(): Promise<CheckResult> {
  const required = isTruthy(process.env.ENV_CONTRACT_REQUIRE_OPENAI);
  const resolved = resolveOpenAiApiKey("preferStandard");
  if (!resolved.apiKey) {
    return {
      ok: !required,
      required,
      message: required ? "OpenAI key is missing." : "OpenAI key is not configured (optional in current mode).",
      detail: { keyType: resolved.keyType },
    };
  }

  const probeEnabled = isTruthy(process.env.HEALTH_READINESS_PROBE_OPENAI);
  if (!probeEnabled) {
    return {
      ok: true,
      required,
      message: "OpenAI key present (probe disabled).",
      detail: { keyType: resolved.keyType },
    };
  }

  const probe = await fetchOpenAiJson("/v1/models", resolved.apiKey, { method: "GET" }, { timeoutMs: 6000, retries: 0 });
  if (probe.ok) {
    return {
      ok: true,
      required,
      message: "OpenAI API reachable.",
      detail: { keyType: resolved.keyType, status: probe.status },
    };
  }

  if (probe.status === 403) {
    return {
      ok: true,
      required,
      message: "OpenAI key reachable but model listing is scope-restricted (treated as healthy).",
      detail: { keyType: resolved.keyType, status: probe.status, probeMessage: probe.message },
    };
  }

  return {
    ok: false,
    required,
    message: "OpenAI API probe failed.",
    detail: { keyType: resolved.keyType, status: probe.status, probeMessage: probe.message },
  };
}

export async function GET() {
  const [database, storage, openai] = await Promise.all([checkDatabase(), checkStorage(), checkOpenAi()]);
  const email = checkEmail();
  const emailWebhook = checkEmailWebhook();

  const checks = { database, storage, email, emailWebhook, openai };
  const failures = Object.entries(checks)
    .filter(([, result]) => result.required && !result.ok)
    .map(([name]) => name);
  const ready = failures.length === 0;

  return NextResponse.json(
    {
      ok: ready,
      checkedAt: new Date().toISOString(),
      checks,
      failures,
    },
    { status: ready ? 200 : 503 }
  );
}
