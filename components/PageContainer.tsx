// components/PageContainer.tsx
import React from "react";

export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 pb-6">
      {children}
    </div>
  );
}
