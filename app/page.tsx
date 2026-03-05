import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySignedSessionToken } from "@/lib/auth/session";
import { TinyIcon } from "@/components/ui/TinyIcon";

export const dynamic = "force-dynamic";

type TinyIconName = "reference" | "submissions" | "audit" | "upload" | "qa" | "users" | "app" | "workflow";

const landingWorkflow = [
  {
    title: "Upload submission",
    detail: "Bring in student work with assignment context and assessor ownership.",
  },
  {
    title: "Evidence extraction",
    detail: "Pull structured evidence from files so criteria checks start with real content.",
  },
  {
    title: "Criteria mapping",
    detail: "Link extracted evidence to locked unit criteria and grading expectations.",
  },
  {
    title: "AI grading",
    detail: "Generate draft decisions and feedback while the assessor stays in control.",
  },
  {
    title: "Audit-ready output",
    detail: "Export moderation-ready decisions with traceable rationale and history.",
  },
] as const;

const workflowAssurancePoints = [
  "Pearson HN compatible grading structure",
  "Evidence-linked criteria decisions",
  "Moderation-ready outputs",
  "Full audit history",
] as const;

const workflowFitTags = [
  "Vocational training providers",
  "Awarding bodies",
  "Internal quality assurance teams",
  "Independent assessors",
] as const;

function StatCard({
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
      <div className="mt-1 text-2xl font-semibold text-zinc-900">{value || "0"}</div>
      <p className="mt-1 text-xs text-zinc-600">{hint}</p>
    </article>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: TinyIconName;
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
          <TinyIcon name={icon} className="h-3.5 w-3.5" />
        </span>
        {title}
      </h2>
      <p className="mt-2 text-sm text-zinc-700">{desc}</p>
      <Link
        href={href}
        className="mt-3 inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        {cta}
      </Link>
    </article>
  );
}

async function getSession() {
  const store = await cookies();
  const token = String(store.get("assessor_session")?.value || "");
  return verifySignedSessionToken(token);
}

async function getDashboardStats() {
  try {
    const [
      specs,
      briefs,
      submissions,
      students,
      lockedSpecs,
      lockedBriefs,
      queueBlocked,
    ] = await Promise.all([
      prisma.referenceDocument.count({ where: { type: "SPEC" } }),
      prisma.referenceDocument.count({ where: { type: "BRIEF" } }),
      prisma.submission.count(),
      prisma.student.count(),
      prisma.referenceDocument.count({ where: { type: "SPEC", status: "LOCKED" } }),
      prisma.referenceDocument.count({ where: { type: "BRIEF", status: "LOCKED" } }),
      prisma.submission.count({ where: { OR: [{ status: "FAILED" }, { status: "NEEDS_OCR" }] } }),
    ]);
    return { specs, briefs, submissions, students, lockedSpecs, lockedBriefs, queueBlocked };
  } catch {
    return {
      specs: "-",
      briefs: "-",
      submissions: "-",
      students: "-",
      lockedSpecs: "-",
      lockedBriefs: "-",
      queueBlocked: "-",
    };
  }
}

