import Link from "next/link";
import Image from "next/image";
import { HELP_PAGES } from "@/lib/help/pages";

function HelpIcon({ name, className = "h-3.5 w-3.5" }: { name?: string; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 3v12" />
          <path d="M7 8l5-5 5 5" />
          <path d="M4 21h16" />
        </svg>
      );
    case "submissions":
    case "detail":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h6" />
        </svg>
      );
    case "students":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <circle cx="17.5" cy="9" r="2.5" />
        </svg>
      );
    case "admin":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case "qa":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "specs":
    case "briefs":
    case "reference":
    case "library":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M4 19a2 2 0 0 0 2 2h14" />
          <path d="M6 2h14v20H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
          <path d="M8 7h8M8 11h8" />
        </svg>
      );
    case "bindings":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 1 7 0l1 1a5 5 0 1 1-7 7l-1-1" />
          <path d="M14 11a5 5 0 0 1-7 0l-1-1a5 5 0 1 1 7-7l1 1" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    default:
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h2v4h-2z" />
        </svg>
      );
  }
}

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
              <Link href={`/help/${p.slug}`} className="flex items-center gap-2 text-sm font-medium text-zinc-800 hover:text-zinc-900">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
                  <HelpIcon name={p.icon} />
                </span>
                <span className="truncate">{p.title}</span>
              </Link>
              {resolveAppRoute(p.route) ? (
                <Link href={String(resolveAppRoute(p.route))} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-sky-700 hover:underline">
                  <span>↗</span>
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
