"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeAuditUserId, setActiveAuditUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ADMIN");

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeAuditUserId) || null,
    [users, activeAuditUserId]
  );

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
      body: JSON.stringify({
        fullName: fullName.trim(),
        email: email.trim() || null,
        role: role.trim() || "ADMIN",
      }),
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
    <div className="grid gap-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Users</h1>
        <p className="mt-1 text-sm text-zinc-700">
          Manage audit users now; these identities are used as actor names in upload/link/grading events.
        </p>
      </section>

      {(err || msg) && (
        <section className={"rounded-xl border p-3 text-sm " + (err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
          {err || msg}
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Active audit user</div>
        <div className="mt-1 text-sm text-zinc-600">
          Current: {activeUser ? `${activeUser.fullName} (${activeUser.role})` : "system"}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Create user</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="TUTOR">TUTOR</option>
            <option value="IV">IV</option>
          </select>
        </div>
        <button
          type="button"
          onClick={createUser}
          disabled={!fullName.trim()}
          className="mt-3 rounded-xl border border-zinc-200 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-700"
        >
          Create user
        </button>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">User directory</div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
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
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
                        }
                      >
                        {activeAuditUserId === u.id ? "Active auditor" : "Set active"}
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

