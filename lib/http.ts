import { notifyToast } from "@/lib/ui/toast";

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

export async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
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
    const detail = safeSnippet(rawText);
    const message = `[${res.status}] ${url}${detail ? ` — ${detail}` : ""}`;
    if (isMutation(opts?.method)) {
      notifyToast("error", message);
    }
    throw new Error(message);
  }

  return data as T;
}
