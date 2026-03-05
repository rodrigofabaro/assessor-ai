"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TinyIcon } from "@/components/ui/TinyIcon";

type Organization = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  _count?: { users?: number; memberships?: number };
};

type OrgSettingsResponse = {
  organization?: { id: string; name: string; slug: string; isActive: boolean };
  settings?: { id: string; config?: Record<string, unknown> | null; updatedAt?: string } | null;
  secrets?: Array<{ secretName: string; rotatedAt?: string | null; updatedAt?: string }>;
  warning?: string;
  error?: string;
};

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function DeveloperPageClient() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [configDraft, setConfigDraft] = useState("{}");
  const [openAiKey, setOpenAiKey] = useState("");
  const [turnitinKey, setTurnitinKey] = useState("");
  const [smtpKey, setSmtpKey] = useState("");
  const [secretNames, setSecretNames] = useState<string[]>([]);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === selectedOrgId) || null,
    [organizations, selectedOrgId]
  );

  const loadOrganizations = useCallback(async () => {
    setLoadingOrganizations(true);
    setError("");
    try {
      const res = await fetch("/api/admin/organizations", { cache: "no-store" });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(String(json?.error || "Failed to load organizations."));
      }
      const rows = Array.isArray(json?.organizations) ? (json.organizations as Organization[]) : [];
      setOrganizations(rows);
      setSelectedOrgId((prev) => (prev && rows.some((org) => org.id === prev) ? prev : String(rows[0]?.id || "")));
      if (json?.warning) {
        setMessage(String(json.warning));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organizations.");
    } finally {
      setLoadingOrganizations(false);
    }
  }, []);

  const loadSettings = useCallback(async (orgId: string) => {
    const targetOrgId = String(orgId || "").trim();
    if (!targetOrgId) {
      setConfigDraft("{}");
      setSecretNames([]);
      setOpenAiKey("");
      setTurnitinKey("");
      setSmtpKey("");
      return;
    }
    setLoadingSettings(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/organizations/${targetOrgId}/settings`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as OrgSettingsResponse;
      if (!res.ok) {
        throw new Error(String(json?.error || "Failed to load organization settings."));
      }
      setConfigDraft(prettyJson(json.settings?.config || {}));
      const names = Array.isArray(json.secrets)
        ? json.secrets.map((row) => String(row.secretName || "").trim()).filter(Boolean)
        : [];
      setSecretNames(names);
      setOpenAiKey("");
      setTurnitinKey("");
      setSmtpKey("");
      if (json.warning) setMessage(String(json.warning));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organization settings.");
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    if (!selectedOrgId) return;
    void loadSettings(selectedOrgId);
  }, [selectedOrgId, loadSettings]);

  async function createOrganization() {
    const name = orgName.trim();
    if (!name) return;
    setCreatingOrg(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug: orgSlug.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to create organization."));
      }
      const created = json?.organization as Organization | undefined;
      setOrgName("");
      setOrgSlug("");
      setMessage("Organization created.");
      await loadOrganizations();
      if (created?.id) setSelectedOrgId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create organization.");
    } finally {
      setCreatingOrg(false);
    }
  }

  async function renameOrganization(org: Organization) {
    const proposedName = window.prompt("New organization name", org.name);
    if (proposedName === null) return;
    const name = String(proposedName || "").trim();
    if (!name || name === org.name) return;
    setPendingOrgId(org.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to rename organization."));
      }
      setMessage("Organization renamed.");
      await loadOrganizations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename organization.");
    } finally {
      setPendingOrgId(null);
    }
  }

  async function toggleOrganizationActive(org: Organization) {
    const nextActive = !org.isActive;
    const confirmation = nextActive
      ? `Reactivate organization "${org.name}"?`
      : `Deactivate organization "${org.name}"?`;
    if (!window.confirm(confirmation)) return;
    setPendingOrgId(org.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to update organization."));
      }
      setMessage(nextActive ? "Organization reactivated." : "Organization deactivated.");
      await loadOrganizations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update organization.");
    } finally {
      setPendingOrgId(null);
    }
  }

  async function deleteOrganization(org: Organization) {
    if (!window.confirm(`Delete organization "${org.name}"? This only works when no related data exists.`)) return;
    setPendingOrgId(org.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to delete organization."));
      }
      setMessage("Organization deleted.");
      await loadOrganizations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete organization.");
    } finally {
      setPendingOrgId(null);
    }
  }

  async function saveSettings() {
    if (!selectedOrgId || savingSettings) return;
    setSavingSettings(true);
    setError("");
    setMessage("");
    try {
      const parsed = JSON.parse(configDraft || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Configuration must be a JSON object.");
      }
      const res = await fetch(`/api/admin/organizations/${selectedOrgId}/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: parsed,
          secrets: {
            OPENAI_API_KEY: openAiKey.trim(),
            TURNITIN_API_KEY: turnitinKey.trim(),
            SMTP_API_KEY: smtpKey.trim(),
          },
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to save organization settings."));
      }
      setMessage("Organization settings saved.");
      await loadSettings(selectedOrgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save organization settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] min-w-0 gap-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_0%_0%,#f1f5f9_0%,#ffffff_46%)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-900">
              <TinyIcon name="settings" />
              Developer Console
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Super Admin Platform Controls</h1>
            <p className="mt-1 text-sm text-slate-600">
              Centralize organization lifecycle, tenant configuration, and integration secrets.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadOrganizations()}
              disabled={loadingOrganizations}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <TinyIcon name="refresh" className="h-3.5 w-3.5" />
              {loadingOrganizations ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/admin/users" className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Users
            </Link>
            <Link href="/admin/settings/ai" className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              AI settings
            </Link>
          </div>
        </div>
      </section>

      {(error || message) && (
        <section
          className={
            "rounded-2xl border p-3 text-sm " +
            (error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")
          }
        >
          {error || message}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <article id="organization-management" className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <h2 className="text-sm font-semibold text-slate-900">Organization lifecycle</h2>
          <p className="mt-1 text-xs text-slate-600">Create, rename, activate/deactivate, and cleanly retire organizations.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              placeholder="New organization name"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
            <input
              value={orgSlug}
              onChange={(event) => setOrgSlug(event.target.value)}
              placeholder="Slug (optional)"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
            <button
              type="button"
              onClick={createOrganization}
              disabled={!orgName.trim() || creatingOrg}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            >
              {creatingOrg ? "Creating..." : "Create"}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {organizations.map((org) => (
              <div key={org.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">
                    {org.name}{" "}
                    {!org.isActive ? (
                      <span className="rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-slate-500">
                    {org.slug} · users {Number(org._count?.users || 0)} · memberships {Number(org._count?.memberships || 0)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void renameOrganization(org)}
                    disabled={pendingOrgId === org.id}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleOrganizationActive(org)}
                    disabled={pendingOrgId === org.id}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {org.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteOrganization(org)}
                    disabled={pendingOrgId === org.id}
                    className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!organizations.length ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No organizations available.
              </div>
            ) : null}
          </div>
        </article>

        <article id="organization-settings" className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <h2 className="text-sm font-semibold text-slate-900">Organization configuration</h2>
          <p className="mt-1 text-xs text-slate-600">Per-organization JSON settings and encrypted secret keys.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</span>
              <select
                value={selectedOrgId}
                onChange={(event) => setSelectedOrgId(event.target.value)}
                disabled={!organizations.length}
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">Scope</div>
              <div className="mt-1">Active org: {selectedOrg?.name || "—"}</div>
            </div>
          </div>

          <label className="mt-3 grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuration JSON</span>
            <textarea
              value={configDraft}
              onChange={(event) => setConfigDraft(event.target.value)}
              rows={12}
              spellCheck={false}
              disabled={!selectedOrgId}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
            />
          </label>

          <div className="mt-3 grid gap-3">
            <input
              type="password"
              value={openAiKey}
              onChange={(event) => setOpenAiKey(event.target.value)}
              placeholder="OpenAI API key (optional)"
              disabled={!selectedOrgId}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            />
            <input
              type="password"
              value={turnitinKey}
              onChange={(event) => setTurnitinKey(event.target.value)}
              placeholder="Turnitin API key (optional)"
              disabled={!selectedOrgId}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            />
            <input
              type="password"
              value={smtpKey}
              onChange={(event) => setSmtpKey(event.target.value)}
              placeholder="SMTP/API key (optional)"
              disabled={!selectedOrgId}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            />
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div className="font-semibold text-slate-900">Stored key identifiers</div>
            <div className="mt-1 break-words">{secretNames.length ? secretNames.join(", ") : "No keys stored yet."}</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadSettings(selectedOrgId)}
              disabled={loadingSettings || !selectedOrgId}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingSettings ? "Loading..." : "Reload"}
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={savingSettings || !selectedOrgId}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingSettings ? "Saving..." : "Save settings"}
            </button>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-700 shadow-sm">
        <div className="font-semibold text-slate-900">Developer tools</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/admin/users" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            User directory and password recovery
          </Link>
          <Link href="/admin/settings/ai" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            AI model and grading settings
          </Link>
          <Link href="/admin/specs" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            Specification import and breakdown
          </Link>
          <Link href="/admin/audit" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            Audit logs
          </Link>
        </div>
      </section>
    </div>
  );
}

