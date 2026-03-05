"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TinyIcon } from "@/components/ui/TinyIcon";

type AppUser = {
  id: string;
  fullName: string;
  email?: string | null;
  role: string;
  isActive: boolean;
  loginEnabled: boolean;
  passwordUpdatedAt?: string | null;
  mustResetPassword: boolean;
  organizationId?: string | null;
  organization?: {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  } | null;
  createdAt: string;
};

type Organization = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  _count?: { users?: number; memberships?: number };
};

type AppConfig = {
  activeAuditUserId?: string | null;
};

type InviteEmailSupport = {
  provider: string;
  configured: boolean;
  enabledByDefault: boolean;
};

type AuthEmailHealth = {
  provider: string;
  configured: boolean;
  requireRecoveryEmail: boolean;
  fromConfigured: boolean;
  fromPreview?: string | null;
};

type InviteEmailResult = {
  attempted: boolean;
  sent: boolean;
  provider: string;
  id?: string;
  error?: string;
};

type IssuedCredentials = {
  fullName: string;
  email: string;
  password: string;
  mailto: string | null;
  source: string;
};

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_20px_rgba(15,23,42,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      <p className="mt-1 text-xs text-slate-600">{hint}</p>
    </article>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function roleTone(role: string) {
  const key = String(role || "").toUpperCase();
  if (key === "ADMIN") return "border-amber-200 bg-amber-50 text-amber-900";
  if (key === "IV") return "border-indigo-200 bg-indigo-50 text-indigo-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function generatePasswordClient(length = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*_-";
  const out: string[] = [];
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(Math.max(12, Math.min(64, length)));
    window.crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i += 1) out.push(chars[bytes[i] % chars.length]);
    return out.join("");
  }
  for (let i = 0; i < Math.max(12, Math.min(64, length)); i += 1) {
    out.push(chars[Math.floor(Math.random() * chars.length)]);
  }
  return out.join("");
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [managedOrganizations, setManagedOrganizations] = useState<Organization[]>([]);
  const [canManageAllOrganizations, setCanManageAllOrganizations] = useState(false);
  const [defaultOrganizationId, setDefaultOrganizationId] = useState<string>("");
  const [activeAuditUserId, setActiveAuditUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [issuedCreds, setIssuedCreds] = useState<IssuedCredentials | null>(null);
  const [inviteSupport, setInviteSupport] = useState<InviteEmailSupport>({
    provider: "none",
    configured: false,
    enabledByDefault: false,
  });
  const [emailHealth, setEmailHealth] = useState<AuthEmailHealth | null>(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ADMIN");
  const [organizationId, setOrganizationId] = useState("");
  const [loginEnabled, setLoginEnabled] = useState(true);
  const [password, setPassword] = useState("");
  const [sendInviteEmailNow, setSendInviteEmailNow] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);

  const activeUser = useMemo(() => users.find((u) => u.id === activeAuditUserId) || null, [users, activeAuditUserId]);
  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  const loginUsers = useMemo(() => users.filter((u) => u.loginEnabled && u.isActive).length, [users]);
  const byRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) map.set(u.role, (map.get(u.role) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [users]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [uRes, cRes, eRes] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/app-config", { cache: "no-store" }),
        fetch("/api/admin/auth/email-health", { cache: "no-store" }),
      ]);
      const [uJson, cJson, eJson] = await Promise.all([
        uRes.json(),
        cRes.json() as Promise<AppConfig>,
        eRes.json().catch(() => ({} as any)),
      ]);
      setUsers(Array.isArray(uJson?.users) ? uJson.users : []);
      const canManageAll = !!uJson?.canManageAllOrganizations;
      setCanManageAllOrganizations(canManageAll);
      const orgRows = Array.isArray(uJson?.organizations) ? (uJson.organizations as Organization[]) : [];
      setOrganizations(orgRows);
      if (canManageAll) {
        const orgRes = await fetch("/api/admin/organizations", { cache: "no-store" });
        const orgPayload = await orgRes.json().catch(() => ({} as any));
        if (orgRes.ok && Array.isArray(orgPayload?.organizations)) {
          setManagedOrganizations(orgPayload.organizations as Organization[]);
        } else {
          setManagedOrganizations(orgRows);
        }
      } else {
        setManagedOrganizations(orgRows);
      }
      const fallbackOrg = String(uJson?.defaultOrganizationId || orgRows[0]?.id || "");
      setDefaultOrganizationId(fallbackOrg);
      setOrganizationId((prev) => prev || fallbackOrg);
      if (uJson?.inviteEmail && typeof uJson.inviteEmail === "object") {
        const ui = uJson.inviteEmail as InviteEmailSupport;
        setInviteSupport({
          provider: String(ui.provider || "none"),
          configured: !!ui.configured,
          enabledByDefault: !!ui.enabledByDefault,
        });
        setSendInviteEmailNow(!!ui.enabledByDefault);
      }
      if (eRes.ok && eJson?.readiness) {
        setEmailHealth(eJson.readiness as AuthEmailHealth);
      } else {
        setEmailHealth(null);
      }
      setActiveAuditUserId(String(cJson?.activeAuditUserId || ""));
    } catch (e: any) {
      setErr(e?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openInviteDraft(mailto: string | null | undefined) {
    if (!mailto) return;
    window.location.href = mailto;
  }

  async function sendEmailTest() {
    const to = String(testEmailTo || "").trim();
    if (!to || sendingTestEmail) return;
    setSendingTestEmail(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/auth/email-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || "Failed to send test email."));
        return;
      }
      setMsg(`Test email sent via ${String(json?.provider || "provider")}.`);
    } finally {
      setSendingTestEmail(false);
    }
  }

  function applyInviteEmailResult(result: InviteEmailResult | null | undefined) {
    if (!result || !result.attempted) return;
    if (result.sent) {
      setMsg(`Invite email sent via ${result.provider}.`);
      return;
    }
    setErr(result.error || "Failed to send invite email.");
  }

  async function createUser() {
    if (!fullName.trim()) return;
    setSubmitting(true);
    setErr("");
    setMsg("");
    setIssuedCreds(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim() || null,
          role: role.trim() || "ADMIN",
          organizationId: organizationId || defaultOrganizationId || null,
          loginEnabled,
          password: loginEnabled ? password.trim() || undefined : undefined,
          generatePassword: loginEnabled && !password.trim(),
          sendInviteEmail: loginEnabled && sendInviteEmailNow,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error || "Failed to create user.");
        return;
      }
      setMsg("User created.");
      applyInviteEmailResult((json?.inviteEmail || null) as InviteEmailResult | null);
      if (json?.issuedPassword && json?.user?.email) {
        setIssuedCreds({
          fullName: String(json.user.fullName || ""),
          email: String(json.user.email || ""),
          password: String(json.issuedPassword || ""),
          mailto: typeof json.inviteMailto === "string" ? json.inviteMailto : null,
          source: "Created user credentials",
        });
      }
      setFullName("");
      setEmail("");
      setPassword("");
      setOrganizationId(defaultOrganizationId || organizationId);
      setLoginEnabled(true);
      setSendInviteEmailNow(inviteSupport.enabledByDefault);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function createOrganization() {
    const name = orgName.trim();
    if (!name) return;
    setCreatingOrg(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: orgSlug.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || "Failed to create organization.");
        return;
      }
      const created = json?.organization as Organization | undefined;
      setOrgName("");
      setOrgSlug("");
      if (created?.id) {
        setOrganizationId(created.id);
      }
      setMsg("Organization created.");
      await load();
    } finally {
      setCreatingOrg(false);
    }
  }

  async function renameOrganization(org: Organization) {
    const nextName = window.prompt("New organization name", org.name);
    if (nextName === null) return;
    const name = String(nextName || "").trim();
    if (!name || name === org.name) return;
    setPendingOrgId(org.id);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || "Failed to rename organization."));
        return;
      }
      setMsg("Organization updated.");
      await load();
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
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || "Failed to update organization status."));
        return;
      }
      setMsg(nextActive ? "Organization reactivated." : "Organization deactivated.");
      await load();
    } finally {
      setPendingOrgId(null);
    }
  }

  async function deleteOrganization(org: Organization) {
    if (!window.confirm(`Delete organization "${org.name}"? This only works when it has no related data.`)) return;
    setPendingOrgId(org.id);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || "Failed to delete organization."));
        return;
      }
      setMsg("Organization deleted.");
      await load();
    } finally {
      setPendingOrgId(null);
    }
  }

  async function setActiveAuditUser(userId: string) {
    setPendingUserId(userId);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeAuditUserId: userId || null }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error || "Failed to set active audit user.");
        return;
      }
      setActiveAuditUserId(userId);
      setMsg("Active audit user updated.");
    } finally {
      setPendingUserId(null);
    }
  }

  async function toggleActive(u: AppUser) {
    setPendingUserId(u.id);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error || "Failed to update user.");
        return;
      }
      setMsg("User updated.");
      await load();
    } finally {
      setPendingUserId(null);
    }
  }

  async function toggleLogin(u: AppUser, sendEmail = false) {
    if (!u.loginEnabled && !u.email) {
      setErr("Cannot enable login for a user without email.");
      return;
    }
    setPendingUserId(u.id);
    setErr("");
    setMsg("");
    setIssuedCreds(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginEnabled: !u.loginEnabled,
          generatePassword: !u.loginEnabled,
          sendInviteEmail: !u.loginEnabled && sendEmail,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error || "Failed to update login access.");
        return;
      }
      setMsg(u.loginEnabled ? "Login access disabled." : "Login access enabled.");
      applyInviteEmailResult((json?.inviteEmail || null) as InviteEmailResult | null);
      if (json?.issuedPassword && json?.user?.email) {
        setIssuedCreds({
          fullName: String(json.user.fullName || u.fullName),
          email: String(json.user.email || u.email || ""),
          password: String(json.issuedPassword || ""),
          mailto: typeof json.inviteMailto === "string" ? json.inviteMailto : null,
          source: "Generated login credentials",
        });
      }
      await load();
    } finally {
      setPendingUserId(null);
    }
  }

  async function resetPassword(u: AppUser, sendEmail = inviteSupport.configured) {
    if (!u.email) {
      setErr("Cannot reset password for a user without email.");
      return;
    }
    setPendingUserId(u.id);
    setErr("");
    setMsg("");
    setIssuedCreds(null);
    try {
      if (sendEmail) {
        const recoveryRes = await fetch("/api/auth/password-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u.email }),
        });
        const recoveryJson = await recoveryRes.json().catch(() => ({} as any));
        if (!recoveryRes.ok) {
          const recoveryCode = String(recoveryJson?.code || "").trim();
          if (recoveryCode === "AUTH_PASSWORD_RECOVERY_STORAGE_UNAVAILABLE") {
            const fallbackRes = await fetch(`/api/admin/users/${u.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ loginEnabled: true, generatePassword: true, sendInviteEmail: true }),
            });
            const fallbackJson = await fallbackRes.json().catch(() => ({} as any));
            if (!fallbackRes.ok || !fallbackJson?.ok) {
              setErr(fallbackJson?.error || recoveryJson?.error || "Failed to issue fallback reset credentials.");
              return;
            }
            setMsg("Recovery-link storage not migrated yet. Temporary reset credentials were emailed.");
            applyInviteEmailResult((fallbackJson?.inviteEmail || null) as InviteEmailResult | null);
            if (fallbackJson?.issuedPassword) {
              setIssuedCreds({
                fullName: String(fallbackJson.user?.fullName || u.fullName),
                email: String(fallbackJson.user?.email || u.email || ""),
                password: String(fallbackJson.issuedPassword),
                mailto: typeof fallbackJson.inviteMailto === "string" ? fallbackJson.inviteMailto : null,
                source: "Fallback password reset credentials",
              });
            }
            await load();
            return;
          }
          setErr(recoveryJson?.error || "Failed to send password recovery email.");
          return;
        }
        setMsg("Password recovery email sent.");
        await load();
        return;
      }

      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginEnabled: true, generatePassword: true, sendInviteEmail: sendEmail }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error || "Failed to reset password.");
        return;
      }
      setMsg(sendEmail ? "Password reset and login credentials emailed." : "Password reset and login credentials issued.");
      applyInviteEmailResult((json?.inviteEmail || null) as InviteEmailResult | null);
      if (json?.issuedPassword) {
        setIssuedCreds({
          fullName: String(json.user?.fullName || u.fullName),
          email: String(json.user?.email || u.email || ""),
          password: String(json.issuedPassword),
          mailto: typeof json.inviteMailto === "string" ? json.inviteMailto : null,
          source: sendEmail ? "Password reset credentials (email sent)" : "Password reset credentials",
        });
      }
      await load();
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] min-w-0 gap-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_0%_0%,#f1f5f9_0%,#ffffff_46%)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-slate-100/80 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-900">
              <TinyIcon name="users" />
              Identity Operations
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Users & Login Access</h1>
            <p className="mt-1 text-sm text-slate-600">
              Create users, issue passwords, reset credentials, and set the active audit actor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <TinyIcon name="refresh" className="h-3.5 w-3.5" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/admin/settings/app" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
              <TinyIcon name="settings" className="h-3.5 w-3.5" />
              Open app settings
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Users total" value={users.length} hint="All system user identities." />
          <MetricCard label="Users active" value={activeUsers.length} hint="Users currently available for actor selection." />
          <MetricCard label="Login enabled" value={loginUsers} hint="Active users with login credentials." />
          <MetricCard label="Roles in use" value={byRole.length} hint="Distinct role groups assigned." />
          <MetricCard label="Organizations" value={organizations.length} hint="Active tenant groups available for user assignment." />
        </div>
      </section>

      {(err || msg) && (
        <section className={"rounded-2xl border p-3 text-sm " + (err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
          {err || msg}
        </section>
      )}

      {issuedCreds ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <div className="font-semibold">{issuedCreds.source}</div>
          <div className="mt-1">User: {issuedCreds.fullName}</div>
          <div>Username: {issuedCreds.email}</div>
          <div>Password: <span className="font-mono">{issuedCreds.password}</span></div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(issuedCreds.password).catch(() => {})}
              className="inline-flex h-8 items-center rounded-lg border border-sky-300 bg-white px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100"
            >
              Copy password
            </button>
            {issuedCreds.mailto ? (
              <button
                type="button"
                onClick={() => openInviteDraft(issuedCreds.mailto)}
                className="inline-flex h-8 items-center rounded-lg border border-sky-300 bg-white px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100"
              >
                Open email draft
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <h2 className="text-sm font-semibold text-slate-900">Active audit user</h2>
          <p className="mt-1 text-sm text-slate-600">This identity appears as assessor/audit actor when no explicit actor is supplied.</p>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {activeUser ? `${activeUser.fullName} (${activeUser.role})` : "system"}
            </div>
          </div>
          {canManageAllOrganizations ? (
            <div id="organization-management" className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organizations</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="New organization name"
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
                <input
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder="Slug (optional)"
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
                <button
                  type="button"
                  onClick={createOrganization}
                  disabled={creatingOrg || !orgName.trim()}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingOrg ? "Creating..." : "Add org"}
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {managedOrganizations.map((org) => (
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
                {!managedOrganizations.length ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    No organizations found.
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Organization creation is restricted to SUPER_ADMIN.
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <h2 className="text-sm font-semibold text-slate-900">Create user</h2>
          <p className="mt-1 text-xs text-slate-500">
            Email provider: <span className="font-medium text-slate-700">{inviteSupport.provider}</span>{" "}
            {inviteSupport.configured ? "(configured)" : "(not configured)"}
          </p>
          {emailHealth ? (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div>From: {emailHealth.fromPreview || "not set"}</div>
              <div>Recovery contract: {emailHealth.requireRecoveryEmail ? "enforced" : "not enforced"}</div>
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder="Test recipient email"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
            <button
              type="button"
              onClick={sendEmailTest}
              disabled={!testEmailTo.trim() || sendingTestEmail || !inviteSupport.configured}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingTestEmail ? "Sending..." : "Send test email"}
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (required for login)" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
              <option value="ADMIN">ADMIN</option>
              <option value="ASSESSOR">ASSESSOR</option>
              <option value="IV">IV</option>
            </select>
            <select
              value={organizationId || defaultOrganizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={loginEnabled}
                onChange={(e) => setLoginEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Enable login access
            </label>
            {loginEnabled ? (
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (leave empty to auto-generate)"
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
                <button
                  type="button"
                  onClick={() => setPassword(generatePasswordClient())}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Generate
                </button>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={sendInviteEmailNow}
                    onChange={(e) => setSendInviteEmailNow(e.target.checked)}
                    disabled={!inviteSupport.configured}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-50"
                  />
                  Send invite email with credentials
                </label>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={createUser}
            disabled={!fullName.trim() || submitting}
            className="mt-3 inline-flex h-10 items-center rounded-xl border border-slate-800 bg-slate-800 px-4 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {submitting ? "Creating..." : "Create user"}
          </button>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">User directory</div>
          <div className="text-xs text-slate-600">Enable login and reset passwords per user.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Name</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Email</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Organization</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Role</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Status</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Login</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Created</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!users.length && !loading ? (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-sm text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{u.fullName}</td>
                  <td className="px-2 py-2 text-slate-700">{u.email || "—"}</td>
                  <td className="px-2 py-2 text-slate-700">{u.organization?.name || "Default"}</td>
                  <td className="px-2 py-2 text-slate-700">
                    <span className={"inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " + roleTone(u.role)}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-700">
                    <span
                      className={
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " +
                        (u.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-100 text-slate-700")
                      }
                    >
                      {u.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-700">
                    <div>{u.loginEnabled ? "Enabled" : "Disabled"}</div>
                    <div className="text-slate-500">Pwd: {formatDate(u.passwordUpdatedAt)}</div>
                    {u.mustResetPassword ? <div className="text-amber-700">Reset required</div> : null}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{formatDate(u.createdAt)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveAuditUser(u.id)}
                        disabled={pendingUserId === u.id || !u.isActive}
                        className={
                          "rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 " +
                          (activeAuditUserId === u.id
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200")
                        }
                      >
                        {activeAuditUserId === u.id ? "Active assessor" : "Set active"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        disabled={pendingUserId === u.id}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingUserId === u.id ? "Saving..." : u.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLogin(u, false)}
                        disabled={pendingUserId === u.id}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {u.loginEnabled ? "Disable login" : "Enable login"}
                      </button>
                      {!u.loginEnabled && inviteSupport.configured ? (
                        <button
                          type="button"
                          onClick={() => toggleLogin(u, true)}
                          disabled={pendingUserId === u.id}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Enable + email
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => resetPassword(u)}
                        disabled={pendingUserId === u.id || !u.email}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {inviteSupport.configured ? "Send reset link" : "Reset password"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
