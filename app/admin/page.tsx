import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

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

export default async function AdminIndex() {
  const metricsPromise = Promise.all([
    prisma.referenceDocument.count({
      where: {
        type: "SPEC",
        status: { in: ["EXTRACTED", "REVIEWED"] },
        lockedAt: null,
      },
    }),
    prisma.referenceDocument.count({
      where: {
        type: "BRIEF",
        status: { in: ["EXTRACTED", "REVIEWED"] },
        lockedAt: null,
      },
    }),
    prisma.submission.count({
      where: {
        studentId: null,
      },
    }),
    prisma.submission.count({
      where: {
        status: "NEEDS_OCR",
      },
    }),
    prisma.submission.count({
      where: {
        status: "FAILED",
      },
    }),
    prisma.referenceDocument.count({
      where: {
        status: "FAILED",
      },
    }),
    prisma.referenceDocument.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.submission.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        id: true,
        filename: true,
        status: true,
        updatedAt: true,
      },
    }),
  ]);

  const [
    specsAwaitingLock,
    briefsAwaitingLock,
    unlinkedSubmissions,
    needsOcrSubmissions,
    failedSubmissions,
    failedReferences,
    recentDocs,
    recentSubmissions,
  ] = await metricsPromise;

  const attention = [
    {
      label: "Specs awaiting lock",
      count: specsAwaitingLock,
      href: "/admin/specs",
      hint: "Extracted/reviewed specs should be locked before grading runs.",
    },
    {
      label: "Briefs awaiting lock",
      count: briefsAwaitingLock,
      href: "/admin/briefs",
      hint: "Brief mapping and rubric should be confirmed before release.",
    },
    {
      label: "Submissions without student link",
      count: unlinkedSubmissions,
      href: "/admin/students",
      hint: "Unlinked submissions reduce traceability and audit confidence.",
    },
    {
      label: "Submissions needing OCR",
      count: needsOcrSubmissions,
      href: "/upload",
      hint: "Low-confidence text extraction needs OCR follow-up.",
    },
    {
      label: "Failed extractions",
      count: failedSubmissions + failedReferences,
      href: "/admin/reference",
      hint: "Failed docs/submissions should be retried or corrected.",
    },
  ];

  function formatUpdated(ts: Date) {
    const date = new Date(ts);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusTone(status: string) {
    if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
    if (status === "LOCKED" || status === "DONE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    return "border-zinc-200 bg-zinc-50 text-zinc-700";
  }

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
          <div className="mt-3 grid gap-2">
            {attention.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-zinc-900">{item.label}</div>
                  <div className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-800">{item.count}</div>
                </div>
                <div className="mt-1 text-xs text-zinc-600">{item.hint}</div>
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Recently updated</h2>
          <div className="mt-3 grid gap-2 text-sm text-zinc-700">
            {recentDocs.length === 0 && recentSubmissions.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-600">No recent activity yet.</div>
            ) : null}

            {recentDocs.map((doc) => (
              <Link
                key={`doc-${doc.id}`}
                href="/admin/reference"
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 hover:bg-zinc-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate font-medium text-zinc-900">
                    {doc.type}: {doc.title}
                  </div>
                  <span className={"rounded-full border px-2 py-0.5 text-xs font-semibold " + statusTone(doc.status)}>{doc.status}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-600">Updated {formatUpdated(doc.updatedAt)}</div>
              </Link>
            ))}

            {recentSubmissions.map((sub) => (
              <Link
                key={`sub-${sub.id}`}
                href="/upload"
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 hover:bg-zinc-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate font-medium text-zinc-900">Submission: {sub.filename}</div>
                  <span className={"rounded-full border px-2 py-0.5 text-xs font-semibold " + statusTone(sub.status)}>{sub.status}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-600">Updated {formatUpdated(sub.updatedAt)}</div>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
