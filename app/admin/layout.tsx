import Link from "next/link";

const NAV = [
  { href: "/admin/reference", label: "Reference", desc: "Specs / briefs" },
  { href: "/admin/bindings", label: "Bindings", desc: "Brief ↔ unit map" },
  { href: "/admin/students", label: "Students", desc: "Student records" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <div className="text-sm font-semibold">Admin</div>
          <div className="mt-1 text-xs text-zinc-600">Reference, bindings, students</div>
        </div>

        <nav className="grid gap-1">
          {NAV.map((item) => {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "rounded-xl px-3 py-2 transition " +
                  "hover:bg-zinc-50 text-zinc-900"
                }
              >
                <div className="text-sm font-semibold leading-5">{item.label}</div>
                <div className="text-xs text-zinc-600">{item.desc}</div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-xs font-semibold text-zinc-900">Good practice</div>
          <div className="mt-1 text-xs text-zinc-600">
            Keep admin screens calm: search first, act second. Audit logs stay intact.
          </div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
