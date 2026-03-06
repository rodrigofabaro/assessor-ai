type EnvIssue = {
  code: string;
  detail: string;
  hardFail: boolean;
};

const globalForEnvContract = globalThis as unknown as {
  __runtimeEnvContractChecked?: boolean;
};

function isTruthy(raw: string | undefined) {
  return /^(1|true|yes|on)$/i.test(String(raw || "").trim());
}

function isAuthGuardsEffectivelyEnabled() {
  const raw = String(process.env.AUTH_GUARDS_ENABLED || "").trim();
  if (!raw) return process.env.NODE_ENV === "production";
  return isTruthy(raw);
}

function hasOpenAiCredential() {
  const candidates = [
    process.env.OPENAI_ADMIN_KEY,
    process.env.OPENAI_ADMIN_API_KEY,
    process.env.OPENAI_ADMIN,
    process.env.OPENAI_API_KEY,
  ];
  return candidates.some((v) => String(v || "").trim().length > 0);
}

function shouldFailHard() {
  if (isTruthy(process.env.ENV_CONTRACT_DISABLE)) return false;
  if (isTruthy(process.env.ENV_CONTRACT_ENFORCE)) return true;
  const phase = String(process.env.NEXT_PHASE || "").trim();
  const isBuildPhase = phase === "phase-production-build";
  const isProd = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";
  return isProd && !isBuildPhase && !isTest;
}

function collectIssues(): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const hasDbUrl = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ].some((v) => String(v || "").trim().length > 0);
  if (!hasDbUrl) {
    issues.push({
      code: "ENV_DATABASE_URL_MISSING",
      detail: "Set DATABASE_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL).",
      hardFail: true,
    });
  }
  if (!hasOpenAiCredential()) {
    const requireOpenAi = isTruthy(process.env.ENV_CONTRACT_REQUIRE_OPENAI);
    issues.push({
      code: "ENV_OPENAI_KEY_MISSING",
      detail: "At least one OpenAI key must be set (OPENAI_ADMIN_KEY | OPENAI_ADMIN_API_KEY | OPENAI_ADMIN | OPENAI_API_KEY).",
      hardFail: requireOpenAi,
    });
  }
  const storageBackend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
  const requireStorageRoot = isTruthy(process.env.ENV_CONTRACT_REQUIRE_STORAGE_ROOT);
  if (storageBackend !== "filesystem" && storageBackend !== "vercel_blob") {
    issues.push({
      code: "ENV_STORAGE_BACKEND_INVALID",
      detail: "STORAGE_BACKEND must be 'filesystem' or 'vercel_blob'.",
      hardFail: true,
    });
  }
  if (storageBackend === "vercel_blob" && !String(process.env.BLOB_READ_WRITE_TOKEN || "").trim()) {
    issues.push({
      code: "ENV_BLOB_TOKEN_MISSING",
      detail: "BLOB_READ_WRITE_TOKEN is required when STORAGE_BACKEND=vercel_blob.",
      hardFail: true,
    });
  }
  if (storageBackend === "filesystem" && requireStorageRoot) {
    const fileStorageRoot = String(process.env.FILE_STORAGE_ROOT || "").trim();
    if (!fileStorageRoot) {
      issues.push({
        code: "ENV_FILE_STORAGE_ROOT_MISSING",
        detail: "FILE_STORAGE_ROOT is required when ENV_CONTRACT_REQUIRE_STORAGE_ROOT=true and STORAGE_BACKEND=filesystem.",
        hardFail: true,
      });
    }
  }
  const authGuardsEnabled = isAuthGuardsEffectivelyEnabled();
  if (authGuardsEnabled) {
    const sessionSecret = String(process.env.AUTH_SESSION_SECRET || "").trim();
    if (sessionSecret.length < 24) {
      issues.push({
        code: "ENV_AUTH_SESSION_SECRET_MISSING",
        detail: "AUTH_SESSION_SECRET must be set to 24+ characters when AUTH_GUARDS_ENABLED=true.",
        hardFail: true,
      });
    }
    if (!String(process.env.AUTH_LOGIN_USERNAME || "").trim() || !String(process.env.AUTH_LOGIN_PASSWORD || "").trim()) {
      issues.push({
        code: "ENV_AUTH_LOGIN_CREDENTIALS_MISSING",
        detail: "AUTH_LOGIN_USERNAME/PASSWORD fallback is not configured. DB-backed AppUser login must be enabled for at least one user.",
        hardFail: false,
      });
    }
  }
  const inviteProvider = String(process.env.AUTH_INVITE_EMAIL_PROVIDER || process.env.AUTH_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  const recoveryEmailRequired = isTruthy(process.env.AUTH_REQUIRE_RECOVERY_EMAIL);
  if (inviteProvider === "resend" || recoveryEmailRequired) {
    if (!String(process.env.RESET_TOKEN_PEPPER || "").trim()) {
      issues.push({
        code: "ENV_RESET_TOKEN_PEPPER_MISSING",
        detail: "RESET_TOKEN_PEPPER is required for password recovery token hashing.",
        hardFail: recoveryEmailRequired,
      });
    }
    const authOrigin = String(
      process.env.AUTH_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN || ""
    ).trim();
    if (!authOrigin) {
      issues.push({
        code: "ENV_AUTH_APP_ORIGIN_MISSING",
        detail: "AUTH_APP_ORIGIN (or NEXT_PUBLIC_APP_ORIGIN/APP_ORIGIN) is required for password recovery links.",
        hardFail: recoveryEmailRequired,
      });
    }
  }
  if (inviteProvider === "resend") {
    const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
    if (!webhookSecret) {
      issues.push({
        code: "ENV_RESEND_WEBHOOK_SECRET_MISSING",
        detail: "Set RESEND_WEBHOOK_SECRET and configure webhook URL /api/webhooks/resend to capture delivery lifecycle events.",
        hardFail: false,
      });
    }
    if (isTruthy(process.env.RESEND_WEBHOOK_ALLOW_UNSIGNED)) {
      issues.push({
        code: "ENV_RESEND_WEBHOOK_UNSIGNED_ENABLED",
        detail: "RESEND_WEBHOOK_ALLOW_UNSIGNED is enabled. Use only for local testing.",
        hardFail: false,
      });
    }
  }
  return issues;
}

export function validateRuntimeEnvContract() {
  if (globalForEnvContract.__runtimeEnvContractChecked) return;
  globalForEnvContract.__runtimeEnvContractChecked = true;

  const issues = collectIssues();
  if (!issues.length) return;

  const hasHardFailIssue = issues.some((i) => i.hardFail);
  const hardCount = issues.filter((i) => i.hardFail).length;
  const warnCount = Math.max(0, issues.length - hardCount);
  const message =
    hasHardFailIssue
      ? `Runtime env contract hard-fail issues (${hardCount} hard, ${warnCount} warning): `
      : `Runtime env contract warnings (${warnCount}): `;
  const details = issues.map((i) => `${i.code}: ${i.detail}`).join(" | ");

  if (shouldFailHard() && hasHardFailIssue) {
    throw new Error(`${message}${details}`);
  }
  console.warn(`${message}${details}`);
}
