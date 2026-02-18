"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HELP_PAGES, getHelpPageMeta } from "@/lib/help/pages";

type HelpSectionItem = { type: "h3" | "li" | "p"; text: string };
type HelpSection = { id: string; title: string; items: HelpSectionItem[] };

function toCallout(text: string) {
  const src = String(text || "").trim();
  if (/^tip:\s*/i.test(src)) return { kind: "tip" as const, text: src.replace(/^tip:\s*/i, "") };
  if (/^warning:\s*/i.test(src)) return { kind: "warning" as const, text: src.replace(/^warning:\s*/i, "") };
  if (/^important:\s*/i.test(src)) return { kind: "important" as const, text: src.replace(/^important:\s*/i, "") };
  return null;
}

function includesRole(section: HelpSection, role: "all" | "tutor" | "admin" | "qa") {
  if (role === "all") return true;
  const hay = `${section.title} ${section.items.map((i) => i.text).join(" ")}`.toLowerCase();
  if (role === "admin") return /admin|settings|reference|lock|binding|audit/.test(hay);
  if (role === "qa") return /audit|evidence|quality|warning|compliance|defensib/.test(hay);
  return /submission|student|grading|feedback|pdf|upload/.test(hay);
}

function highlight(text: string, query: string) {
  const src = String(text || "");
  const q = String(query || "").trim();
  if (!q) return src;
  const i = src.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return src;
  const a = src.slice(0, i);
  const b = src.slice(i, i + q.length);
  const c = src.slice(i + q.length);
  return (
    <>
      {a}
      <mark className="rounded bg-amber-100 px-0.5">{b}</mark>
      {c}
    </>
  );
}

export default function HelpTopicClient(props: {
  slug: string;
  route: string;
  pageTitle: string;
  sections: HelpSection[];
}) {
  const { slug, route, pageTitle, sections } = props;
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | "tutor" | "admin" | "qa">("all");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string>("");
  const [helpful, setHelpful] = useState<"yes" | "no" | null>(null);

  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.filter((s) => {
      if (!includesRole(s, role)) return false;
      if (!q) return true;
      const hay = `${s.title} ${s.items.map((i) => i.text).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sections, query, role]);

  const idx = HELP_PAGES.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? HELP_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < HELP_PAGES.length - 1 ? HELP_PAGES[idx + 1] : null;

  const related = useMemo(() => {
    const self = getHelpPageMeta(slug);
    const selfRoute = String(self?.route || "");
    const key =
      selfRoute.startsWith("/admin") ? "/admin" :
      selfRoute.startsWith("/submissions") ? "/submissions" :
      selfRoute.startsWith("/students") ? "/students" : "/";
    return HELP_PAGES.filter((p) => p.slug !== slug && String(p.route).startsWith(key)).slice(0, 4);
  }, [slug]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio - a.intersectionRatio));
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0.2, 0.5, 0.8] }
    );
    for (const s of visibleSections) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [visibleSections]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = String((e.target as HTMLElement | null)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "[" && prev) {
        window.location.href = `/help/${prev.slug}`;
      } else if (e.key === "]" && next) {
        window.location.href = `/help/${next.slug}`;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  return (
    <article className="grid gap-3 lg:grid-cols-[1fr_220px]">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <header className="border-b border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-sky-50 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900">
              Help
            </span>
            <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
              Route: {route}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">{pageTitle}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this help page..."
              className="h-9 w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 text-sm"
            />
            {(["all", "tutor", "admin", "qa"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${role === r ? "border-sky-200 bg-sky-50 text-sky-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
              >
                {r.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Print
            </button>
          </div>
        </header>

        <div className="space-y-3 p-5 print:p-0">
          {visibleSections.map((s) => (
            <details
              key={s.id}
              id={s.id}
              open={openMap[s.id] ?? true}
              onToggle={(e) => setOpenMap((m) => ({ ...m, [s.id]: e.currentTarget.open }))}
              className="rounded-xl border border-zinc-200 bg-zinc-50"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-zinc-900">{s.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(`${window.location.origin}/help/${slug}#${s.id}`);
                  }}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Copy link
                </button>
              </summary>
              <div className="space-y-2 border-t border-zinc-200 bg-white px-3 py-3">
                {s.items.map((it, i) => {
                  if (it.type === "h3") return <h3 key={i} className="text-sm font-semibold text-zinc-900">{highlight(it.text, query)}</h3>;
                  const callout = toCallout(it.text);
                  if (callout) {
                    const tone =
                      callout.kind === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : callout.kind === "important"
                          ? "border-red-200 bg-red-50 text-red-900"
                          : "border-sky-200 bg-sky-50 text-sky-900";
                    return (
                      <div key={i} className={`rounded-lg border p-2 text-sm ${tone}`}>
                        <span className="font-semibold uppercase tracking-wide">{callout.kind}: </span>
                        {highlight(callout.text, query)}
                      </div>
                    );
                  }
                  if (it.type === "li") return <div key={i} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{highlight(it.text, query)}</div>;
                  return <p key={i} className="text-sm leading-relaxed text-zinc-700">{highlight(it.text, query)}</p>;
                })}
              </div>
            </details>
          ))}

          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Was this helpful?</div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHelpful("yes")}
                className={`rounded-md border px-3 py-1 text-xs font-semibold ${helpful === "yes" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setHelpful("no")}
                className={`rounded-md border px-3 py-1 text-xs font-semibold ${helpful === "no" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
              >
                No
              </button>
              {helpful ? <span className="text-[11px] text-zinc-500">Thanks. Feedback captured locally.</span> : null}
            </div>
          </div>

          <div className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Previous / Next</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {prev ? <Link href={`/help/${prev.slug}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">[ {prev.title}</Link> : null}
                {next ? <Link href={`/help/${next.slug}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">{next.title} ]</Link> : null}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Related topics</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {related.map((r) => (
                  <Link key={r.slug} href={`/help/${r.slug}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                    {r.title}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="sticky top-3 hidden h-fit rounded-xl border border-zinc-200 bg-white p-3 shadow-sm lg:block">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">On this page</div>
        <nav className="mt-2 grid gap-1">
          {visibleSections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${activeId === s.id ? "bg-sky-50 text-sky-900" : "text-zinc-700 hover:bg-zinc-50"}`}
            >
              {s.title}
            </a>
          ))}
        </nav>
      </aside>
    </article>
  );
}
