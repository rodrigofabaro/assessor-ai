"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TOP_NAV = [
  { href: "/upload", label: "Upload" },
  { href: "/submissions", label: "Submissions" },
  { href: "/admin/reference", label: "Reference" },
  { href: "/admin/bindings", label: "Bindings" },
  { href: "/admin/students", label: "Students" },
] as const;

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {TOP_NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "rounded-xl border px-3 py-2 text-sm font-medium transition " +
              (active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-transparent text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
