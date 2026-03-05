import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySignedSessionToken } from "@/lib/auth/session";
import { TinyIcon } from "@/components/ui/TinyIcon";
import ContactEarlyAccessForm from "./ContactEarlyAccessForm";

export const dynamic = "force-dynamic";

type TinyIconName = "reference" | "submissions" | "audit" | "upload" | "qa" | "users" | "app" | "workflow";

const landingWorkflow = [
  {
    title: "Upload submission",
    detail: "Submission and assignment brief are linked for assessor ownership.",
  },
  {
    title: "Evidence extraction",
    detail: "Evidence snippets are extracted and structured from learner work.",
  },
  {
    title: "Criteria mapping",
    detail: "Extracted evidence is mapped to locked Pearson unit criteria.",
  },
  {
    title: "AI grading",
    detail: "Draft grade decision and feedback are generated for assessor review.",
  },
  {
    title: "QA and integrity checks",
    detail: "IQA/IV checks grading logic, assessment evidence, and Turnitin signals.",
  },
  {
    title: "Audit-ready output",
    detail: "Moderation pack is exported with rationale, QA sign-off, and history.",
  },
] as const;

const workflowToneClasses = [
  "border-slate-200 bg-slate-50/80",
  "border-sky-200 bg-sky-50/75",
  "border-cyan-200 bg-cyan-50/75",
  "border-teal-200 bg-teal-50/75",
  "border-emerald-200 bg-emerald-50/75",
  "border-indigo-200 bg-indigo-50/70",
] as const;

const workflowStageLabels = [
  "Intake",
  "Extraction",
  "Mapping",
  "Draft decision",
  "QA gate",
  "Final output",
] as const;

const workflowAssurancePoints = [
  "Pearson HN-compatible grading structure",
  "Evidence-linked criteria decisions",
  "Quality assurance and Turnitin checkpoints",
  "Moderation-ready outputs",
  "Full audit history",
] as const;

const workflowFitTags = [
  "Vocational training providers",
  "Awarding bodies",
  "Internal quality assurance teams",
  "Independent assessors",
] as const;

const syntheticCriteriaRows = [
  { criterion: "P1.1 Define safeguarding duties", evidence: "Section 2.1 + Appendix A", outcome: "Met" },
  { criterion: "M1.2 Evaluate risk response", evidence: "Section 3.2 + Case table", outcome: "Met" },
  { criterion: "D1.1 Justify intervention plan", evidence: "Section 4.4 + Reflection", outcome: "Review" },
] as const;

const syntheticAuditEvents = [
  "22:31 Upload logged and file integrity verified",
  "22:32 Evidence extraction completed",
  "22:34 Criteria mapping snapshot saved",
  "22:36 AI grading draft generated",
  "22:38 QA + Turnitin check completed",
  "22:39 Assessor review accepted and export created",
] as const;

