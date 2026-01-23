import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Assessor AI",
  description: "Upload submissions, assess against criteria, generate marked PDFs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white">
                AI
              </span>
              <span className="text-base font-semibold tracking-tight">Assessor AI</span>
            </Link>

            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <Link className="hover:underline" href="/upload">
                Upload
              </Link>
              <Link className="hover:underline" href="/submissions">
                Submissions
              </Link>
              <span className="hidden text-zinc-300 md:inline">|</span>
              <Link className="hover:underline" href="/admin/reference">
                Reference
              </Link>
              <Link className="hover:underline" href="/admin/bindings">
                Bindings
              </Link>
              <Link className="hover:underline" href="/admin/students">
                Students
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
