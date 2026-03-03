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
  return issues;
}

export function validateRuntimeEnvContract() {
  if (globalForEnvContract.__runtimeEnvContractChecked) return;
  globalForEnvContract.__runtimeEnvContractChecked = true;

  const issues = collectIssues();
  if (!issues.length) return;

  const message =
    `Runtime env contract validation failed (${issues.length} issue(s)): ` +
    issues.map((i) => `${i.code}: ${i.detail}`).join(" | ");

  const hasHardFailIssue = issues.some((i) => i.hardFail);
  if (shouldFailHard() && hasHardFailIssue) {
    throw new Error(message);
  }
  console.warn(message);
}
