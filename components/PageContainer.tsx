// components/PageContainer.tsx
import React from "react";
import Container from "@/components/layout/Container";

export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <Container className="pt-4 pb-6">
      {children}
    </Container>
  );
}
