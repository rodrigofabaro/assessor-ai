"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANE } from "@/components/PageContainer";

type MainItem = { label: string; href: string };
type AdminItem = { label: string; href: string };

const MAIN_ITEMS: MainItem[] = [
  { label: "Upload", href: "/upload" },
  { label: "Submissions", href: "/submissions" },
  { label: "Admin", href: "/admin" },
];

const ADMIN_ITEMS: AdminItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Specs", href: "/admin/specs" },
  { label: "Briefs", href: "/admin/briefs" },
  { label: "Students", href: "/admin/students" },
  { label: "Reference", href: "/admin/reference" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopNav() {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/85 backdrop-blur">
      <div className={LANE + " flex items-center justify-between gap-4 py-2.5"}>
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white">
            AI
          </span>
          <span className="text-base font-semibold tracking-tight">Assessor AI</span>
        </Link>

        <nav className="flex items-center gap-1">
          {MAIN_ITEMS.map((it) => {
            const active = isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={
                  "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-semibold transition " +
                  (active
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900")
                }
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {isAdminRoute ? (
        <div className="border-t border-zinc-200 bg-white/70">
          <div className={LANE + " flex flex-wrap items-center gap-1 py-1.5"}>
            {ADMIN_ITEMS.map((it) => {
              const active = isActive(pathname, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={
                    "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold transition " +
                    (active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900")
                  }
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </header>
  );
}
