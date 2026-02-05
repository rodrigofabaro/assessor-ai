// components/PageContainer.tsx
import React from "react";

export const LANE = "mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8";

export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className={LANE + " pt-4 pb-6"}>
      {children}
    </div>
  );
}
