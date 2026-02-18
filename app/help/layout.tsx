import Link from "next/link";
import Image from "next/image";
import { HELP_PAGES } from "@/lib/help/pages";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <Link href="/" className="group mb-3 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
          <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-zinc-100 transition group-hover:border-zinc-300">
            <Image src="/favicon.ico" alt="Assessor AI logo" width={22} height={22} className="h-5.5 w-5.5 object-contain" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
            Assessor <span className="font-medium text-zinc-500">AI</span>
          </span>
        </Link>
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Help topics</div>
        <nav className="mt-2 grid gap-1">
          {HELP_PAGES.map((p) => (
            <Link
              key={p.slug}
              href={`/help/${p.slug}`}
              className="rounded-lg border border-transparent px-2 py-1.5 text-sm text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50"
            >
              {p.title}
              <div className="text-[11px] text-zinc-500">{p.route}</div>
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