export default async function LandingPage() {
  const session = await getSession();
  const stats = await getDashboardStats();

  if (!session) {
    return (
      <div className="grid gap-6 sm:gap-7">
        <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-sm">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.24),transparent_45%)]" />
          <div className="relative grid items-start gap-6 p-8 sm:p-11 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
                Assessment infrastructure for vocational education
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Mark vocational assignments in minutes with a full Pearson-ready audit trail.
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-200 sm:text-base">
                AI-assisted grading that keeps assessors in control, maps evidence against locked criteria, and delivers moderation-ready decisions by default.
              </p>
              <p className="mt-4 max-w-2xl text-sm text-sky-100">
                ChatGPT gives an opinion. Assessor AI gives a defensible assessment decision with an audit trail.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400"
                >
                  Start grading submissions
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  See the workflow
                </Link>
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-700 bg-slate-900/90 p-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-600 bg-slate-800 text-sky-200">
                  <TinyIcon name="workflow" className="h-4 w-4" />
                </span>
                Tomorrow feels lighter
              </h2>
              <ul className="mt-3 grid gap-2 text-sm text-slate-200">
                {[
                  "Single controlled workflow from upload to audit output",
                  "Criteria alignment locked to the correct version",
                  "Assessor-reviewable AI suggestions, not black-box automation",
                  "Moderation evidence stays attached to every decision",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-300" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section id="how-it-works" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">From submission intake to audit-ready output</h2>
            </div>
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              One controlled pipeline
            </span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <ol className="flex min-w-[980px] items-stretch gap-2 pb-1">
              {landingWorkflow.map((step, idx) => (
                <li key={step.title} className="flex items-center gap-2">
                  <div className="w-44 rounded-2xl border border-sky-200 bg-sky-50/80 p-3">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-200 bg-white text-xs font-semibold text-sky-700">
                      {idx + 1}
                    </span>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-700">{step.detail}</p>
                  </div>
                  {idx < landingWorkflow.length - 1 ? <span className="text-xl font-semibold text-sky-500">→</span> : null}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Built for vocational assessment workflows</p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700">
              {workflowAssurancePoints.map((point) => (
                <li key={point} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operational fit</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Assessor AI behaves like an assessment engine, not a standalone chatbot. It supports the day-to-day operations that teams need for defensible grading.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {workflowFitTags.map((tag) => (
                <span key={tag} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-slate-900">
              ChatGPT gives an opinion. Assessor AI gives a defensible assessment decision with an audit trail.
            </p>
          </article>
        </section>

        <section id="output-preview" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Output preview</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Show the result, not just the promise</h2>
            </div>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              Real product screenshots
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <Image
                src="/help/screenshots/operations-playbook-submission-detail.png"
                alt="Submission workspace showing evidence mapping and AI-assisted grading feedback."
                width={1569}
                height={966}
                className="h-auto w-full"
                priority
              />
              <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                AI feedback panel with criteria-linked evidence and assessor decision context.
              </figcaption>
            </figure>

            <div className="grid gap-3">
              <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <Image
                  src="/help/screenshots/admin-briefs-criteria-mapping.png"
                  alt="Criteria mapping interface linking assignment tasks to grading criteria."
                  width={1310}
                  height={481}
                  className="h-auto w-full"
                />
                <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  Criteria mapping interface for controlled evidence-to-criterion alignment.
                </figcaption>
              </figure>
              <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <Image
                  src="/help/screenshots/operations-playbook-queue.png"
                  alt="Submission queue view used for moderation and grading operations."
                  width={1600}
                  height={2200}
                  className="h-auto w-full"
                />
                <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  Queue and status controls that support moderation and audit review.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const sessionOrgId = String((session as { orgId?: string | null }).orgId || "").trim() || null;

  return (
    <div className="grid gap-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Internal workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Role: {session.role}
              {sessionOrgId ? " · Organization scope active" : ""}. Use the shortcuts below to continue operations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/submissions" className="inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
              Open submissions
            </Link>
            <Link href="/upload" className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
              Upload
            </Link>
            <Link href="/admin" className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
              Admin
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Specs" value={stats.specs} hint="Reference specs loaded" />
        <StatCard label="Briefs" value={stats.briefs} hint="Assignment briefs loaded" />
        <StatCard label="Submissions" value={stats.submissions} hint="Student evidence records" />
        <StatCard label="Students" value={stats.students} hint="Student profiles tracked" />
        <StatCard label="Locked Specs" value={stats.lockedSpecs} hint="Specs currently locked for grading" />
        <StatCard label="Locked Briefs" value={stats.lockedBriefs} hint="Briefs currently locked for grading" />
        <StatCard label="Queue Blocked" value={stats.queueBlocked} hint="Submissions requiring intervention" />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <ActionCard
          icon="submissions"
          title="Daily operations"
          desc="Use Submissions for intake, extraction and grading workflow."
          href="/submissions"
          cta="Open submissions"
        />
        <ActionCard
          icon="reference"
          title="Specs and briefs"
          desc="Check lock/version status and maintain reference quality."
          href="/admin/specs"
          cta="Open specs"
        />
        <ActionCard
          icon="qa"
          title="QA review"
          desc="Review flagged outputs and moderation checks."
          href="/admin/qa"
          cta="Open QA"
        />
        <ActionCard
          icon="users"
          title="Users"
          desc="Manage access, roles and organization assignment."
          href="/admin/users"
          cta="Open users"
        />
      </section>
    </div>
  );
}
