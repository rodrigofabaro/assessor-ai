import "./globals.css";
import TopNav from "@/components/TopNav";
import PageContainer, { LANE } from "@/components/PageContainer";
import ToastHost from "@/components/ui/ToastHost";
import DevBuildBadge from "@/components/DevBuildBadge";
import { validateRuntimeEnvContract } from "@/lib/runtimeEnvContract";
import AuthRoleSync from "@/components/auth/AuthRoleSync";
import { isAuthGuardsEnabled } from "@/lib/auth/rbac";

export const metadata = {
  title: "Assessor AI",
  description: "Upload submissions, assess against criteria, generate marked PDFs.",
  icons: {
    icon: "/api/favicon",
    shortcut: "/api/favicon",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  validateRuntimeEnvContract();
  const isDev = process.env.NODE_ENV === "development";
  const authGuardsEnabled = isAuthGuardsEnabled();
  const authBootstrapEnabled = /^(1|true|yes|on)$/i.test(String(process.env.AUTH_BOOTSTRAP_ENABLED || "false").trim());
  const appVersion = String(process.env.NEXT_PUBLIC_APP_VERSION || "1.0.3").trim();
  const releaseLabel = String(process.env.NEXT_PUBLIC_RELEASE_LABEL || "maintenance").trim();

  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
        <TopNav />
        <ToastHost />
        <AuthRoleSync enabled={authGuardsEnabled} bootstrapEnabled={authBootstrapEnabled} />
        {isDev ? <DevBuildBadge /> : null}

        <main className="flex-1">
          <PageContainer>{children}</PageContainer>
        </main>

        <footer className="border-t border-zinc-200/40 bg-zinc-50">
          <div className={LANE + " py-1.5"}>
            <div className="text-center text-[11px] leading-4 text-zinc-400">
              Assessor AI · v{appVersion} · {releaseLabel} · © {new Date().getFullYear()} Rodrigo
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
