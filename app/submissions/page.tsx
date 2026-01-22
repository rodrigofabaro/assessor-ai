"use client";

import { useEffect, useState } from "react";

type Submission = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  student?: { name: string };
  assignment?: { unitCode: string; assignmentRef?: string | null; title: string };
};

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [err, setErr] = useState<string>("");

  async function load() {
    setErr("");
    try {
      const res = await fetch("/api/submissions");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to load submissions (${res.status}): ${text}`);
      }
      const data = (await res.json()) as Submission[];
      setItems(data);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Submissions</h1>
        <a href="/upload" style={{ color: "#111827", textDecoration: "underline" }}>
          Upload more
        </a>
      </div>

      <button
        onClick={load}
        style={{
          marginTop: 12,
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #d1d5db",
          background: "white",
          cursor: "pointer",
        }}
      >
        Refresh
      </button>

      {err && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fee2e2" }}>
          {err}
        </div>
      )}

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: 10 }}>File</th>
              <th style={{ padding: 10 }}>Student</th>
              <th style={{ padding: 10 }}>Assignment</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10 }}>{s.filename}</td>
                <td style={{ padding: 10 }}>{s.student?.name ?? "-"}</td>
                <td style={{ padding: 10 }}>
                  {s.assignment
                    ? `${s.assignment.unitCode} ${s.assignment.assignmentRef ?? ""} — ${s.assignment.title}`
                    : "-"}
                </td>
                <td style={{ padding: 10 }}>{s.status}</td>
                <td style={{ padding: 10 }}>{new Date(s.uploadedAt).toLocaleString()}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td style={{ padding: 10 }} colSpan={5}>
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
