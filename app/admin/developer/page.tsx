import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth/requestSession";
import DeveloperPageClient from "./DeveloperPageClient";

export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const session = await getRequestSession();
  const isSuperAdmin = !!session?.isSuperAdmin || String(session?.userId || "").startsWith("env:");
  if (!isSuperAdmin) {
    redirect("/admin?forbidden=developer");
  }
  return <DeveloperPageClient />;
}

