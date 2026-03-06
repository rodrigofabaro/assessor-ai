import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getRequestSession } from "@/lib/auth/requestSession";
import { TinyIcon } from "@/components/ui/TinyIcon";
import ContactEarlyAccessForm from "./ContactEarlyAccessForm";

export const dynamic = "force-dynamic";

type TinyIconName = "reference" | "submissions" | "audit" | "upload" | "qa" | "users" | "app" | "workflow";
type DashboardAudience = "ASSESSOR" | "ORG_ADMIN" | "SUPER_ADMIN";

type DashboardStat = {
  label: string;
  value: number;
  hint: string;
};

type DashboardAction = {
  icon: TinyIconName;
  title: string;
  desc: string;
  href: string;
  cta: string;
};

type DashboardProfile = {
  badge: string;
  summary: string;
  primaryActions: Array<{ label: string; href: string; tone: "primary" | "secondary" }>;
  suggestedActions: string[];
  statCards: DashboardStat[];
  actionCards: DashboardAction[];
  pulseRows: Array<{ label: string; value: number; tone: "emerald" | "sky" | "amber" | "indigo" }>;
};

type DashboardStats = {
  specs: number;
  briefs: number;
  submissions: number;
  students: number;
  lockedSpecs: number;
  lockedBriefs: number;
  queueBlocked: number;
  organizations: number;
  users: number;
  teamUsers: number;
};

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
  return getRequestSession();
}

function emptyDashboardStats(): DashboardStats {
  return {
    specs: 0,
    briefs: 0,
    submissions: 0,
    students: 0,
    lockedSpecs: 0,
    lockedBriefs: 0,
    queueBlocked: 0,
    organizations: 0,
    users: 0,
    teamUsers: 0,
  };
}

async function getDashboardStats(session: { orgId?: string | null; isSuperAdmin?: boolean } | null): Promise<DashboardStats> {
  const orgId = String(session?.orgId || "").trim() || null;
  const isSuperAdmin = !!session?.isSuperAdmin;
  const docScope = !isSuperAdmin && orgId ? { organizationId: orgId } : {};
  const submissionScope = !isSuperAdmin && orgId ? { organizationId: orgId } : {};
  const studentScope = !isSuperAdmin && orgId ? { organizationId: orgId } : {};
  const userScope = !isSuperAdmin && orgId ? { organizationId: orgId } : {};

  try {
    const [
      specs,
      briefs,
      submissions,
      students,
      lockedSpecs,
      lockedBriefs,
      queueBlocked,
      organizations,
      users,
      teamUsers,
    ] = await Promise.all([
      prisma.referenceDocument.count({ where: { type: "SPEC", ...docScope } }),
      prisma.referenceDocument.count({ where: { type: "BRIEF", ...docScope } }),
      prisma.submission.count({ where: submissionScope }),
      prisma.student.count({ where: studentScope }),
      prisma.referenceDocument.count({ where: { type: "SPEC", status: "LOCKED", ...docScope } }),
      prisma.referenceDocument.count({ where: { type: "BRIEF", status: "LOCKED", ...docScope } }),
      prisma.submission.count({ where: { OR: [{ status: "FAILED" }, { status: "NEEDS_OCR" }], ...submissionScope } }),
      isSuperAdmin ? prisma.organization.count({ where: { isActive: true } }) : Promise.resolve(0),
      prisma.appUser.count({ where: userScope }),
      orgId ? prisma.appUser.count({ where: { organizationId: orgId, isActive: true } }) : Promise.resolve(0),
    ]);
    return {
      specs,
      briefs,
      submissions,
      students,
      lockedSpecs,
      lockedBriefs,
      queueBlocked,
      organizations,
      users,
      teamUsers,
    };
  } catch {
    return emptyDashboardStats();
  }
}

function resolveDashboardAudience(session: { role?: string | null; isSuperAdmin?: boolean } | null): DashboardAudience {
  if (session?.isSuperAdmin) return "SUPER_ADMIN";
  const role = String(session?.role || "").trim().toUpperCase();
  if (role === "ADMIN") return "ORG_ADMIN";
  return "ASSESSOR";
}

