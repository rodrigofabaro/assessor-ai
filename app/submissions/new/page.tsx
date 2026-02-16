import { redirect } from "next/navigation";

export default function SubmissionsNewPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const studentIdRaw = searchParams?.studentId;
  const studentId = Array.isArray(studentIdRaw) ? studentIdRaw[0] : studentIdRaw;
  const next = studentId ? `/upload?studentId=${encodeURIComponent(studentId)}` : "/upload";
  redirect(next);
}

