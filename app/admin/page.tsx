import Link from "next/link";

const cards = [
  {
    title: "Specs",
    description: "Manage unit specifications, outcomes, criteria and grading context.",
    href: "/admin/specs",
  },
  {
    title: "Briefs",
    description: "Review assignment briefs, extraction status and publishing flow.",
    href: "/admin/briefs",
  },
  {
    title: "Students",
    description: "Browse learner records, submissions and supporting data.",
    href: "/admin/students",
  },
  {
    title: "System",
    description: "Open reference workflows and platform-level admin controls.",
    href: "/admin/reference",
  },
] as const;

const attentionRows = [
  { area: "Reference extraction", item: "3 docs waiting for review", priority: "High" },
  { area: "Brief publishing", item: "2 drafts missing rubric mapping", priority: "Medium" },
  { area: "Student records", item: "1 submission needs binding", priority: "Medium" },
];

export default function AdminIndexPage() {
  return (
    <div className="grid gap-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Admin console</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Manage the assessment workspace across specifications, briefs, student records and reference processing.
        </p>
      </header>

      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
          >
            <h2 className="text-base font-semibold text-zinc-900">{card.title}</h2>
            <p className="mt-2 text-sm text-zinc-600">{card.description}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Needs attention now</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Area</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Priority</th>
                </tr>
              </thead>
              <tbody>
                {attentionRows.map((row) => (
                  <tr key={row.item} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-medium text-zinc-800">{row.area}</td>
                    <td className="px-3 py-2 text-zinc-600">{row.item}</td>
                    <td className="px-3 py-2 text-zinc-600">{row.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Recently updated</h2>
          <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-sm text-zinc-500">
            Activity stream placeholder.
          </div>
        </article>
      </section>
    </div>
  );
}
