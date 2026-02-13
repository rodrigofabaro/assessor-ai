"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANE } from "@/components/PageContainer";

type MainItem = { label: string; href: string };
type AdminItem = { label: string; href: string };

const MAIN_ITEMS: MainItem[] = [
  { label: "Upload", href: "/upload" },
  { label: "Submissions", href: "/submissions" },
];

const ADMIN_ITEMS: AdminItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Specs", href: "/admin/specs" },
  { label: "Briefs", href: "/admin/briefs" },
  { label: "Students", href: "/admin/students" },
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
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-sm font-bold text-zinc-900">
            AI
          </span>
          <span className="text-base font-semibold tracking-tight">Assessor AI</span>
        </Link>

        <div className="flex items-center justify-end gap-5">
          {MAIN_ITEMS.map((it) => {
            const active = isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={
                  "inline-flex h-9 items-center justify-center border-b-2 px-0 text-sm font-semibold transition " +
                  (active
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900")
                }
              >
                {it.label}
              </Link>
            );
          })}
          <Link
            href="/admin"
            className={
              "inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-semibold transition " +
              (isActive(pathname, "/admin")
                ? "border-zinc-300 bg-zinc-100 text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900")
            }
          >
            Admin
          </Link>

          {isAdminRoute ? (
            <nav className="hidden items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 md:flex">
              {ADMIN_ITEMS.map((it) => {
                const active = isActive(pathname, it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={
                      "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold transition " +
                      (active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:bg-white hover:text-zinc-900")
                    }
                  >
                    {it.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>
      </div>

      {isAdminRoute ? (
        <div className="border-t border-zinc-200 bg-zinc-50/80 md:hidden">
          <div className={LANE + " flex items-center gap-2 overflow-x-auto py-1.5"}>
            {ADMIN_ITEMS.map((it) => {
              const active = isActive(pathname, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={
                    "inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold transition " +
                    (active
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:bg-white hover:text-zinc-900")
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
