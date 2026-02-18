import Link from "next/link";
import { prisma } from "@/lib/prisma";

const GRADE_BANDS = ["REFER", "PASS", "PASS_ON_RESUBMISSION", "MERIT", "DISTINCTION"] as const;

function formatUpdated(ts: Date) {
  return new Date(ts).toLocaleString("en-GB", {
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
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900">{value}</div>
      <p className="mt-1 text-xs text-zinc-600">{hint}</p>
    </article>
  );
}

function ActionCard({
  title,
  desc,
  href,
  cta,
}: {
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-sm text-zinc-700">{desc}</p>
      <Link
        href={href}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100"
      >
        {cta}
      </Link>
    </article>
  );
}

export default async function AdminIndex() {
  const [
    totalSubmissions,
    totalStudents,
    gradedAssessments,
    autoReadySubmissions,
    specsAwaitingLock,
    briefsAwaitingLock,
    unlinkedSubmissions,
    needsOcrSubmissions,
    failedSubmissions,
    failedReferences,
    gradeBreakdownRaw,
    recentDocs,
    recentSubmissions,
  ] = await Promise.all([
    prisma.submission.count(),
    prisma.student.count(),
    prisma.assessment.count({ where: { overallGrade: { not: null } } }),
    prisma.submission.count({
      where: {
        studentId: { not: null },
        assignmentId: { not: null },
        assessments: { some: { overallGrade: { not: null } } },
      },
    }),
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
    prisma.submission.count({ where: { studentId: null } }),
    prisma.submission.count({ where: { status: "NEEDS_OCR" } }),
    prisma.submission.count({ where: { status: "FAILED" } }),
    prisma.referenceDocument.count({ where: { status: "FAILED" } }),
    prisma.assessment.groupBy({
      by: ["overallGrade"],
      where: { overallGrade: { not: null } },
      _count: { _all: true },
    }),
    prisma.referenceDocument.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, title: true, type: true, status: true, updatedAt: true },
    }),
    prisma.submission.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, filename: true, status: true, updatedAt: true },
    }),
  ]);

  const breakdownMap = new Map<string, number>();
  for (const row of gradeBreakdownRaw) {
    const k = String(row.overallGrade || "").toUpperCase();
    if (k) breakdownMap.set(k, row._count._all);
  }

  const attention = [
    {
      label: "Specs awaiting lock",
      count: specsAwaitingLock,
      href: "/admin/specs",
      hint: "Lock all extracted/reviewed specs before production grading.",
    },
    {
      label: "Briefs awaiting lock",
      count: briefsAwaitingLock,
      href: "/admin/briefs",
      hint: "Confirm brief mapping and lock before assessor usage.",
    },
    {
      label: "Submissions without student link",
      count: unlinkedSubmissions,
      href: "/submissions",
      hint: "Unlinked submissions weaken QA reports and audit quality.",
    },
    {
      label: "Submissions needing OCR",
      count: needsOcrSubmissions,
      href: "/submissions",
      hint: "Review scans where extraction quality is low.",
    },
    {
      label: "Failed extractions",
      count: failedSubmissions + failedReferences,
      href: "/admin/audit",
      hint: "Use audit events to diagnose and re-run failures.",
    },
  ];

  return (
    <div className="grid min-w-0 gap-4">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
              Operations Overview
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">Admin Control Tower</h1>
            <p className="mt-2 text-sm text-zinc-700">
              Central operations view for QA research, audit logs, locking workflows, and grading readiness.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
            Live system snapshot
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="/admin/qa" className="inline-flex h-9 items-center rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white hover:bg-sky-800">
            Open QA workspace
          </Link>
          <Link href="/admin/audit" className="inline-flex h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100">
            Open audit log
          </Link>
          <Link href="/submissions" className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50">
            Open submissions
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total submissions" value={totalSubmissions} hint="All uploaded submissions in the system." />
        <MetricCard label="Students" value={totalStudents} hint="Student records available for linking and QA." />
        <MetricCard label="Graded submissions" value={gradedAssessments} hint="Assessments that returned a grade." />
        <MetricCard label="Automation ready" value={autoReadySubmissions} hint="Linked and graded submissions ready for QA review." />
        <MetricCard label="Open blockers" value={attention.reduce((acc, x) => acc + x.count, 0)} hint="Current lock/extraction/linking blockers." />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard title="QA Research" desc="Analyze grades by student, course, unit and AB number. Export QA reports." href="/admin/qa" cta="Go to QA" />
        <ActionCard title="Audit Log" desc="Inspect operational evidence for extraction, grading, overrides, and failures." href="/admin/audit" cta="Go to Audit" />
        <ActionCard title="Reference Locking" desc="Maintain locked specs/briefs and keep the criteria universe stable." href="/admin/reference" cta="Open Reference" />
        <ActionCard title="Bindings" desc="Verify brief-to-unit links used as grading context during marking." href="/admin/bindings" cta="Open Bindings" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Needs attention now</h2>
          <div className="mt-3 grid gap-2">
            {attention.map((item) => (
              <Link key={item.label} href={item.href} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm hover:border-sky-200 hover:bg-sky-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-zinc-900">{item.label}</div>
                  <div className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-xs font-semibold text-sky-900">{item.count}</div>
                </div>
                <div className="mt-1 text-xs text-zinc-600">{item.hint}</div>
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Grade distribution snapshot</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {GRADE_BANDS.map((band) => (
              <div key={band} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{band}</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">{breakdownMap.get(band) || 0}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Recently updated references</h2>
          <div className="mt-3 grid gap-2 text-sm text-zinc-700">
            {recentDocs.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-600">No recent reference activity yet.</div>
            ) : (
              recentDocs.map((doc) => (
                <Link key={doc.id} href="/admin/reference" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 hover:border-sky-200 hover:bg-sky-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate font-medium text-zinc-900">{doc.type}: {doc.title}</div>
                    <span className={"rounded-full border px-2 py-0.5 text-xs font-semibold " + statusTone(doc.status)}>{doc.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">Updated {formatUpdated(doc.updatedAt)}</div>
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Recently updated submissions</h2>
          <div className="mt-3 grid gap-2 text-sm text-zinc-700">
            {recentSubmissions.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-600">No recent submission activity yet.</div>
            ) : (
              recentSubmissions.map((sub) => (
                <Link key={sub.id} href={`/submissions/${sub.id}`} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 hover:border-sky-200 hover:bg-sky-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate font-medium text-zinc-900">{sub.filename}</div>
                    <span className={"rounded-full border px-2 py-0.5 text-xs font-semibold " + statusTone(sub.status)}>{sub.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">Updated {formatUpdated(sub.updatedAt)}</div>
                </Link>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
