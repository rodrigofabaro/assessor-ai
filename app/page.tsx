import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySignedSessionToken } from "@/lib/auth/session";
import { TinyIcon } from "@/components/ui/TinyIcon";

export const dynamic = "force-dynamic";

type TinyIconName = "reference" | "submissions" | "audit" | "upload" | "qa" | "users" | "app" | "workflow";
type AccentTone = "sky" | "cyan" | "emerald" | "indigo" | "violet" | "amber" | "slate";

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

function MarketingCard({
  icon,
  title,
  description,
  bullets,
  accent,
  className = "",
}: {
  icon: TinyIconName;
  title: string;
  description: string;
  bullets: string[];
  accent: AccentTone;
  className?: string;
}) {
  const accentBar =
    accent === "emerald"
      ? "bg-emerald-500"
      : accent === "cyan"
        ? "bg-cyan-500"
        : accent === "indigo"
          ? "bg-indigo-500"
          : accent === "violet"
            ? "bg-violet-500"
            : accent === "amber"
              ? "bg-amber-500"
              : accent === "slate"
                ? "bg-slate-500"
                : "bg-sky-500";
  const accentIcon =
    accent === "emerald"
      ? "border-emerald-100 bg-emerald-50 text-emerald-800"
      : accent === "cyan"
        ? "border-cyan-100 bg-cyan-50 text-cyan-800"
        : accent === "indigo"
          ? "border-indigo-100 bg-indigo-50 text-indigo-800"
          : accent === "violet"
            ? "border-violet-100 bg-violet-50 text-violet-800"
            : accent === "amber"
              ? "border-amber-100 bg-amber-50 text-amber-800"
              : accent === "slate"
                ? "border-slate-100 bg-slate-50 text-slate-800"
                : "border-sky-100 bg-sky-50 text-sky-800";
  return (
    <article className={`rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm ${className}`.trim()}>
      <div className={"mb-4 h-1 w-14 rounded-full " + accentBar} />
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900">
        <span className={"inline-flex h-8 w-8 items-center justify-center rounded-lg border " + accentIcon}>
          <TinyIcon name={icon} className="h-4 w-4" />
        </span>
        {title}
      </h2>
      <p className="mt-3 text-[15px] leading-7 text-zinc-700">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {bullets.map((b) => (
          <span key={b} className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold " + accentIcon}>
            {b}
          </span>
        ))}
      </div>
    </article>
  );
}

function WorkflowStep({
  n,
  title,
  description,
}: {
  n: number;
  title: string;
  description: string;
}) {
  const tone =
    n === 1
      ? "border-sky-100 bg-sky-50 text-sky-800"
      : n === 2
        ? "border-cyan-100 bg-cyan-50 text-cyan-800"
        : n === 3
          ? "border-emerald-100 bg-emerald-50 text-emerald-800"
          : "border-violet-100 bg-violet-50 text-violet-800";
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className={"inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-xs font-semibold " + tone}>
        {n}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-sm leading-7 text-zinc-700">{description}</p>
    </article>
  );
}

