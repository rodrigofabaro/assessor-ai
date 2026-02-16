import { Suspense } from "react";
import { UploadPageClient } from "./UploadPageClient";

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-600">Loading upload page...</div>}>
      <UploadPageClient />
    </Suspense>
  );
}
