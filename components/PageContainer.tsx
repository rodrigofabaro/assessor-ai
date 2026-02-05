// components/PageContainer.tsx
import React from "react";

export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 pb-6 pt-4 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
