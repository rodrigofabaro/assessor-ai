"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/specs", label: "Specs" },
  { href: "/admin/briefs", label: "Briefs" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 overflow-x-hidden">
      <header className="sticky top-[57px] z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-xs font-bold text-white">
              AI
            </Link>
            <div>
              <div className="text-sm font-semibold leading-4">Assessor AI</div>
              <div className="text-xs text-zinc-600">Admin</div>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "rounded-xl px-3 py-2 text-sm font-semibold transition " +
                    (active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="w-full px-4 pb-6 pt-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
