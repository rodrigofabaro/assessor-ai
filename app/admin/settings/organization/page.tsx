"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TinyIcon } from "@/components/ui/TinyIcon";

type OrgOption = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  role?: string;
  isDefault?: boolean;
};

type OrgSettingsResponse = {
  organization?: { id: string; name: string; slug: string; isActive: boolean };
  settings?: { id: string; config?: Record<string, unknown> | null; updatedAt?: string } | null;
  secrets?: Array<{ secretName: string; rotatedAt?: string | null; updatedAt?: string }>;
  warning?: string;
};

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function OrganizationSettingsPage() {
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setError("");
    try {
      const res = await fetch("/api/auth/organizations", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        organizations?: OrgOption[];
        activeOrganizationId?: string | null;
      };
      if (!res.ok) {
        throw new Error("Failed to load organization access.");
      }
      const rows = Array.isArray(json.organizations) ? json.organizations : [];
      const activeRows = rows.filter((org) => org.isActive);
      setOrganizations(activeRows);
      setSelectedOrgId((prev) => {
        if (prev && activeRows.some((org) => org.id === prev)) return prev;
        return String(json.activeOrganizationId || activeRows[0]?.id || "");
      });
      if (!activeRows.length) {
        setConfigDraft("{}");
        setSecretNames([]);
        setMessage("No active organization is linked to this account yet.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load organization access.";
      setError(message);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/organizations/${selectedOrgId}/settings`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as OrgSettingsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(String(json.error || "Failed to load organization settings."));
      }
      setConfigDraft(prettyJson(json.settings?.config || {}));
      const names = Array.isArray(json.secrets)
        ? json.secrets.map((row) => String(row.secretName || "").trim()).filter(Boolean)
        : [];
      setSecretNames(names);
      if (json.warning) {
        setMessage(String(json.warning));
      }
      setOpenAiKey("");
      setTurnitinKey("");
      setSmtpKey("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load organization settings.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    if (!selectedOrgId || saving) return;
    setSaving(true);
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
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to save organization settings."));
      }
      setMessage("Organization settings saved.");
      await loadSettings();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save organization settings.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] min-w-0 gap-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_0%_0%,#f1f5f9_0%,#ffffff_46%)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-900">
              <TinyIcon name="settings" />
              Organization Configuration
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Organization Settings</h1>
            <p className="mt-1 text-sm text-slate-600">
              Per-organization configuration and integration keys.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/settings/ai"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back to system settings
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</span>
            <select
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              disabled={!organizations.length}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              {!organizations.length ? <option value="">No active organizations</option> : null}
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div className="font-semibold text-slate-900">Scope</div>
            <div className="mt-1">
              Active org: {selectedOrg?.name || "—"} {selectedOrg?.role ? `· role ${selectedOrg.role}` : ""}
            </div>
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

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-slate-900">Organization config JSON</h2>
        <p className="mt-1 text-xs text-slate-600">
          Structured settings for this organization only.
        </p>
        <textarea
          value={configDraft}
          onChange={(event) => setConfigDraft(event.target.value)}
          rows={12}
          spellCheck={false}
          disabled={!selectedOrgId}
          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
        />
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-slate-900">Organization secret keys</h2>
        <p className="mt-1 text-xs text-slate-600">
          Keys are encrypted at rest and never returned in plain text.
        </p>
        <div className="mt-3 grid gap-3">
          <input
            type="password"
            placeholder="OpenAI API key (leave empty to keep current value)"
            value={openAiKey}
            onChange={(event) => setOpenAiKey(event.target.value)}
            disabled={!selectedOrgId}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
          <input
            type="password"
            placeholder="Turnitin API key (leave empty to keep current value)"
            value={turnitinKey}
            onChange={(event) => setTurnitinKey(event.target.value)}
            disabled={!selectedOrgId}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
          <input
            type="password"
            placeholder="SMTP/API key (leave empty to keep current value)"
            value={smtpKey}
            onChange={(event) => setSmtpKey(event.target.value)}
            disabled={!selectedOrgId}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div className="font-semibold text-slate-900">Stored key identifiers</div>
          <div className="mt-1">{secretNames.length ? secretNames.join(", ") : "No keys stored yet."}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadSettings()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Reload"}
          </button>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving || !selectedOrgId}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save organization settings"}
          </button>
        </div>
      </section>
    </div>
  );
}
