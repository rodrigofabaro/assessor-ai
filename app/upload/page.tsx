import { Suspense } from "react";
import { UploadPageClient } from "./UploadPageClient";

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Loading upload workspace...</div>
          <div className="mt-1 text-sm text-zinc-600">Preparing students, assignments, and file controls.</div>
        </section>
      }
    >
      <UploadPageClient />
    </Suspense>
  );
}
