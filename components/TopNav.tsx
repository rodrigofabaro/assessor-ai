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
    // Single honest Admin entry point
    { label: "Admin", href: "/admin/specs" },
  ];

  const adminItems: Item[] = [
    { label: "Dashboard", href: "/admin" },
    { label: "Specs", href: "/admin/specs" },
    { label: "Briefs", href: "/admin/briefs" },
    { label: "Students", href: "/admin/students" },
    { label: "Reference", href: "/admin/reference" },
  ];

  return (
    <div className="flex flex-col items-end">
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
        <div className="mt-2 w-full border-t border-zinc-200 bg-white/70 py-2">
          <nav className="flex justify-end gap-1">
            {adminItems.map((it) => {
              const active = isActive(pathname, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={
                    "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-semibold transition " +
                    (active
                      ? "border border-zinc-200 bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900")
                  }
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
