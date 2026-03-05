"use client";

import { FormEvent, useState } from "react";

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Unable to send request right now.";
  const raw = (payload as { error?: unknown }).error;
  if (typeof raw !== "string") return "Unable to send request right now.";
  return raw.trim() || "Unable to send request right now.";
}

export default function ContactEarlyAccessForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          organization,
          message,
          website,
        }),
      });
      const payload = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setError(readErrorMessage(payload));
        return;
      }
      setSuccess("Thanks. We will contact you shortly.");
      setName("");
      setEmail("");
      setOrganization("");
      setMessage("");
      setWebsite("");
    } catch {
      setError("Network error while sending request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white/85 p-4">
          <p className="text-sm text-slate-700">
            Share your assessment setup and pilot scope. We will review it and contact you with next steps.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400"
            >
              Contact us
            </button>
            <a
              href="mailto:contact@assessor-ai.co.uk?subject=Assessor-AI%20Early%20Access"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Contact by email
            </a>
          </div>
        </div>
      ) : (
        <form className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white/85 p-4" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Full name"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-0 focus:border-sky-500"
              required
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="Work email"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-0 focus:border-sky-500"
              required
            />
          </div>
          <input
            value={organization}
            onChange={(e) => setOrganization(e.currentTarget.value)}
            placeholder="Organization (optional)"
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-0 focus:border-sky-500"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            placeholder="Tell us your workflow and pilot scope."
            className="min-h-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 focus:border-sky-500"
            required
          />
          <input
            value={website}
            onChange={(e) => setWebsite(e.currentTarget.value)}
            placeholder="Website"
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {success ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Sending..." : "Send contact request"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Close form
            </button>
            <a
              href="mailto:contact@assessor-ai.co.uk?subject=Assessor-AI%20Early%20Access"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Contact by email
            </a>
          </div>
        </form>
      )}
    </>
  );
}
