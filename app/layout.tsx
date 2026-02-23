import "./globals.css";
import TopNav from "@/components/TopNav";
import PageContainer, { LANE } from "@/components/PageContainer";
import ToastHost from "@/components/ui/ToastHost";
import DevBuildBadge from "@/components/DevBuildBadge";

export const metadata = {
  title: "Assessor AI",
  description: "Upload submissions, assess against criteria, generate marked PDFs.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV === "development";
  const appVersion = String(process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0").trim();
  const releaseLabel = String(process.env.NEXT_PUBLIC_RELEASE_LABEL || "completed").trim();

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
        <TopNav />
        <ToastHost />
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