function buildDashboardProfile(audience: DashboardAudience, stats: DashboardStats): DashboardProfile {
  if (audience === "SUPER_ADMIN") {
    return {
      badge: "Platform control tower",
      summary:
        "You are in super-admin mode. Prioritize environment health, organization governance, and reference integrity across tenants.",
      primaryActions: [
        { label: "Open developer", href: "/admin/developer", tone: "primary" },
        { label: "Open users", href: "/admin/users", tone: "secondary" },
        { label: "Open specs", href: "/admin/specs", tone: "secondary" },
      ],
      suggestedActions: [
        "Run readiness checks before deployment (`/api/health/readiness`).",
        "Review organization and role boundaries before onboarding new users.",
        "Verify lock coverage for specs/briefs before grading expansion.",
      ],
      statCards: [
        { label: "Organizations", value: stats.organizations, hint: "Active organizations in platform scope" },
        { label: "Platform Users", value: stats.users, hint: "Users visible in current scope" },
        { label: "Submissions", value: stats.submissions, hint: "Total operational workload" },
        { label: "Queue Blocked", value: stats.queueBlocked, hint: "Submissions requiring intervention" },
        { label: "Specs", value: stats.specs, hint: "Reference specs in scope" },
        { label: "Briefs", value: stats.briefs, hint: "Brief records in scope" },
      ],
      actionCards: [
        {
          icon: "app",
          title: "Developer control",
          desc: "Manage platform-level settings, organizations, and diagnostics.",
          href: "/admin/developer",
          cta: "Open developer",
        },
        {
          icon: "users",
          title: "Platform users",
          desc: "Control access, role boundaries, and login recovery behavior.",
          href: "/admin/users",
          cta: "Open users",
        },
        {
          icon: "reference",
          title: "Reference governance",
          desc: "Oversee spec/brief extraction and lock quality for all lanes.",
          href: "/admin/specs",
          cta: "Open specs",
        },
        {
          icon: "audit",
          title: "Runtime audit",
          desc: "Inspect platform runtime events and high-severity signals.",
          href: "/admin/audit",
          cta: "Open audit",
        },
      ],
      pulseRows: [
        { label: "Organizations", value: stats.organizations, tone: "indigo" },
        { label: "Platform users", value: stats.users, tone: "sky" },
        { label: "Submissions", value: stats.submissions, tone: "emerald" },
        { label: "Queue blocked", value: stats.queueBlocked, tone: "amber" },
      ],
    };
  }

  if (audience === "ORG_ADMIN") {
    return {
      badge: "Organization operations",
      summary:
        "You are operating at organization-admin level. Keep team access clean, queue health stable, and reference coverage current.",
      primaryActions: [
        { label: "Open submissions", href: "/submissions", tone: "primary" },
        { label: "Open users", href: "/admin/users", tone: "secondary" },
        { label: "Open settings", href: "/admin/settings", tone: "secondary" },
      ],
      suggestedActions: [
        "Resolve blocked queue items first to protect grading throughput.",
        "Confirm assessors and IV roles are current for this organization.",
        "Review brief/spec lock status before batch grading windows.",
      ],
      statCards: [
        { label: "Team Users", value: stats.teamUsers, hint: "Active users linked to this organization" },
        { label: "Students", value: stats.students, hint: "Student profiles in scope" },
        { label: "Submissions", value: stats.submissions, hint: "Records in grading pipeline" },
        { label: "Queue Blocked", value: stats.queueBlocked, hint: "Records requiring manual attention" },
        { label: "Locked Specs", value: stats.lockedSpecs, hint: "Specs locked for grading reliability" },
        { label: "Locked Briefs", value: stats.lockedBriefs, hint: "Briefs locked for assignment mapping" },
      ],
      actionCards: [
        {
          icon: "submissions",
          title: "Daily operations",
          desc: "Track intake, extraction, grading, and QA flow for your teams.",
          href: "/submissions",
          cta: "Open submissions",
        },
        {
          icon: "users",
          title: "Team access",
          desc: "Manage user accounts, roles, and recovery support.",
          href: "/admin/users",
          cta: "Open users",
        },
        {
          icon: "qa",
          title: "Quality review",
          desc: "Review flagged outputs and moderation checkpoints.",
          href: "/admin/qa",
          cta: "Open QA",
        },
        {
          icon: "audit",
          title: "Audit trail",
          desc: "Inspect admin and runtime events for operational accountability.",
          href: "/admin/audit",
          cta: "Open audit",
        },
      ],
      pulseRows: [
        { label: "Team users", value: stats.teamUsers, tone: "indigo" },
        { label: "Students", value: stats.students, tone: "sky" },
        { label: "Submissions", value: stats.submissions, tone: "emerald" },
        { label: "Queue blocked", value: stats.queueBlocked, tone: "amber" },
      ],
    };
  }

  return {
    badge: "Assessor workspace",
    summary:
      "You are in assessor mode. Focus on blocked items first, then move through submissions, QA, and final audit-ready outputs.",
    primaryActions: [
      { label: "Open submissions", href: "/submissions", tone: "primary" },
      { label: "Upload", href: "/upload", tone: "secondary" },
      { label: "Open QA", href: "/admin/qa", tone: "secondary" },
    ],
    suggestedActions: [
      "Review blocked queue items first to keep grading throughput stable.",
      "Confirm spec and brief lock coverage before running grading cycles.",
      "Use QA lane after grading runs to keep decisions moderation-ready.",
    ],
    statCards: [
      { label: "Submissions", value: stats.submissions, hint: "Student evidence records" },
      { label: "Queue Blocked", value: stats.queueBlocked, hint: "Submissions requiring intervention" },
      { label: "Locked Specs", value: stats.lockedSpecs, hint: "Specs currently locked for grading" },
      { label: "Locked Briefs", value: stats.lockedBriefs, hint: "Briefs currently locked for grading" },
      { label: "Specs", value: stats.specs, hint: "Reference specs loaded" },
      { label: "Briefs", value: stats.briefs, hint: "Assignment briefs loaded" },
      { label: "Students", value: stats.students, hint: "Student profiles tracked" },
    ],
    actionCards: [
      {
        icon: "submissions",
        title: "Daily operations",
        desc: "Use Submissions for intake, extraction and grading workflow.",
        href: "/submissions",
        cta: "Open submissions",
      },
      {
        icon: "reference",
        title: "Specs and briefs",
        desc: "Check lock/version status and maintain reference quality.",
        href: "/admin/specs",
        cta: "Open specs",
      },
      {
        icon: "qa",
        title: "QA review",
        desc: "Review flagged outputs and moderation checks.",
        href: "/admin/qa",
        cta: "Open QA",
      },
      {
        icon: "users",
        title: "Users",
        desc: "Manage access, roles and organization assignment.",
        href: "/admin/users",
        cta: "Open users",
      },
    ],
    pulseRows: [
      { label: "Specs locked", value: stats.lockedSpecs, tone: "emerald" },
      { label: "Briefs locked", value: stats.lockedBriefs, tone: "sky" },
      { label: "Queue blocked", value: stats.queueBlocked, tone: "amber" },
      { label: "Submissions", value: stats.submissions, tone: "indigo" },
    ],
  };
}

