// app/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "upload":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 3v12" />
          <path d="M7 8l5-5 5 5" />
          <path d="M4 21h16" />
        </svg>
      );
    case "book":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M4 19a2 2 0 0 0 2 2h14" />
          <path d="M6 2h14v20H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
          <path d="M8 6h8" />
          <path d="M8 10h8" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
        </svg>
      );
    case "users":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "checklist":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 2l1.2 4.2L17.5 7.5l-4.3 1.3L12 13l-1.2-4.2L6.5 7.5l4.3-1.3L12 2z" />
          <path d="M19 10l.7 2.4L22 13l-2.3.6L19 16l-.7-2.4L16 13l2.3-.6L19 10z" />
        </svg>
      );
    default:
      return null;
  }
}

function Pill({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "sky" | "cyan" | "emerald" | "amber";
}) {
  const tones: Record<string, string> = {
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  };

  return (
    <span className={"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold " + tones[tone]}>
      {children}
    </span>
  );
}

function CardLink({
  href,
  title,
  desc,
  tone,
  icon,
}: {
  href: string;
  title: string;
  desc: string;
  tone: "sky" | "cyan" | "emerald" | "amber";
  icon: "upload" | "book" | "doc" | "users";
}) {
  const toneMap: Record<string, { ring: string; badge: string; iconBg: string }> = {
    sky: { ring: "hover:ring-sky-200", badge: "bg-sky-50 text-sky-900 border-sky-200", iconBg: "bg-sky-100 text-sky-900" },
    cyan: { ring: "hover:ring-cyan-200", badge: "bg-cyan-50 text-cyan-900 border-cyan-200", iconBg: "bg-cyan-100 text-cyan-900" },
    emerald: { ring: "hover:ring-emerald-200", badge: "bg-emerald-50 text-emerald-900 border-emerald-200", iconBg: "bg-emerald-100 text-emerald-900" },
    amber: { ring: "hover:ring-amber-200", badge: "bg-amber-50 text-amber-950 border-amber-200", iconBg: "bg-amber-100 text-amber-950" },
  };

  const t = toneMap[tone];

  return (
    <Link
      href={href}
      className={
        "group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-transparent transition " +
        t.ring +
        " hover:shadow-md"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold " + t.badge}>
            <span className={"inline-flex h-7 w-7 items-center justify-center rounded-full " + t.iconBg}>
              <Icon name={icon} className="h-4 w-4" />
            </span>
            {title}
          </div>
          <div className="mt-3 text-sm text-zinc-700 leading-relaxed">{desc}</div>
        </div>

        <div className="shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</div>
      </div>
    </Link>
  );
}


function StatusRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-600">{label}</span>
      <span className="font-semibold text-zinc-900">{value ?? "—"}</span>
    </div>
  );
}

function StatusCard({
  specs,
  briefs,
  submissions,
  locked,
}: {
  specs?: number;
  briefs?: number;
  submissions?: number;
  locked?: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-transparent">
      <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-900">
          <Icon name="checklist" className="h-4 w-4" />
        </span>
        System status
      </div>

      <div className="mt-4 grid gap-2">
        <StatusRow label="Specs stored" value={specs} />
        <StatusRow label="Briefs stored" value={briefs} />
        <StatusRow label="Submissions uploaded" value={submissions} />
        <StatusRow label="Locked references" value={locked} />
      </div>

      <div className="mt-3 text-[11px] text-zinc-500">Counts update as data is added.</div>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-900">
          {n}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <div className="mt-1 text-sm text-zinc-700 leading-relaxed">{desc}</div>
        </div>
      </div>
    </div>
  );
}

