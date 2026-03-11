"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TinyIcon } from "@/components/ui/TinyIcon";

type OrganizationOption = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  role?: string;
  isDefault?: boolean;
};

type OrganizationsPayload = {
  organizations?: OrganizationOption[];
  activeOrganizationId?: string | null;
  isSuperAdmin?: boolean;
};

type OrgSettingsResponse = {
  organization?: { id: string; slug: string; name: string; isActive: boolean };
  settings?: {
    id: string;
    config?: Record<string, unknown> | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  secrets?: Array<{
    id: string;
    secretName: string;
    rotatedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>;
  warning?: string;
  error?: string;
  code?: string;
  ok?: boolean;
};

const SECRET_FIELDS = [
  { key: "OPENAI_API_KEY", label: "OpenAI API key" },
  { key: "TURNITIN_API_KEY", label: "Turnitin API key" },
  { key: "SMTP_API_KEY", label: "SMTP / mail API key" },
] as const;

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value && typeof value === "object" ? value : {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function OrganizationSettingsPageClient() {
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [pendingOrganizationId, setPendingOrganizationId] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [configDraft, setConfigDraft] = useState("{\n}");
  const [baseConfigDraft, setBaseConfigDraft] = useState("{\n}");
  const [storedSecretNames, setStoredSecretNames] = useState<string[]>([]);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [secretClears, setSecretClears] = useState<Record<string, boolean>>({});
  const [updatedAt, setUpdatedAt] = useState("");

  const activeOrganization = useMemo(
    () => organizations.find((org) => org.id === activeOrganizationId) || null,
    [organizations, activeOrganizationId]
  );

  const activeRoleLabel = isSuperAdmin
    ? "SUPER_ADMIN"
    : String(activeOrganization?.role || "ORG_ADMIN").trim().toUpperCase();

  const dirtySecrets = Object.values(secretDrafts).some((value) => String(value || "").trim()) || Object.values(secretClears).some(Boolean);
  const dirtyConfig = configDraft !== baseConfigDraft;
  const dirty = dirtyConfig || dirtySecrets;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingOrganizations(true);
      try {
        const res = await fetch("/api/auth/organizations", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as OrganizationsPayload & { error?: string };
        if (!res.ok) throw new Error(String(json.error || "Failed to load organizations."));
        if (cancelled) return;
        const rows = Array.isArray(json.organizations) ? json.organizations.filter((row) => row && row.isActive) : [];
        const resolvedActiveId = String(json.activeOrganizationId || rows[0]?.id || "");
        setOrganizations(rows);
        setIsSuperAdmin(!!json.isSuperAdmin);
        setActiveOrganizationId(resolvedActiveId);
        setPendingOrganizationId(resolvedActiveId);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load organizations.");
        setOrganizations([]);
        setActiveOrganizationId("");
        setPendingOrganizationId("");
      } finally {
        if (!cancelled) setLoadingOrganizations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeOrganizationId) return;
    let cancelled = false;
    (async () => {
      setLoadingSettings(true);
      setWarning("");
      setMessage("");
      try {
        const res = await fetch(`/api/admin/organizations/${activeOrganizationId}/settings`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as OrgSettingsResponse;
        if (!res.ok) throw new Error(String(json.error || "Failed to load organization settings."));
        if (cancelled) return;
        const nextConfigDraft = prettyJson(json.settings?.config || {});
        setConfigDraft(nextConfigDraft);
        setBaseConfigDraft(nextConfigDraft);
        setStoredSecretNames(
          Array.isArray(json.secrets)
            ? json.secrets.map((row) => String(row.secretName || "").trim()).filter(Boolean)
            : []
        );
        setSecretDrafts({});
        setSecretClears({});
        setUpdatedAt(String(json.settings?.updatedAt || ""));
        setWarning(String(json.warning || ""));
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load organization settings.");
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId]);

  async function switchOrganization() {
    const nextId = String(pendingOrganizationId || "").trim();
    if (!nextId || nextId === activeOrganizationId || switching) return;
    setSwitching(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/switch-organization", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: nextId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(String(json.error || "Failed to switch organization."));
      setActiveOrganizationId(nextId);
      setPendingOrganizationId(nextId);
      setMessage("Active organization switched.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch organization.");
    } finally {
      setSwitching(false);
    }
  }

  async function saveSettings() {
    if (!activeOrganizationId || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let parsedConfig: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(configDraft || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Configuration JSON must be an object.");
        }
        parsedConfig = parsed as Record<string, unknown>;
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "Configuration JSON is invalid.");
      }

      const secrets: Record<string, string> = {};
      for (const field of SECRET_FIELDS) {
        const draft = String(secretDrafts[field.key] || "").trim();
        if (draft) {
          secrets[field.key] = draft;
          continue;
        }
        if (secretClears[field.key]) {
          secrets[field.key] = "";
        }
      }

      const payload: Record<string, unknown> = { config: parsedConfig };
      if (Object.keys(secrets).length > 0) payload.secrets = secrets;

      const res = await fetch(`/api/admin/organizations/${activeOrganizationId}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as OrgSettingsResponse;
      if (!res.ok) throw new Error(String(json.error || "Failed to save organization settings."));

      const nextConfigDraft = prettyJson(json.settings?.config || parsedConfig);
      setConfigDraft(nextConfigDraft);
      setBaseConfigDraft(nextConfigDraft);
      setStoredSecretNames(
        Array.isArray(json.secrets)
          ? json.secrets.map((row) => String(row.secretName || "").trim()).filter(Boolean)
          : []
      );
      setSecretDrafts({});
      setSecretClears({});
      setUpdatedAt(String(json.settings?.updatedAt || ""));
      setWarning(String(json.warning || ""));
      setMessage("Organization settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save organization settings.");
    } finally {
      setSaving(false);
    }
  }

  function revertDrafts() {
    setConfigDraft(baseConfigDraft);
    setSecretDrafts({});
    setSecretClears({});
    setMessage("Draft reverted to last loaded settings.");
    setError("");
  }

  const settingsNav = (
    <nav aria-label="Settings sections" className="flex flex-wrap items-center gap-2">
      <Link href="/admin/settings/ai" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
        AI
      </Link>
      <Link href="/admin/settings/app" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
        App
      </Link>
      <Link href="/admin/settings/grading" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
        Grading
      </Link>
      <Link href="/admin/settings/organization" aria-current="page" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-400 bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm">
        Organization {dirty ? "•" : ""}
      </Link>
      <Link href="/admin/developer#organization-settings" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
        Developer
      </Link>
      <Link href="/admin/users" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
        Users
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
          Role: {activeRoleLabel}
        </span>
      </div>
    </nav>
  );

  return (
    <div className="mx-auto grid w-full max-w-[1400px] min-w-0 gap-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_0%_0%,#f8fafc_0%,#ffffff_48%)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-slate-100/80 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-900">
              <TinyIcon name="settings" />
              Organization Settings
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Tenant configuration workspace</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage per-organization JSON configuration and encrypted integration secrets in the normal admin settings flow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              <TinyIcon name="status" className="mr-1 h-3 w-3" />
              {loadingOrganizations || loadingSettings ? "Loading..." : "Ready"}
            </span>
          </div>
        </div>
      </section>

      <section className="sticky top-2 z-20 rounded-3xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_20px_rgba(15,23,42,0.05)] backdrop-blur">
        {settingsNav}
        {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}
        {warning ? <p className="mt-2 text-xs text-amber-700">{warning}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Scope</h2>
              <p className="mt-1 text-xs text-slate-600">This page edits the active organization context used by the current session.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingOrganizationId(activeOrganizationId);
                setMessage("");
                setError("");
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              disabled={!dirty}
            >
              Keep current scope
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active organization</span>
              <select
                value={pendingOrganizationId}
                onChange={(event) => setPendingOrganizationId(event.target.value)}
                disabled={loadingOrganizations || !organizations.length}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                {!organizations.length ? <option value="">No organizations</option> : null}
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">{activeOrganization?.name || "No active organization"}</div>
              <div className="mt-1">
                {activeOrganization?.slug ? `Slug: ${activeOrganization.slug}` : "Select an organization to edit tenant settings."}
              </div>
              <div className="mt-1">Session role: {activeRoleLabel}</div>
              {updatedAt ? <div className="mt-1">Last settings update: {new Date(updatedAt).toLocaleString()}</div> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void switchOrganization()}
                disabled={!pendingOrganizationId || pendingOrganizationId === activeOrganizationId || switching || dirty}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                {switching ? "Switching..." : "Switch active org"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!activeOrganizationId) return;
                  setMessage("");
                  setError("");
                  setWarning("");
                  setLoadingSettings(true);
                  fetch(`/api/admin/organizations/${activeOrganizationId}/settings`, {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                  })
                    .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
                    .then(({ ok, json }) => {
                      if (!ok) throw new Error(String(json?.error || "Failed to reload settings."));
                      const nextConfigDraft = prettyJson(json?.settings?.config || {});
                      setConfigDraft(nextConfigDraft);
                      setBaseConfigDraft(nextConfigDraft);
                      setStoredSecretNames(
                        Array.isArray(json?.secrets)
                          ? json.secrets.map((row: { secretName?: string }) => String(row.secretName || "").trim()).filter(Boolean)
                          : []
                      );
                      setSecretDrafts({});
                      setSecretClears({});
                      setUpdatedAt(String(json?.settings?.updatedAt || ""));
                      setWarning(String(json?.warning || ""));
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : "Failed to reload settings."))
                    .finally(() => setLoadingSettings(false));
                }}
                disabled={!activeOrganizationId || loadingSettings}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingSettings ? "Loading..." : "Reload settings"}
              </button>
            </div>

            {dirty ? (
              <p className="text-xs text-amber-700">
                Unsaved changes are present. Save or revert them before switching to another organization.
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Configuration JSON</h2>
              <p className="mt-1 text-xs text-slate-600">Store tenant-specific operational config as audited JSON.</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
              Scope: {activeOrganization?.name || "—"}
            </div>
          </div>

          <label className="mt-4 grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">JSON document</span>
            <textarea
              value={configDraft}
              onChange={(event) => setConfigDraft(event.target.value)}
              rows={14}
              spellCheck={false}
              disabled={!activeOrganizationId}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
            />
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {SECRET_FIELDS.map((field) => (
              <div key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{field.label}</div>
                <input
                  type="password"
                  value={secretDrafts[field.key] || ""}
                  onChange={(event) =>
                    setSecretDrafts((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  disabled={!activeOrganizationId}
                  placeholder={storedSecretNames.includes(field.key) ? `Stored: ${field.key}` : `Enter ${field.label.toLowerCase()}`}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!secretClears[field.key]}
                    onChange={(event) =>
                      setSecretClears((prev) => ({ ...prev, [field.key]: event.target.checked }))
                    }
                    disabled={!activeOrganizationId}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Clear stored key on save
                </label>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
            <div className="font-semibold text-slate-900">Stored key identifiers</div>
            <div className="mt-1 break-words">{storedSecretNames.length ? storedSecretNames.join(", ") : "No keys stored yet."}</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={revertDrafts}
              disabled={!dirty || saving}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            >
              Revert draft
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={!activeOrganizationId || saving}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save organization settings"}
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