async function getSessionIdentity(session: { userId?: string | null; orgId?: string | null } | null) {
  if (!session) {
    return {
      displayName: "Assessor",
      organizationName: "Organization scope pending",
    };
  }

  const userId = String(session.userId || "").trim();
  const orgId = String(session.orgId || "").trim();
  const isEnvUser = userId.startsWith("env:");

  const [user, org] = await Promise.all([
    !isEnvUser && userId
      ? prisma.appUser
          .findUnique({
            where: { id: userId },
            select: { fullName: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    orgId
      ? prisma.organization
          .findUnique({
            where: { id: orgId },
            select: { name: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    displayName: String(user?.fullName || (isEnvUser ? "Platform Admin" : "Assessor")).trim() || "Assessor",
    organizationName: String(org?.name || (orgId ? "Organization scope active" : "Global workspace")).trim(),
  };
}

export default async function LandingPage() {
  const session = await getSession();
  const [stats, identity] = await Promise.all([getDashboardStats(session), getSessionIdentity(session)]);

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

  const rawRole = String((session as { role?: string | null }).role || "ASSESSOR").trim().toUpperCase();
  const isSuperAdmin = !!(session as { isSuperAdmin?: boolean | null }).isSuperAdmin;
  const roleLabel = isSuperAdmin ? "SUPER_ADMIN" : rawRole === "ADMIN" ? "ORG_ADMIN" : rawRole || "ASSESSOR";
  const audience = resolveDashboardAudience(session as { role?: string | null; isSuperAdmin?: boolean | null });
  const profile = buildDashboardProfile(audience, stats);
  const sessionOrgId = String((session as { orgId?: string | null }).orgId || "").trim() || null;
  const pulseRows = profile.pulseRows;
  const pulseMax = Math.max(1, ...pulseRows.map((row) => row.value));
  const pulseTone = (tone: "emerald" | "sky" | "amber" | "indigo") => {
    if (tone === "emerald") return "bg-emerald-500";
    if (tone === "amber") return "bg-amber-500";
    if (tone === "indigo") return "bg-indigo-500";
    return "bg-sky-500";
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_52%),radial-gradient(circle_at_10%_0%,rgba(56,189,248,0.09),transparent_46%),#ffffff] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_14px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
              {profile.badge}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Welcome back, {identity.displayName}</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Role: <span className="font-semibold text-zinc-900">{roleLabel}</span>
              {" · "}
              Organization: <span className="font-semibold text-zinc-900">{identity.organizationName}</span>
              {sessionOrgId ? " · Scoped" : " · Global"}. {profile.summary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.primaryActions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={
                  action.tone === "primary"
                    ? "inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
                    : "inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {profile.statCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Operational pulse</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">Live</span>
          </div>
          <div className="mt-3 grid gap-3">
            {pulseRows.map((row) => {
              const pct = Math.max(6, Math.round((row.value / pulseMax) * 100));
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{row.label}</span>
                    <span className="font-semibold text-slate-900">{row.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${pulseTone(row.tone)}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <h2 className="text-sm font-semibold text-slate-900">Suggested next actions</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {profile.suggestedActions.map((action) => (
              <li key={action} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {action}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {profile.actionCards.map((card) => (
          <ActionCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            desc={card.desc}
            href={card.href}
            cta={card.cta}
          />
        ))}
      </section>
    </div>
  );
}
