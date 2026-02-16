// components/PageContainer.tsx
import React from "react";

export const LANE = "mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8";
export const LANE_INNER = "mx-auto w-full max-w-[1400px]";

export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className={LANE + " pt-4 pb-7"}>
      <div className={LANE_INNER + " min-w-0"}>{children}</div>
    </div>
  );
}
