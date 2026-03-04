"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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

export default function OrganizationSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shouldHide =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/help");

  useEffect(() => {
    if (shouldHide) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/organizations", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) {
            setOrganizations([]);
            setActiveOrganizationId("");
            setError("");
          }
          return;
        }
        const json = (await res.json().catch(() => ({}))) as OrganizationsPayload;
        if (cancelled) return;
        const rows = Array.isArray(json.organizations) ? json.organizations : [];
        setOrganizations(rows.filter((o) => o && o.isActive));
        setActiveOrganizationId(String(json.activeOrganizationId || rows[0]?.id || ""));
      } catch {
        if (!cancelled) {
          setOrganizations([]);
          setActiveOrganizationId("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldHide, pathname]);

  const activeOrgName = useMemo(() => {
    const active = organizations.find((org) => org.id === activeOrganizationId);
    return active?.name || "";
  }, [organizations, activeOrganizationId]);

  if (shouldHide || organizations.length === 0) return null;

  async function switchOrganization(nextOrgId: string) {
    const trimmed = String(nextOrgId || "").trim();
    if (!trimmed || trimmed === activeOrganizationId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/switch-organization", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(String(json.error || "Failed to switch organization."));
        return;
      }
      setActiveOrganizationId(trimmed);
      router.refresh();
      window.setTimeout(() => {
        window.location.assign(`${window.location.pathname}${window.location.search}`);
      }, 80);
    } catch {
      setError("Failed to switch organization.");
    } finally {
      setBusy(false);
    }
  }

  if (organizations.length === 1) {
    return (
      <span className="hidden max-w-[220px] truncate rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 lg:inline-flex">
        Org: {activeOrgName || organizations[0].name}
      </span>
    );
  }

  return (
    <div className="hidden items-center gap-2 lg:flex">
      <label htmlFor="org-switcher" className="text-xs font-semibold text-zinc-500">
        Org
      </label>
      <select
        id="org-switcher"
        value={activeOrganizationId}
        disabled={busy}
        onChange={(event) => void switchOrganization(event.target.value)}
        className="h-8 max-w-[240px] rounded-full border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {error ? <span className="text-[11px] text-rose-700">{error}</span> : null}
    </div>
  );
}
