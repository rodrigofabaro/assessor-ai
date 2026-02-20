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
  createdAt: string;
};

type AppConfig = {
  activeAuditUserId?: string | null;
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

function formatCreatedAt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function roleTone(role: string) {
  const key = String(role || "").toUpperCase();
  if (key === "ADMIN") return "border-amber-200 bg-amber-50 text-amber-900";
  if (key === "IV") return "border-indigo-200 bg-indigo-50 text-indigo-900";
  if (key === "TUTOR") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeAuditUserId, setActiveAuditUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ADMIN");

  const activeUser = useMemo(() => users.find((u) => u.id === activeAuditUserId) || null, [users, activeAuditUserId]);
  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  const byRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) map.set(u.role, (map.get(u.role) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [users]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [uRes, cRes] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/app-config", { cache: "no-store" }),
      ]);
      const uJson = await uRes.json();
      const cJson = (await cRes.json()) as AppConfig;
      setUsers(Array.isArray(uJson?.users) ? uJson.users : []);
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

  async function createUser() {
    if (!fullName.trim()) return;
    setSubmitting(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim() || null, role: role.trim() || "ADMIN" }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error || "Failed to create user.");
        return;
      }
      setMsg("User created.");
      setFullName("");
      setEmail("");
      await load();
    } finally {
      setSubmitting(false);
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
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Users & Audit Identity</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage assessor identities and choose the active audit actor used across grading and feedback records.
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
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              <TinyIcon name="status" className="mr-1 h-3 w-3" />
              {loading ? "Loading users..." : "Ready"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Users total" value={users.length} hint="All system user identities." />
          <MetricCard label="Users active" value={activeUsers.length} hint="Users currently available for actor selection." />
          <MetricCard label="Roles in use" value={byRole.length} hint="Distinct role groups assigned." />
          <MetricCard label="Active auditor" value={activeUser?.fullName || "system"} hint="Current actor used in audit/grading metadata." />
        </div>
      </section>

      {(err || msg) && (
        <section className={"rounded-2xl border p-3 text-sm " + (err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
          {err || msg}
        </section>
      )}

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
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <h2 className="text-sm font-semibold text-slate-900">Create user</h2>
          <div className="mt-3 grid gap-3">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
              <option value="ADMIN">ADMIN</option>
              <option value="TUTOR">TUTOR</option>
              <option value="IV">IV</option>
            </select>
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
          <div className="text-xs text-slate-600">Set active assessor and enable/disable accounts.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Name</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Email</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Role</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Status</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Created</th>
                <th className="border-b border-slate-200 px-2 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!users.length && !loading ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-sm text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{u.fullName}</td>
                  <td className="px-2 py-2 text-slate-700">{u.email || "—"}</td>
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
                  <td className="px-2 py-2 text-slate-600">{formatCreatedAt(u.createdAt)}</td>
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
