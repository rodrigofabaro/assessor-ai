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

  const items: Item[] = [
    { label: "Upload", href: "/upload" },
    { label: "Submissions", href: "/submissions" },
    // Single honest Admin entry point
    { label: "Admin", href: "/admin/specs" },
  ];

  return (
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
  );
}
