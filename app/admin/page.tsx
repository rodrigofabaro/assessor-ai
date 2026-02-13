import type { ReactNode } from "react";
import Link from "next/link";

type Tone = "sky" | "emerald" | "amber" | "slate";

function AdminIcon({ tone, children }: { tone: Tone; children: ReactNode }) {
  const toneClass: Record<Tone, string> = {
    sky: "bg-sky-100 text-sky-900",
    emerald: "bg-emerald-100 text-emerald-900",
    amber: "bg-amber-100 text-amber-950",
    slate: "bg-slate-100 text-slate-900",
  };

  return <span className={"inline-flex h-7 w-7 items-center justify-center rounded-full " + toneClass[tone]}>{children}</span>;
}

function AdminCard({
  title,
  desc,
  href,
  cta,
  tone,
  icon,
}: {
  title: string;
  desc: string;
  href: string;
  cta: string;
  tone: Tone;
  icon: ReactNode;
}) {
  const pillTone: Record<Tone, string> = {
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className={"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold " + pillTone[tone]}>
        <AdminIcon tone={tone}>{icon}</AdminIcon>
        {title}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-700">{desc}</p>
      <Link
        href={href}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        {cta}
      </Link>
    </article>
  );
}

export default function AdminIndex() {
  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Admin console</h1>
        <p className="mt-1 text-sm text-zinc-700">Reference-first operations workspace for specs, briefs, students, and system integrity.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminCard
          title="Specs"
          desc="Define the criteria universe and lock the authoritative issue used by grading."
          href="/admin/specs"
          cta="Open specs"
          tone="sky"
          icon="📘"
        />
        <AdminCard
          title="Briefs"
          desc="Manage assignment briefs, extraction state, and mapping readiness for reliable grading."
          href="/admin/briefs"
          cta="Open briefs"
          tone="emerald"
          icon="🧾"
        />
        <AdminCard
          title="Students"
          desc="Search students, import cohorts, and review submission-linked records quickly."
          href="/admin/students"
          cta="Open students"
          tone="amber"
          icon="👤"
        />
        <AdminCard
          title="System"
          desc="Check reference inboxes and lock state to keep audit readiness and QA confidence high."
          href="/admin/settings"
          cta="Open settings"
          tone="slate"
          icon="⚙️"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Needs attention now</h2>
          <ul className="mt-3 grid gap-2 text-sm text-zinc-700">
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">Review extracted specs awaiting lock confirmation.</li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">Confirm brief mappings before releasing grading runs.</li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">Resolve students without linked submissions.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Recently updated</h2>
          <ul className="mt-3 grid gap-2 text-sm text-zinc-700">
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">Specs extraction tooling and library controls.</li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">Briefs review workflows and mapping visibility.</li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">Student import and profile operations.</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
