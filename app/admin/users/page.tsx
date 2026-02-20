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
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900">{value}</div>
      <p className="mt-1 text-xs text-zinc-600">{hint}</p>
    </article>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeAuditUserId, setActiveAuditUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
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
    setErr("");
    setMsg("");
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
  }

  async function setActiveAuditUser(userId: string) {
    setErr("");
    setMsg("");
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
  }

  async function toggleActive(u: AppUser) {
    setErr("");
    setMsg("");
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
  }

  return (
    <div className="grid min-w-0 gap-4">
      <section className="rounded-2xl border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-white to-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-900">
              <TinyIcon name="users" />
              Identity Operations
            </div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Users & Audit Identity</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Manage assessor identities and choose the active audit actor used across grading and feedback records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
            >
              <TinyIcon name="refresh" className="h-3.5 w-3.5" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/admin/settings" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
              <TinyIcon name="settings" className="h-3.5 w-3.5" />
              Open settings
            </Link>
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              <TinyIcon name="status" className="mr-1 h-3 w-3" />
              {loading ? "Loading users..." : "Ready"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Users total" value={users.length} hint="All system user identities." />
          <MetricCard label="Users active" value={activeUsers.length} hint="Users currently available for actor selection." />
          <MetricCard label="Roles in use" value={byRole.length} hint="Distinct role groups assigned." />
          <MetricCard label="Active auditor" value={activeUser?.fullName || "system"} hint="Current actor used in audit/grading metadata." />
        </div>
      </section>

      {(err || msg) && (
        <section className={"rounded-xl border p-3 text-sm " + (err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
          {err || msg}
        </section>
      )}

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Active audit user</h2>
          <p className="mt-1 text-sm text-zinc-600">This identity appears as assessor/audit actor when no explicit actor is supplied.</p>
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Current</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {activeUser ? `${activeUser.fullName} (${activeUser.role})` : "system"}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Create user</h2>
          <div className="mt-3 grid gap-3">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="h-10 rounded-xl border border-zinc-300 px-3 text-sm" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-xl border border-zinc-300 px-3 text-sm">
              <option value="ADMIN">ADMIN</option>
              <option value="TUTOR">TUTOR</option>
              <option value="IV">IV</option>
            </select>
          </div>
          <button
            type="button"
            onClick={createUser}
            disabled={!fullName.trim()}
            className="mt-3 inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-700"
          >
            Create user
          </button>
        </article>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">User directory</div>
          <div className="text-xs text-zinc-600">Set active assessor and enable/disable accounts.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-600">
                <th className="border-b border-zinc-200 px-2 py-2 font-semibold">Name</th>
                <th className="border-b border-zinc-200 px-2 py-2 font-semibold">Email</th>
                <th className="border-b border-zinc-200 px-2 py-2 font-semibold">Role</th>
                <th className="border-b border-zinc-200 px-2 py-2 font-semibold">Status</th>
                <th className="border-b border-zinc-200 px-2 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-medium text-zinc-900">{u.fullName}</td>
                  <td className="px-2 py-2 text-zinc-700">{u.email || "—"}</td>
                  <td className="px-2 py-2 text-zinc-700">{u.role}</td>
                  <td className="px-2 py-2 text-zinc-700">{u.isActive ? "Active" : "Disabled"}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveAuditUser(u.id)}
                        className={
                          "rounded-lg border px-2 py-1 text-xs font-semibold " +
                          (activeAuditUserId === u.id
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100")
                        }
                      >
                        {activeAuditUserId === u.id ? "Active assessor" : "Set active"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      >
                        {u.isActive ? "Disable" : "Enable"}
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
