import "./globals.css";
import Link from "next/link";
import TopNav from "@/components/TopNav";

export const metadata = {
  title: "Assessor AI",
  description: "Upload submissions, assess against criteria, generate marked PDFs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900">
        <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white">
                AI
              </span>
              <span className="text-base font-semibold tracking-tight">
                Assessor AI
              </span>
            </Link>

            <TopNav />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
