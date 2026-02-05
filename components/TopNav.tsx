// components/TopNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopNav() {
  const pathname = usePathname();
  const inAdmin = pathname.startsWith("/admin");

  const items: Item[] = [
    { label: "Upload", href: "/upload" },
    { label: "Submissions", href: "/submissions" },
    { label: "Admin", href: "/admin" },
  ];

  const adminItems: Item[] = [
    { label: "Dashboard", href: "/admin" },
    { label: "Specs", href: "/admin/specs" },
    { label: "Briefs", href: "/admin/briefs" },
    { label: "Students", href: "/admin/students" },
    { label: "Reference", href: "/admin/reference" },
  ];

  return (
    <div className="flex flex-col items-end gap-2">
      <nav className="flex items-center gap-1">
        {items.map((it) => {
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

      {inAdmin ? (
        <nav className="flex flex-wrap items-center justify-end gap-1">
          {adminItems.map((it) => {
            const active = it.href === "/admin" ? pathname === "/admin" : isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={
                  "inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-semibold transition " +
                  (active
                    ? "border border-zinc-300 bg-zinc-100 text-zinc-900"
                    : "border border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900")
                }
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
