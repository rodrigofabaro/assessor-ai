import dynamic from "next/dynamic";

const SubmissionDetailClient = dynamic(() => import("./SubmissionDetailClient"), {
  ssr: false,
  loading: () => (
    <main className="py-3">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
        Loading submission workspace...
      </section>
    </main>
  ),
});

export default function SubmissionDetailPage() {
  return <SubmissionDetailClient />;
}