async function getLiveHomeStatus() {
  try {
    const [specs, briefs, submissions, locked] = await Promise.all([
      prisma.referenceDocument.count({ where: { type: "SPEC" } }),
      prisma.referenceDocument.count({ where: { type: "BRIEF" } }),
      prisma.submission.count(),
      prisma.referenceDocument.count({
        where: {
          type: { in: ["SPEC", "BRIEF"] },
          lockedAt: { not: null },
        },
      }),
    ]);
    return { specs, briefs, submissions, locked };
  } catch {
    return { specs: undefined, briefs: undefined, submissions: undefined, locked: undefined };
  }
}

export default async function HomePage() {
  const status = await getLiveHomeStatus();

  return (
    <div className="grid gap-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-white to-zinc-50" />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="zinc">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  Ready
                </Pill>
                <Pill tone="cyan">
                  <Icon name="spark" className="h-4 w-4" />
                  Reference-driven grading
                </Pill>
                <Pill tone="amber">
                  <Icon name="checklist" className="h-4 w-4" />
                  Audit-friendly locks
                </Pill>
              </div>

              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Assessor AI</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-700 leading-relaxed">
                Lock references first (specs + brief mappings), then grade submissions consistently against the right criteria — with a paper trail.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/upload"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
              >
                Go to Upload
              </Link>
              <Link
                href="/admin"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                Go to Admin
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <CardLink
              href="/admin/specs"
              title="Spec Library"
              desc="Upload unit specs, extract LOs + criteria, then Approve & Lock the authoritative versions used by grading."
              tone="cyan"
              icon="book"
            />
            <CardLink
              href="/admin/briefs"
              title="Briefs Library"
              desc="Upload briefs, extract structure, link to a locked spec, then confirm mapping/rubric before locking."
              tone="emerald"
              icon="doc"
            />
            <CardLink
              href="/upload"
              title="Upload"
              desc="Upload student submissions (single or batch). When grading runs, it uses the locked references."
              tone="sky"
              icon="upload"
            />
            <CardLink
              href="/admin/students"
              title="Students"
              desc="Student records and submission tracking (grading history later)."
              tone="amber"
              icon="users"
            />
            <StatusCard
              specs={status.specs}
              briefs={status.briefs}
              submissions={status.submissions}
              locked={status.locked}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Admin workspace shortcuts</h2>
            <p className="mt-1 text-sm text-zinc-700">Primary admin sections available from the top navigation.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ["/admin", "Overview"],
            ["/admin/audit", "Audit"],
            ["/admin/briefs", "Briefs"],
            ["/admin/library", "Library"],
            ["/admin/qa", "QA"],
            ["/admin/settings", "Settings"],
            ["/admin/specs", "Specs"],
            ["/admin/students", "Students"],
            ["/admin/users", "Users"],
          ].map(([href, label]) => (
            <Link
              key={String(href)}
              href={String(href)}
              className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="text-xs text-zinc-600">
          Advanced tools (direct link):{" "}
          <Link href="/admin/reference" className="font-semibold text-zinc-800 hover:underline">
            Reference
          </Link>{" "}
          and{" "}
          <Link href="/admin/bindings" className="font-semibold text-zinc-800 hover:underline">
            Bindings
          </Link>
          .
        </div>
      </section>

      {/* Workflow */}
      <section className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">How it works</h2>
            <p className="mt-1 text-sm text-zinc-700">Keep it boring on purpose: references first, then submissions, then grading.</p>
          </div>
          <div className="hidden sm:block text-xs text-zinc-500">Upload → Extract → Review → Lock → Grade</div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Step
            n="1"
            title="Lock your unit specs"
            desc="In Spec Library, extract learning outcomes and P/M/D criteria from the spec, then Approve & Lock."
          />
          <Step
            n="2"
            title="Prepare briefs for grading"
            desc="In Briefs Library, link each brief to the correct locked spec, confirm mappings/rubric, then Approve & Lock."
          />
          <Step
            n="3"
            title="Upload submissions"
            desc="Upload student work. When grading runs, it uses the locked references — no drift, no guessing."
          />
        </div>
      </section>
    </div>
  );
}
