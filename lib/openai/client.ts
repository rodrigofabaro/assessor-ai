type KeyPreference = "preferAdmin" | "preferStandard";

type OpenAiFetchOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanKey(value: string) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

export function resolveOpenAiApiKey(preference: KeyPreference = "preferStandard") {
  const standard = cleanKey(String(process.env.OPENAI_API_KEY || ""));
  const admin = cleanKey(
    String(process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_ADMIN_API_KEY || process.env.OPENAI_ADMIN || "")
  );
  const apiKey =
    preference === "preferAdmin"
      ? admin || standard
      : standard || admin;
  return {
    apiKey,
    keyType: apiKey === admin && admin ? "admin" : apiKey === standard && standard ? "standard" : "none",
  } as const;
}

export async function fetchOpenAiJson(
  path: string,
  apiKey: string,
  init: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
  } = {},
  options: OpenAiFetchOptions = {}
) {
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 45000));
  const retries = Math.max(0, Number(options.retries ?? 2));
  const retryDelayMs = Math.max(150, Number(options.retryDelayMs || 500));
  const url = path.startsWith("http") ? path : `https://api.openai.com${path}`;

  let lastStatus = 0;
  let lastMessage = "OpenAI request failed.";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: init.method || "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.headers || {}),
        },
        body: init.body,
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      if (res.ok) {
        return { ok: true as const, status: res.status, json };
      }

      lastStatus = res.status;
      lastMessage = String(json?.error?.message || `OpenAI error (${res.status})`);
      if (attempt < retries && RETRYABLE_STATUS.has(res.status)) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
      return { ok: false as const, status: res.status, message: lastMessage, json };
    } catch (e: any) {
      clearTimeout(timer);
      const aborted = e?.name === "AbortError";
      lastStatus = aborted ? 408 : 0;
      lastMessage = aborted ? "OpenAI request timed out." : String(e?.message || "OpenAI request failed.");
      if (attempt < retries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
      return { ok: false as const, status: lastStatus, message: lastMessage, json: {} };
    }
  }

  return { ok: false as const, status: lastStatus, message: lastMessage, json: {} };
}
