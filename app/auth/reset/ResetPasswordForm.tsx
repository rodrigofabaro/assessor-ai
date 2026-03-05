"use client";

import { FormEvent, useMemo, useState } from "react";

type ResetPasswordFormProps = {
  rid: string;
  token: string;
};

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Unable to reset password.";
  const raw = (payload as { error?: unknown }).error;
  if (typeof raw !== "string") return "Unable to reset password.";
  return raw.trim() || "Unable to reset password.";
}

export default function ResetPasswordForm({ rid, token }: ResetPasswordFormProps) {
  const resetId = useMemo(() => String(rid || "").trim(), [rid]);
  const resetToken = useMemo(() => String(token || "").trim(), [token]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const invalidLink = !resetId || !resetToken;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || invalidLink) return;
    if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
      setError("New password and confirmation must match.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/auth/password-recovery/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rid: resetId,
          token: resetToken,
          newPassword,
        }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setError(readErrorMessage(payload));
        return;
      }
      setSuccess("Password updated. You can now sign in.");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Network error while resetting password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Reset password</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Set a new password for your Assessor AI account.
        </p>

        {invalidLink ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            This recovery link is invalid. Request a new password recovery email from the sign-in screen.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
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

            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {success ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        )}

        <div className="mt-4 text-sm">
          <a href="/login" className="font-semibold text-sky-700 hover:text-sky-800">
            Back to sign in
          </a>
        </div>
      </div>
    </section>
  );
}
