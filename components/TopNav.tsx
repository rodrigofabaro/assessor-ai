"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANE } from "@/components/PageContainer";

type MainItem = { label: string; href: string };
type AdminItem = { label: string; href: string; accent: string };

const MAIN_ITEMS: MainItem[] = [
  { label: "Upload", href: "/upload" },
  { label: "Submissions", href: "/submissions" },
];

const ADMIN_ITEMS: AdminItem[] = [
  { label: "Audit", href: "/admin/audit", accent: "amber" },
  { label: "Briefs", href: "/admin/briefs", accent: "emerald" },
  { label: "Library", href: "/admin/library", accent: "teal" },
  { label: "Overview", href: "/admin", accent: "sky" },
  { label: "QA", href: "/admin/qa", accent: "indigo" },
  { label: "Settings", href: "/admin/settings", accent: "slate" },
  { label: "Specs", href: "/admin/specs", accent: "cyan" },
  { label: "Students", href: "/admin/students", accent: "violet" },
  { label: "Users", href: "/admin/users", accent: "fuchsia" },
].sort((a, b) => a.label.localeCompare(b.label));

function accentClasses(accent: string) {
  switch (accent) {
    case "indigo":
      return "border-indigo-100 bg-indigo-50 text-indigo-800";
    case "amber":
      return "border-amber-100 bg-amber-50 text-amber-800";
    case "cyan":
      return "border-cyan-100 bg-cyan-50 text-cyan-800";
    case "emerald":
      return "border-emerald-100 bg-emerald-50 text-emerald-800";
    case "violet":
      return "border-violet-100 bg-violet-50 text-violet-800";
    case "fuchsia":
      return "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-800";
    case "orange":
      return "border-orange-100 bg-orange-50 text-orange-800";
    case "slate":
      return "border-slate-100 bg-slate-50 text-slate-800";
    case "blue":
      return "border-blue-100 bg-blue-50 text-blue-800";
    case "teal":
      return "border-teal-100 bg-teal-50 text-teal-800";
    default:
      return "border-sky-100 bg-sky-50 text-sky-800";
  }
}

function accentFromPath(pathname: string): string {
  if (pathname === "/admin" || pathname.startsWith("/admin/overview")) return "sky";
  if (pathname.startsWith("/admin/qa")) return "indigo";
  if (pathname.startsWith("/admin/audit")) return "amber";
  if (pathname.startsWith("/admin/specs")) return "cyan";
  if (pathname.startsWith("/admin/briefs")) return "emerald";
  if (pathname.startsWith("/admin/students")) return "violet";
  if (pathname.startsWith("/admin/users")) return "fuchsia";
  if (pathname.startsWith("/admin/settings")) return "slate";
  if (pathname.startsWith("/admin/bindings")) return "orange";
  if (pathname.startsWith("/admin/reference")) return "blue";
  if (pathname.startsWith("/admin/library")) return "teal";
  return "sky";
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function isAdminItemActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopNav() {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const activeAdminAccent = accentFromPath(pathname);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className={LANE + " flex items-center justify-between gap-3 py-2.5"}>
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sm font-bold text-sky-900">
            AI
          </span>
          <span className="text-base font-semibold tracking-tight">Assessor AI</span>
        </Link>

        <div className="flex items-center justify-end gap-3 sm:gap-5">
          {MAIN_ITEMS.map((it) => {
            const active = isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={
                  "hidden h-9 items-center justify-center border-b-2 px-0 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 sm:inline-flex " +
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
            aria-current={isActive(pathname, "/admin") ? "page" : undefined}
            className={
              "inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 " +
              (isActive(pathname, "/admin")
                ? accentClasses(activeAdminAccent)
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900")
            }
          >
            Admin
          </Link>

          {isAdminRoute ? (
            <nav aria-label="Admin sections" className="hidden max-w-[56vw] items-center gap-1.5 overflow-x-auto rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 md:flex">
              {ADMIN_ITEMS.map((it) => {
                const active = isAdminItemActive(pathname, it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-1 " +
                      (active ? accentClasses(it.accent) : "border-transparent text-zinc-600 hover:bg-white hover:text-zinc-900")
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
          <nav aria-label="Admin sections mobile" className={LANE + " flex items-center gap-2 overflow-x-auto py-1.5"}>
            {MAIN_ITEMS.map((it) => {
              const active = isActive(pathname, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-1 " +
                    (active ? "bg-sky-50 text-sky-900 shadow-sm" : "text-zinc-600 hover:bg-white hover:text-zinc-900")
                  }
                >
                  {it.label}
                </Link>
              );
            })}
            {ADMIN_ITEMS.map((it) => {
              const active = isAdminItemActive(pathname, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "inline-flex shrink-0 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-1 " +
                    (active
                      ? accentClasses(it.accent)
                      : "border-transparent text-zinc-600 hover:bg-white hover:text-zinc-900")
                  }
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
