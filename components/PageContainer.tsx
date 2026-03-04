// components/PageContainer.tsx
import React from "react";

export const LANE = "mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8";
export const LANE_INNER = "mx-auto w-full max-w-[1400px]";

export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className={LANE + " pt-4 pb-7"}>
      <div className={LANE_INNER + " min-w-0"}>
        <div className="rounded-2xl border border-zinc-200/90 bg-white/85 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.035)] ring-1 ring-white/60 sm:p-4 lg:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
