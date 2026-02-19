import Link from "next/link";
import Image from "next/image";
import { HELP_PAGES } from "@/lib/help/pages";

function resolveAppRoute(route: string) {
  const candidates = String(route || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!candidates.length) return null;
  const stable = candidates.find((r) => !r.includes("["));
  if (stable) return stable;
  const first = candidates[0];
  if (first.startsWith("/submissions/")) return "/submissions";
  if (first.startsWith("/students/")) return "/admin/students";
  if (first.startsWith("/admin/")) return "/admin";
  return first.replace(/\[[^\]]+\]/g, "").replace(/\/+$/g, "") || "/";
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm lg:sticky lg:top-3 lg:flex lg:max-h-[calc(100vh-16px)] lg:flex-col">
        <Link href="/" className="group mb-3 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
          <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-zinc-100 transition group-hover:border-zinc-300">
            <Image src="/favicon.ico" alt="Assessor AI logo" width={22} height={22} className="h-5.5 w-5.5 object-contain" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
            Assessor <span className="font-medium text-zinc-500">AI</span>
          </span>
        </Link>
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Help topics</div>
        <nav className="mt-2 grid gap-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 lg:pb-4">
          {HELP_PAGES.map((p) => (
            <div key={p.slug} className="rounded-lg border border-transparent px-2 py-1.5 hover:border-zinc-200 hover:bg-zinc-50">
              <Link href={`/help/${p.slug}`} className="block text-sm font-medium text-zinc-800 hover:text-zinc-900">
                {p.title}
              </Link>
              {resolveAppRoute(p.route) ? (
                <Link href={String(resolveAppRoute(p.route))} className="mt-0.5 block text-[11px] text-zinc-500 hover:text-sky-700 hover:underline">
                  App page: {p.route}
                </Link>
              ) : (
                <div className="mt-0.5 text-[11px] text-zinc-500">{p.route}</div>
              )}
            </div>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
