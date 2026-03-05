"use client";

import { FormEvent, useMemo, useState } from "react";

type LoginFormProps = {
  nextPath: string;
};

function normalizeNextPath(value: string) {
  const next = String(value || "").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Login failed. Try again.";
  const raw = (payload as { error?: unknown }).error;
  if (typeof raw !== "string") return "Login failed. Try again.";
  return raw.trim() || "Login failed. Try again.";
}

function readErrorCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const raw = (payload as { code?: unknown }).code;
  return typeof raw === "string" ? raw.trim() : "";
}

async function loginRequest(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { response, payload };
}

export default function LoginForm({ nextPath }: LoginFormProps) {
  const safeNextPath = useMemo(() => normalizeNextPath(nextPath), [nextPath]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetRequired, setResetRequired] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setRecoveryNotice("");
    setBusy(true);
    try {
      const { response, payload } = await loginRequest(username, password);
      if (!response.ok) {
        const code = readErrorCode(payload);
        if (code === "AUTH_PASSWORD_RESET_REQUIRED") {
          setResetRequired(true);
          setError("Password reset required. Set a new password to continue.");
          return;
        }
        setError(readErrorMessage(payload));
        return;
      }
      setResetRequired(false);
      window.location.assign(safeNextPath);
    } catch {
      setError("Network error while signing in.");
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword() {
    if (busy) return;
    if (!newPassword || newPassword !== confirmPassword) {
      setError("New password and confirmation must match.");
      return;
    }
    setError("");
    setRecoveryNotice("");
    setBusy(true);
    try {
      const resetRes = await fetch("/api/auth/password-reset", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          currentPassword: password,
          newPassword,
        }),
      });
      const resetPayload = (await resetRes.json().catch(() => null)) as unknown;
      if (!resetRes.ok) {
        setError(readErrorMessage(resetPayload));
        return;
      }

      const { response, payload } = await loginRequest(username, newPassword);
      if (!response.ok) {
        setError(readErrorMessage(payload));
        return;
      }
      window.location.assign(safeNextPath);
    } catch {
      setError("Network error while resetting password.");
    } finally {
      setBusy(false);
    }
  }

  async function onRequestRecovery() {
    if (busy) return;
    const email = String(username || "").trim();
    if (!email) {
      setError("Enter your username/email first, then request password recovery.");
      return;
    }
    setError("");
    setRecoveryNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-recovery", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: email }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setError(readErrorMessage(payload));
        return;
      }
      const message =
        payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
          ? String((payload as { message: string }).message).trim()
          : "If the account exists, a recovery email has been sent.";
      setRecoveryNotice(message);
    } catch {
      setError("Network error while requesting password recovery.");
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
            <span className="mb-1 flex items-center justify-between text-sm font-medium text-zinc-700">
              <span>Password</span>
              <button
                type="button"
                onClick={() => void onRequestRecovery()}
                disabled={busy}
                className="text-xs font-semibold text-sky-700 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Forgot password?
              </button>
            </span>
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
          {recoveryNotice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{recoveryNotice}</p>
          ) : null}

          {resetRequired ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">
                This account requires a password change before first sign-in.
              </p>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.currentTarget.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 focus:border-sky-500"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 focus:border-sky-500"
                  required
                />
              </label>
              <button
                type="button"
                onClick={() => void onResetPassword()}
                disabled={busy}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Updating..." : "Update password and sign in"}
              </button>
            </div>
          ) : null}

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
