// components/PageContainer.tsx
import React from "react";

export default function PageContainer({
  children,
  fullWidth = false,
  className = "",
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}) {
  return (
    <div className={(fullWidth ? "w-full px-4 sm:px-6 lg:px-8 pt-4 pb-6" : "mx-auto w-full max-w-7xl px-4 pt-4 pb-6") + (className ? ` ${className}` : "")}>
      {children}
    </div>
  );
}
