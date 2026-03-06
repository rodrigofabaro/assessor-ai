#!/usr/bin/env node

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function info(message) {
  console.log(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pickOpenAiKey() {
  const candidates = [
    ["OPENAI_API_KEY", process.env.OPENAI_API_KEY],
    ["OPENAI_ADMIN_KEY", process.env.OPENAI_ADMIN_KEY],
    ["OPENAI_ADMIN_API_KEY", process.env.OPENAI_ADMIN_API_KEY],
    ["OPENAI_ADMIN", process.env.OPENAI_ADMIN],
  ];
  const found = candidates.find(([, value]) => String(value || "").trim());
  if (!found) return { keyName: "", key: "" };
  return {
    keyName: found[0],
    key: String(found[1] || "").trim().replace(/^['"]|['"]$/g, ""),
  };
}

async function main() {
  const requireResponsesWrite = isTruthy(process.env.AUTH_REQUIRE_OPENAI_RESPONSES_WRITE);
  const probeEnabled =
    requireResponsesWrite || isTruthy(process.env.OPENAI_RESPONSES_WRITE_PROBE_ENABLED);
  const { keyName, key } = pickOpenAiKey();
  const model = String(
    process.env.OPENAI_RESPONSES_CONTRACT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini"
  )
    .trim()
    .toLowerCase();

  if (!key) {
    if (requireResponsesWrite) {
      fail(
        "openai responses contract failed: AUTH_REQUIRE_OPENAI_RESPONSES_WRITE=true but no OpenAI key is configured."
      );
    }
    info("openai responses contract warning: no OpenAI key configured; check skipped.");
    process.exit(0);
  }

  if (!probeEnabled) {
    info("openai responses contract warning: live write probe disabled (OPENAI_RESPONSES_WRITE_PROBE_ENABLED=false).");
    process.exit(0);
  }

  let res;
  let payload = {};
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: "health-check",
        max_output_tokens: 1,
      }),
    });
    payload = await res.json().catch(() => ({}));
  } catch (error) {
    const message = String(error?.message || error || "OpenAI probe failed");
    if (requireResponsesWrite) {
      fail(`openai responses contract failed: ${message}`);
    }
    info(`openai responses contract warning: ${message}`);
    process.exit(0);
  }

  if (res.ok) {
    info(
      `openai responses contract passed: key=${keyName}, model=${model}, status=${res.status}`
    );
    process.exit(0);
  }

  const message = String(payload?.error?.message || `OpenAI returned ${res.status}`).trim();
  if (requireResponsesWrite) {
    fail(
      `openai responses contract failed: key=${keyName}, model=${model}, status=${res.status}, error=${message}`
    );
  }
  info(
    `openai responses contract warning: key=${keyName}, model=${model}, status=${res.status}, error=${message}`
  );
}

main().catch((error) => {
  fail(`openai responses contract crashed: ${String(error?.message || error)}`);
});

