import Link from "next/link";

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
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
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case "docs":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
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
    case "warning":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </svg>
      );
    default:
      return null;
  }
}

function HelpCard({
  title,
  desc,
  href,
  cta,
  icon,
}: {
  title: string;
  desc: string;
  href: string;
  cta: string;
  icon: "home" | "upload" | "docs";
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-transparent transition hover:shadow-md hover:ring-zinc-200"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900">
        <Icon name={icon} className="h-4.5 w-4.5" />
      </span>
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-zinc-700">{desc}</div>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900">
        {cta} <Icon name="arrow" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export default function NotFoundPage() {
  return (
    <div className="mx-auto grid max-w-4xl gap-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
          <Icon name="warning" className="h-7 w-7" />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">404</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-600">Use one of the cards below to return home.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HelpCard href="/" icon="home" title="Home" desc="Back to the main landing page." cta="Go Home" />
        <HelpCard href="/upload" icon="upload" title="Upload" desc="Jump back to submissions upload." cta="Open Upload" />
        <HelpCard href="/submissions" icon="docs" title="Submissions" desc="Return to submissions list." cta="Open Submissions" />
      </div>
    </div>
  );
}
