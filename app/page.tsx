import Link from "next/link";

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

export default function LandingPage() {
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
            specs and briefs, process student evidence, grade consistently, and keep an audit-ready history of what
            changed and when.
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

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Access model</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">
          This landing page is public. All operational pages and APIs require authenticated access.
        </p>
      </section>
    </div>
  );
}
