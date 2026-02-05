import Link from "next/link";

function Icon({ name, className = "h-4 w-4" }: { name: "book" | "doc" | "users" | "check"; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
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
    case "check":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
  }
}

type Tone = {
  badge: string;
  iconBg: string;
};

const tones: Record<"specs" | "briefs" | "students" | "system", Tone> = {
  specs: {
    badge: "bg-cyan-50 text-cyan-900 border-cyan-200",
    iconBg: "bg-cyan-100 text-cyan-900",
  },
  briefs: {
    badge: "bg-emerald-50 text-emerald-900 border-emerald-200",
    iconBg: "bg-emerald-100 text-emerald-900",
  },
  students: {
    badge: "bg-amber-50 text-amber-900 border-amber-200",
    iconBg: "bg-amber-100 text-amber-900",
  },
  system: {
    badge: "bg-zinc-50 text-zinc-900 border-zinc-200",
    iconBg: "bg-zinc-100 text-zinc-900",
  },
};

function ConsoleCard({
  label,
  desc,
  cta,
  href,
  icon,
  tone,
  stats,
}: {
  label: string;
  desc: string;
  cta: string;
  href: string;
  icon: "book" | "doc" | "users" | "check";
  tone: keyof typeof tones;
  stats: Array<{ label: string; value: string }>;
}) {
  const t = tones[tone];
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className={"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold " + t.badge}>
        <span className={"inline-flex h-7 w-7 items-center justify-center rounded-full " + t.iconBg}>
          <Icon name={icon} />
        </span>
        {label}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-zinc-700">{desc}</p>

      <div className="mt-4 grid gap-2">
        {stats.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <span className="text-zinc-600">{row.label}</span>
            <span className="font-semibold text-zinc-900">{row.value}</span>
          </div>
        ))}
      </div>

      <Link
        href={href}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
      >
        {cta}
      </Link>
    </section>
  );
}

export default function AdminDashboardPage() {
  return (
    <div className="grid gap-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">Admin console</h1>
        <p className="mt-1 text-sm text-zinc-700">
          Operate reference quality and student records from one place with audit-friendly, lock-first workflows.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <ConsoleCard
          label="Specs"
          desc="Maintain the spec library and lock authoritative issues for consistent grading."
          cta="Open specs"
          href="/admin/specs"
          icon="book"
          tone="specs"
          stats={[
            { label: "Locked specs", value: "—" },
            { label: "Need review", value: "—" },
          ]}
        />
        <ConsoleCard
          label="Briefs"
          desc="Review extracted briefs, confirm mappings, and lock versions used by assessment."
          cta="Open briefs"
          href="/admin/briefs"
          icon="doc"
          tone="briefs"
          stats={[
            { label: "Locked briefs", value: "—" },
            { label: "Needs mapping", value: "—" },
          ]}
        />
        <ConsoleCard
          label="Students"
          desc="Keep student records tidy and searchable for operational marking workflows."
          cta="Open students"
          href="/admin/students"
          icon="users"
          tone="students"
          stats={[
            { label: "Students", value: "—" },
            { label: "With submissions", value: "—" },
          ]}
        />
        <ConsoleCard
          label="System"
          desc="Monitor operational readiness and keep extraction/locking queues under control."
          cta="Open reference inbox"
          href="/admin/reference"
          icon="check"
          tone="system"
          stats={[
            { label: "Queued extracts", value: "—" },
            { label: "Failed tasks", value: "—" },
          ]}
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Needs attention now</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-600">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Area</th>
                <th className="px-4 py-2 text-left font-semibold">Issue</th>
                <th className="px-4 py-2 text-left font-semibold">Owner</th>
                <th className="px-4 py-2 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-100">
                <td className="px-4 py-3 text-zinc-700">Specs</td>
                <td className="px-4 py-3 text-zinc-700">Extraction queue status will appear here as data is available.</td>
                <td className="px-4 py-3 text-zinc-700">Admin</td>
                <td className="px-4 py-3">
                  <Link href="/admin/specs" className="text-sm font-semibold text-zinc-900 hover:underline">
                    Review specs
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Recently updated</h2>
        <p className="mt-2 text-sm text-zinc-600">Recent updates will populate here once records are edited and locked.</p>
      </section>
    </div>
  );
}
