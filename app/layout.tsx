import "./globals.css";
import TopNav from "@/components/TopNav";
import PageContainer, { LANE } from "@/components/PageContainer";

export const metadata = {
  title: "Assessor AI",
  description: "Upload submissions, assess against criteria, generate marked PDFs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
        <TopNav />

        <main className="flex-1">
          <PageContainer>{children}</PageContainer>
        </main>

        <footer className="border-t border-zinc-200/40 bg-zinc-50">
          <div className={LANE + " py-1.5"}>
            <div className="text-center text-[11px] leading-4 text-zinc-400">
              Assessor AI · v0.1 · © {new Date().getFullYear()} Rodrigo
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