function EvidenceCard({
  icon,
  title,
  description,
  accent,
}: {
  icon: TinyIconName;
  title: string;
  description: string;
  accent: AccentTone;
}) {
  const accentIcon =
    accent === "emerald"
      ? "border-emerald-100 bg-emerald-50 text-emerald-800"
      : accent === "cyan"
        ? "border-cyan-100 bg-cyan-50 text-cyan-800"
        : accent === "indigo"
          ? "border-indigo-100 bg-indigo-50 text-indigo-800"
          : accent === "violet"
            ? "border-violet-100 bg-violet-50 text-violet-800"
            : accent === "amber"
              ? "border-amber-100 bg-amber-50 text-amber-800"
              : accent === "slate"
                ? "border-slate-100 bg-slate-50 text-slate-800"
                : "border-sky-100 bg-sky-50 text-sky-800";
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <span className={"inline-flex h-7 w-7 items-center justify-center rounded-lg border " + accentIcon}>
          <TinyIcon name={icon} className="h-4 w-4" />
        </span>
        {title}
      </h3>
      <p className="mt-2 text-[15px] leading-7 text-zinc-700">{description}</p>
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
      prisma.submission.count({ where: { status: { in: ["FAILED", "NEEDS_OCR"] as any } } }),
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
      <div className="grid gap-3 sm:gap-4">
        <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-white to-zinc-100/70" />
          <div className="relative grid items-center gap-5 p-5 sm:p-7 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                Pearson-ready assessment platform
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">Assessor AI</h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-700 sm:text-base">
                Clean, controlled workflow from evidence upload to moderated outcome, with locked references and clear audit traceability.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Sign in
                </Link>
                <p className="text-xs font-medium text-zinc-600">Built for teams that need consistent, auditable outcomes.</p>
              </div>
            </div>

            <aside className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-3.5 shadow-sm sm:p-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
                  <TinyIcon name="app" className="h-3.5 w-3.5" />
                </span>
                Platform at a glance
              </h2>
              <div className="mt-2.5 grid gap-2">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Reference layer</div>
                  <p className="mt-0.5 text-sm text-zinc-700">Versioned specs and briefs with lock controls.</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Assessment flow</div>
                  <p className="mt-0.5 text-sm text-zinc-700">Intake, extraction, grading, and feedback in one path.</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Assurance</div>
                  <p className="mt-0.5 text-sm text-zinc-700">Traceable history for moderation and quality review.</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Built for</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              "Vocational providers",
              "Awarding organizations",
              "Internal quality teams",
              "Self-employed assessors",
            ].map((label) => (
              <span key={label} className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                {label}
              </span>
            ))}
          </div>
        </section>

        <section id="features" className="grid auto-rows-fr gap-3 md:grid-cols-3">
          <MarketingCard
            icon="reference"
            title="Reference Governance"
            description="Lock approved specs and briefs before grading starts."
            bullets={["Versioning", "Lock controls"]}
            accent="indigo"
          />
          <MarketingCard
            icon="submissions"
            title="Evidence Workflow"
            description="Run intake, extraction, grading, and feedback in one flow."
            bullets={["Structured intake", "QA checks"]}
            accent="emerald"
          />
          <MarketingCard
            icon="audit"
            title="Moderation Confidence"
            description="Keep decision history visible for IV, QA, and external review."
            bullets={["Event history", "Audit readiness"]}
            accent="slate"
          />
        </section>

        <section className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/85 via-white to-orange-50/70 p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_1.1fr] md:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Why Assessor AI is different</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">
                Built for defensible assessment operations, not generic automation.
              </h2>
              <p className="mt-2 text-sm leading-7 text-zinc-700">
                Most tools automate isolated steps. Assessor AI keeps reference context governed, runs a consistent operational flow, and preserves evidence history for QA and moderation.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-white/80 px-3">
              {[
                {
                  icon: "reference" as TinyIconName,
                  title: "Governed references",
                  text: "Assessment runs against approved and locked spec/brief context.",
                },
                {
                  icon: "submissions" as TinyIconName,
                  title: "Operational flow",
                  text: "Intake, extraction, grading, and feedback run in one controlled journey.",
                },
                {
                  icon: "audit" as TinyIconName,
                  title: "Evidence traceability",
                  text: "QA and moderation can review decisions without reconstruction work.",
                },
              ].map((item, idx) => (
                <div
                  key={item.title}
                  className={"py-3 " + (idx < 2 ? "border-b border-amber-100" : "")}
                >
                  <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                      <TinyIcon name={item.icon} className="h-3.5 w-3.5" />
                    </span>
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-700">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Internal workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Role: {session.role}
              {session.orgId ? " · Organization scope active" : ""}. Use the shortcuts below to continue operations.
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
