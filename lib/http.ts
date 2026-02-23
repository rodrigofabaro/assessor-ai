import { notifyToast } from "@/lib/ui/toast";

const inflightJsonGets = new Map<string, Promise<unknown>>();

function isMutation(method?: string) {
  const verb = (method || "GET").toUpperCase();
  return verb !== "GET" && verb !== "HEAD";
}

function safeSnippet(text: string, limit = 1200) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}

type JsonFetchInit = RequestInit & { suppressErrorToast?: boolean };

function dedupeKey(url: string, opts?: JsonFetchInit) {
  const method = (opts?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  if (opts?.signal) return null;
  return `${method} ${url}`;
}

export async function jsonFetch<T>(url: string, opts?: JsonFetchInit): Promise<T> {
  const key = dedupeKey(url, opts);
  if (key && inflightJsonGets.has(key)) {
    return (await inflightJsonGets.get(key)) as T;
  }

  const run = (async () => {
    const res = await fetch(url, opts);
    const rawText = await res.text().catch(() => "");
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    let data: unknown = rawText;
    if (isJson) {
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = rawText;
        }
      } else {
        data = {};
      }
    }

    if (!res.ok) {
      let message = "";
      if (isJson && data && typeof data === "object") {
        const payload = data as Record<string, any>;
        const userError = String(payload.error || payload.message || "").trim();
        const code = String(payload.code || "").trim();
        const requestId = String(payload.requestId || "").trim();
        const ref = requestId ? ` (ref: ${requestId})` : "";
        const codeText = code ? ` [${code}]` : "";
        message = `[${res.status}] ${url}${codeText}${userError ? ` — ${userError}${ref}` : ref}`;
      } else {
        const detail = safeSnippet(rawText);
        message = `[${res.status}] ${url}${detail ? ` — ${detail}` : ""}`;
      }
      if (isMutation(opts?.method) && !opts?.suppressErrorToast) {
        notifyToast("error", message);
      }
      throw new Error(message);
    }

    return data as T;
  })();

  if (key) {
    inflightJsonGets.set(key, run as Promise<unknown>);
    try {
      return (await run) as T;
    } finally {
      inflightJsonGets.delete(key);
    }
  }

  return await run;
}
