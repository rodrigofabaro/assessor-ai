"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/reference", label: "Reference", desc: "Specs / briefs" },
  { href: "/admin/bindings", label: "Bindings", desc: "Brief ↔ unit map" },
  { href: "/admin/students", label: "Students", desc: "Student records" },
  { href: "/admin/settings", label: "Settings", desc: "OpenAI usage" },
] as const;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-4">
          <div className="text-sm font-semibold">Admin</div>
          <div className="text-xs text-zinc-500">Manage specs, briefs, bindings and records.</div>

        </div>

        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "block rounded-xl border px-3 py-2 transition " +
                  (active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-transparent hover:border-zinc-200 hover:bg-zinc-50")
                }
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div className={"text-xs " + (active ? "text-zinc-200" : "text-zinc-500")}>
                  {item.desc}
                </div>
              </Link>
            );
          })}
        </nav>

        
      </aside>

      <section className="min-w-0">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">{children}</div>
      </section>
    </div>
  );
}
