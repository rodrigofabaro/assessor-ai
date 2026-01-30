"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const NAV = [
  {
    href: "/admin/specs",
    label: "Spec Library",
    desc: "Units, LOs/ACs, grading bands",
    icon: "📚",
  },
  {
    href: "/admin/briefs",
    label: "Briefs Library",
    desc: "Assignments, mapping, rubrics",
    icon: "🧾",
  },
  {
    href: "/admin/students",
    label: "Students",
    desc: "Submissions & records",
    icon: "👤",
  },
];



export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("adminNavCollapsed");
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("adminNavCollapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <div className="w-full overflow-x-hidden">
      <div className={"grid w-full min-w-0 gap-1 " + (collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[280px_1fr]")}
      >
      <aside className={"rounded-2xl border border-zinc-200 bg-white shadow-sm " + (collapsed ? "p-2" : "p-4")}
      >
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div className={collapsed ? "sr-only" : "block"}>
              <div className="text-sm font-semibold">Admin</div>
              <div className="text-xs text-zinc-600">System administration</div>
            </div>

            <button
              type="button"
              onClick={toggle}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm shadow-sm hover:bg-zinc-50"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? "➡️" : "⬅️"}
            </button>
          </div>
        </div>

        <nav className="grid gap-1">
          {NAV.map((item) => {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "rounded-xl transition hover:bg-zinc-50 text-zinc-900 " +
                  (collapsed ? "px-0 py-2" : "px-3 py-2")
                }
              >
                <div className={"flex items-start gap-2 " + (collapsed ? "justify-center" : "")}
                >
                  <span className={"inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-50 text-base"}>
                    {item.icon}
                  </span>
                  <div className={collapsed ? "sr-only" : "block"}>
                    <div className="text-sm font-semibold leading-5">{item.label}</div>
                    <div className="text-xs text-zinc-600">{item.desc}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
