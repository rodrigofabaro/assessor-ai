import dynamic from "next/dynamic";
export { AdminSettingsPage } from "./SettingsPageClient";

const SettingsPageClient = dynamic(() => import("./SettingsPageClient"), {
  ssr: false,
  loading: () => (
    <main className="py-2">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
        Loading settings...
      </section>
    </main>
  ),
});

export default function SettingsPage() {
  return <SettingsPageClient />;
}