const syntheticQaChecks = [
  { label: "Assessment decision aligns to mapped criteria", status: "Pass" },
  { label: "Evidence references resolve in the submission", status: "Pass" },
  { label: "Turnitin similarity score 18% vs threshold 15%", status: "Review" },
  { label: "IQA sample flag for moderation", status: "Required" },
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
      <div className="w-full min-w-0 overflow-x-clip">
        <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-7">
        <section className="relative w-full min-w-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-sm">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_46%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_6%,rgba(96,165,250,0.18),transparent_54%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_100%,rgba(14,165,233,0.12),transparent_58%)]" />
          <div className="relative grid items-start gap-6 p-8 sm:p-11 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
                Assessment infrastructure for vocational education
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Mark vocational assignments in minutes with a full Pearson-ready audit trail.
              </h1>
              <p className="mt-3 text-sm font-semibold text-sky-200">
                Built for end-of-day assessors who need defensible decisions fast.
              </p>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-200 sm:text-base">
                AI-assisted grading that keeps assessors in control, maps evidence against locked criteria, adds QA and Turnitin checks, and delivers moderation-ready decisions by default.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400"
                >
                  Start grading in minutes
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  See 6-step workflow
                </Link>
              </div>
              <nav className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-200" aria-label="Landing sections">
                <a href="#how-it-works" className="rounded-full border border-slate-600/80 bg-slate-900/60 px-3 py-1 hover:bg-slate-800">
                  Workflow
                </a>
                <a href="#positioning" className="rounded-full border border-slate-600/80 bg-slate-900/60 px-3 py-1 hover:bg-slate-800">
                  Why Assessor-AI
                </a>
                <a href="#output-preview" className="rounded-full border border-slate-600/80 bg-slate-900/60 px-3 py-1 hover:bg-slate-800">
                  Output
                </a>
                <a href="#early-access" className="rounded-full border border-slate-600/80 bg-slate-900/60 px-3 py-1 hover:bg-slate-800">
                  Early access
                </a>
              </nav>
            </div>

            <aside className="rounded-2xl border border-slate-700 bg-slate-900/90 p-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-600 bg-slate-800 text-sky-200">
                  <TinyIcon name="workflow" className="h-4 w-4" />
                </span>
                Tomorrow feels lighter
              </h2>
              <ul className="mt-3 divide-y divide-slate-700/80 text-sm text-slate-200">
                {[
                  "Single controlled workflow from upload to audit output",
                  "Criteria alignment locked to the correct version",
                  "Assessor-reviewable AI suggestions, not black-box automation",
                  "QA and Turnitin checks happen before final release",
                  "Moderation evidence stays attached to every decision",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-800/75 px-3 py-2 first:mt-0 mt-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-300" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section id="how-it-works" className="w-full min-w-0 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">From submission intake to audit-ready output</h2>
            </div>
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              One controlled 6-step pipeline
            </span>
          </div>
          <ol className="mt-5 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {landingWorkflow.map((step, idx) => (
              <li key={step.title} className="h-full min-w-0">
                <div
                  className={
                    "flex h-full min-h-44 flex-col rounded-2xl border p-3 transition-colors " +
                    workflowToneClasses[idx]
                  }
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-200 bg-white text-xs font-semibold text-sky-700">
                    {idx + 1}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">{step.detail}</p>
                  <p className="mt-auto pt-3 text-[11px] font-semibold text-slate-500">
                    {workflowStageLabels[idx]}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid w-full min-w-0 items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operational fit</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Assessor AI behaves like an assessment engine, not a standalone chatbot. It supports the full operational chain that Pearson-style delivery teams run: assessor decision, IQA/IV check, integrity screening, and moderation evidence.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {workflowFitTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex max-w-full break-words rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        </section>

        <section
          id="positioning"
          className="w-full min-w-0 scroll-mt-24 rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_18%_0%,rgba(14,165,233,0.07),transparent_62%)] p-6 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Positioning</p>
          <p className="mt-2 max-w-4xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            ChatGPT gives an opinion.
            <span className="block text-sky-800">Assessor AI gives a defensible assessment decision.</span>
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Structured evidence mapping, QA checks, Turnitin signals, and audit history are part of the same workflow.
          </p>
        </section>

        <section id="output-preview" className="w-full min-w-0 overflow-hidden scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Output preview</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Show the result, not just the promise</h2>
            </div>
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              Synthetic demo output (no real learner data)
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            <article className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(15,23,42,0.14)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI feedback panel</p>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">Submission: DEMO-014 · Unit 8</p>
                    <p className="text-[11px] text-slate-600">Brief version locked: BTEC-HN-U8-v3</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-teal-100 bg-teal-50/70 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                    Draft grade: Pass
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    "Criteria met: 2/3",
                    "Needs assessor confirmation: D1.1",
                    "Ready for QA handoff",
                  ].map((tag) => (
                    <span key={tag} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-[11px] font-semibold text-slate-800">P1.1 Safeguarding duties · Mapped evidence</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
                      Section 2.1 identifies legal duties and escalation path with role-specific examples.
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-[11px] font-semibold text-slate-800">M1.2 Risk response · Mapped evidence</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
                      Section 3.2 compares interventions, but D1.1 needs stronger justification depth.
                    </p>
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Suggested assessor feedback</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-700">
                    Pass and merit evidence are clear. To reach distinction, expand the rationale for intervention choice with explicit links to case risk factors.
                  </p>
                </div>
                <p className="mt-2 text-[11px] text-slate-600">Assessor can accept, edit, or send back for remap before IQA/IV check.</p>
              </div>
            </article>

            <article className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(15,23,42,0.14)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Criteria mapping</p>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>Criterion + evidence</span>
                  <span>Outcome</span>
                </div>
                <div className="mt-2 space-y-2">
                  {syntheticCriteriaRows.map((row) => (
                    <div key={row.criterion} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{row.criterion}</p>
                          <p className="text-[11px] text-slate-600">{row.evidence}</p>
                        </div>
                        <span
                          className={
                            "inline-flex h-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                            (row.outcome === "Met"
                              ? "border-teal-100 bg-teal-50/70 text-teal-700"
                              : "border-amber-100 bg-amber-50/70 text-amber-700")
                          }
                        >
                          {row.outcome}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(15,23,42,0.14)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">QA and Turnitin gate</p>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="space-y-2">
                  {syntheticQaChecks.map((check) => (
                    <div key={check.label} className="flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <p className="min-w-0 break-words pr-1 text-[11px] leading-5 text-slate-700">{check.label}</p>
                      <span
                        className={
                          "inline-flex h-fit shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                          (check.status === "Pass"
                            ? "border-teal-100 bg-teal-50/70 text-teal-700"
                            : check.status === "Review"
                              ? "border-amber-100 bg-amber-50/70 text-amber-700"
                              : "border-indigo-100 bg-indigo-50/70 text-indigo-700")
                        }
                      >
                        {check.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Audit sequence</p>
                  <ol className="mt-2 space-y-1.5">
                    {syntheticAuditEvents.map((event, idx) => (
                      <li key={event} className="flex items-start gap-2 text-[11px] text-slate-700">
                        <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-[10px] font-semibold text-slate-600">
                          {idx + 1}
                        </span>
                        <span>{event}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </article>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            This preview is intentionally synthetic. No student submissions, names, or institutional records are shown on the landing page.
          </p>
        </section>

        <section
          id="early-access"
          className="w-full min-w-0 scroll-mt-24 rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_15%_0%,rgba(14,165,233,0.06),rgba(255,255,255,0.96)_62%)] p-6 shadow-sm sm:p-7"
        >
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Early access</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Assessor-AI is still in active development</h2>
            <p className="mt-3 text-sm leading-7 text-slate-700">
              We are working with assessment teams to refine the workflow before broader rollout. If you want to test the platform or join the pilot, send a contact request and we will schedule onboarding.
            </p>
            <ContactEarlyAccessForm />
          </div>
        </section>
        </div>
      </div>
    );
  }

  const sessionOrgId = String((session as { orgId?: string | null }).orgId || "").trim() || null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
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
