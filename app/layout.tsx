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
      <body style={{ fontFamily: "sans-serif" }}>
        <header
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e5e5",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <strong>Assessor AI</strong>
          <nav style={{ display: "flex", gap: 12 }}>
            <Link href="/">Home</Link>
            <Link href="/upload">Upload</Link>
            <Link href="/submissions">Submissions</Link>
            <Link href="/admin/reference">Admin: Reference</Link>
          </nav>
        </header>
        <main style={{ padding: 16 }}>{children}</main>
      </body>
    </html>
  );
}
