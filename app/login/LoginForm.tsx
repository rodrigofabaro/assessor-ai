"use client";

import { FormEvent, useMemo, useState } from "react";

type LoginFormProps = {
  nextPath: string;
};

function normalizeNextPath(value: string) {
  const next = String(value || "").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return "/admin";
  return next;
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Login failed. Try again.";
  const raw = (payload as { error?: unknown }).error;
  if (typeof raw !== "string") return "Login failed. Try again.";
  return raw.trim() || "Login failed. Try again.";
}

export default function LoginForm({ nextPath }: LoginFormProps) {
  const safeNextPath = useMemo(() => normalizeNextPath(nextPath), [nextPath]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as unknown;
        setError(readErrorMessage(payload));
        return;
      }
      window.location.assign(safeNextPath);
    } catch {
      setError("Network error while signing in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-600">Use your deployment credentials to access protected routes.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 focus:border-sky-500"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 focus:border-sky-500"
              required
            />
          </label>

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </section>
  );
}
