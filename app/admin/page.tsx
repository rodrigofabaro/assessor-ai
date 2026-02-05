"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useReferenceAdmin } from "./reference/reference.logic";

type StudentListResponse = { students?: Array<{ id: string; fullName?: string | null; updatedAt?: string | null }> } | Array<{ id: string; fullName?: string | null; updatedAt?: string | null }>;

function StatCard({
  title,
  metric,
  detail,
  description,
  href,
}: {
  title: string;
  metric: string;
  detail: string;
  description: string;
  href: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">{metric}</span>
      </div>
      <div className="mt-2 text-xs text-zinc-600">{detail}</div>
      <p className="mt-3 text-sm text-zinc-700">{description}</p>
      <Link href={href} className="mt-4 inline-flex rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50">
        Open {title}
      </Link>
    </article>
  );
}

export default function AdminConsolePage() {
  const specsVm = useReferenceAdmin({ context: "specs", fixedInboxType: "SPEC", fixedUploadType: "SPEC" });
  const briefsVm = useReferenceAdmin({ context: "briefs", fixedInboxType: "BRIEF", fixedUploadType: "BRIEF" });
  const [studentCount, setStudentCount] = useState<string>("—");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/students?query=", { cache: "no-store" });
        const data: StudentListResponse = await res.json().catch(() => []);
        if (!active) return;
        const arr = Array.isArray(data) ? data : Array.isArray(data?.students) ? data.students : [];
        setStudentCount(String(arr.length));
      } catch {
        if (active) setStudentCount("—");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const specLocked = specsVm.documents.filter((d) => !!d.lockedAt || d.status === "LOCKED").length;
  const briefLocked = briefsVm.documents.filter((d) => !!d.lockedAt || d.status === "LOCKED").length;
  const extractionFailures = specsVm.documents.filter((d) => d.status === "FAILED").length + briefsVm.documents.filter((d) => d.status === "FAILED").length;

  const recentlyUpdated = useMemo(() => {
    const all = [...specsVm.documents, ...briefsVm.documents];
    return all
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
      .slice(0, 6);
  }, [specsVm.documents, briefsVm.documents]);

  const needsAttention = [
    { name: "Unlocked specs", count: Math.max(specsVm.documents.length - specLocked, 0), href: "/admin/specs" },
    { name: "Briefs missing mapping", count: "—", href: "/admin/briefs" },
    { name: "Submissions unlinked", count: "—", href: "/admin/students" },
    { name: "Extraction failures", count: extractionFailures, href: "/admin/reference" },
  ];

  return (
    <div className="grid gap-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-zinc-700">Manage reference documents, students, and system readiness for audit-safe grading.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Specs"
          metric={String(specsVm.documents.length)}
          detail={`Locked: ${specLocked}`}
          description="Upload specs, extract LOs + criteria, then approve & lock authoritative versions."
          href="/admin/specs"
        />
        <StatCard
          title="Briefs"
          metric={String(briefsVm.documents.length)}
          detail={`Locked: ${briefLocked} · Needs review: —`}
          description="Upload briefs, extract tasks, map to locked specs, then approve & lock for grading."
          href="/admin/briefs"
        />
        <StatCard
          title="Students"
          metric={studentCount}
          detail="Missing fields warnings: —"
          description="Manage student records and review submissions per learner."
          href="/admin/students"
        />
        <StatCard
          title="System"
          metric={String(extractionFailures)}
          detail="Queue: —"
          description="Monitor extraction health and resolve failures."
          href="/admin/reference"
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Needs attention now</h2>
          <span className="text-xs text-zinc-500">Counts will populate as data is added.</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold text-zinc-700">
                <th className="border-b border-zinc-200 px-3 py-2">Item</th>
                <th className="border-b border-zinc-200 px-3 py-2">Count</th>
                <th className="border-b border-zinc-200 px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {needsAttention.map((row) => (
                <tr key={row.name} className="text-sm text-zinc-700">
                  <td className="border-b border-zinc-100 px-3 py-3">{row.name}</td>
                  <td className="border-b border-zinc-100 px-3 py-3 font-semibold">{row.count}</td>
                  <td className="border-b border-zinc-100 px-3 py-3">
                    <Link href={row.href} className="text-xs font-semibold text-zinc-900 underline-offset-2 hover:underline">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Recently updated</h2>
        {recentlyUpdated.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Recent activity will appear here.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            {recentlyUpdated.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <span className="font-medium">{item.title || item.filename || "Untitled item"}</span>
                <span className="text-xs text-zinc-500">{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
