import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySignedSessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function Feature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-700">{description}</p>
    </article>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900">{value}</div>
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
    const [specs, briefs, submissions, students] = await Promise.all([
      prisma.referenceDocument.count({ where: { type: "SPEC" } }),
      prisma.referenceDocument.count({ where: { type: "BRIEF" } }),
      prisma.submission.count(),
      prisma.student.count(),
    ]);
    return { specs, briefs, submissions, students };
  } catch {
    return { specs: "—", briefs: "—", submissions: "—", students: "—" };
  }
}

export default async function LandingPage() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="grid gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-white to-emerald-50" />
          <div className="relative p-6 sm:p-8">
            <p className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              Pearson-ready assessment workflow
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Assessor AI
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-700 sm:text-base">
              Assessor AI is a governed grading platform for vocational assessment teams. It helps you extract and lock
              specs and briefs, process student evidence, grade consistently, and keep an audit-ready history.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Sign in to continue
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Feature
            title="Reference-controlled grading"
            description="Specs and briefs are versioned and locked before they are used by live grading flows."
          />
          <Feature
            title="Evidence and feedback pipeline"
            description="Upload submissions, process extraction and mapping checks, then generate feedback outputs."
          />
          <Feature
            title="Audit and compliance trace"
            description="Operational events and settings changes are traceable for QA, IV, and external review."
          />
        </section>
      </div>
    );
  }

  const stats = await getDashboardStats();
  return (
    <div className="grid gap-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Internal workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
            <p className="mt-1 text-sm text-zinc-700">Role: {session.role}. Use the shortcuts below to continue operations.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className="inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
              Admin
            </Link>
            <Link href="/submissions" className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
              Submissions
            </Link>
            <Link href="/upload" className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
              Upload
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Specs" value={stats.specs} />
        <StatCard label="Briefs" value={stats.briefs} />
        <StatCard label="Submissions" value={stats.submissions} />
        <StatCard label="Students" value={stats.students} />
      </section>
    </div>
  );
}
