// components/admin/LibraryShell.tsx
import Link from "next/link";

type Tab = { label: string; href: string };

export default function LibraryShell({
  title,
  subtitle,
  tabs,
  activeHref,
  rightSlot,
  children,
}: {
  title: string;
  subtitle: string;
  tabs: Tab[];
  activeHref: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
            <p className="mt-1 text-sm text-zinc-700 leading-relaxed">{subtitle}</p>
          </div>

          {rightSlot ? <div className="text-xs text-zinc-600">{rightSlot}</div> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = t.href === activeHref;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-semibold transition " +
                  (active
                    ? "bg-sky-700 text-white shadow-sm"
                    : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </header>

      <div>{children}</div>
    </div>
  );
}
