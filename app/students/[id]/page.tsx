import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TinyIcon } from "@/components/ui/TinyIcon";


type StudentSummary = {
  lastSubmissionAt: string | null;
  lastOverallGrade: string | null;
  totalSubmissions: number;
  byStatus: Record<string, number>;
};

type SubmissionRow = {
  id: string;
  uploadedAt: string;
  assignmentId: string | null;
  assignmentTitle: string | null;
  status: string;
  overallGrade: string | null;
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function statusTone(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("graded") || s.includes("done") || s.includes("complete")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s.includes("fail") || s.includes("error")) return "border-red-200 bg-red-50 text-red-800";
  if (s.includes("review") || s.includes("pending") || s.includes("queue")) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const assignmentId = typeof sp.assignmentId === "string" ? sp.assignmentId : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const take = Math.min(parseInt(typeof sp.take === "string" ? sp.take : "50", 10) || 50, 200);
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      externalRef: true,
      courseName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!student) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-semibold">Student not found</h1>
        <div className="mt-3">
          <Link className="underline" href="/admin/students">
            Back to students
          </Link>
        </div>
      </div>
    );
  }

  const totalSubmissions = await prisma.submission.count({ where: { studentId: id } });

  const last = await prisma.submission.findFirst({
    where: { studentId: id },
    orderBy: [{ uploadedAt: "desc" }],
    select: {
      uploadedAt: true,
      // grade lives in Assessment in your schema, so we read latest assessment:
      assessments: { orderBy: [{ createdAt: "desc" }], take: 1, select: { overallGrade: true } },
    },
  });

  const byStatusRows = await prisma.submission.groupBy({
    by: ["status"],
    where: { studentId: id },
    _count: { _all: true },
  });

  const byStatus: Record<string, number> = {};
  for (const r of byStatusRows) byStatus[r.status] = r._count._all;

  const summary: StudentSummary = {
    totalSubmissions,
    lastSubmissionAt: (last?.uploadedAt as any) ?? null,
    lastOverallGrade: (last as any)?.assessments?.[0]?.overallGrade ?? null,
    byStatus,
  };

  const where: any = {
    studentId: id,
    ...(assignmentId ? { assignmentId } : {}),
    ...(status ? { status } : {}),
  };

  const rows = await prisma.submission.findMany({
    where,
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      uploadedAt: true,
      assignmentId: true,
      status: true,
      assignment: { select: { title: true } },
      assessments: { orderBy: [{ createdAt: "desc" }], take: 1, select: { overallGrade: true } },
    },
  });

  const hasMore = rows.length > take;
  const sliced = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

  const items: SubmissionRow[] = sliced.map((s: any) => ({
    id: s.id,
    uploadedAt: s.uploadedAt,
    assignmentId: s.assignmentId ?? null,
    assignmentTitle: s.assignment?.title ?? null,
    status: s.status,
    overallGrade: s.assessments?.[0]?.overallGrade ?? null,
  }));

  const activeStatus = typeof sp.status === "string" ? sp.status : "";
  const activeAssignmentId = typeof sp.assignmentId === "string" ? sp.assignmentId : "";
  const takeStr = typeof sp.take === "string" ? sp.take : "50";
  const statusBadges = Object.entries(summary.byStatus ?? {}).sort((a, b) => b[1] - a[1]);

  return (
      <div className="w-full py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <TinyIcon name="users" className="h-3 w-3" />
                Student profile
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{student.fullName ?? "Unnamed student"}</h1>
              <div className="mt-1 break-all text-sm text-zinc-700">
                <span>ID: {student.id}</span>
                {student.externalRef ? <span> · AB: {student.externalRef}</span> : null}
                {student.courseName ? <span> · Course: {student.courseName}</span> : null}
              </div>
              <div className="mt-1 text-sm text-zinc-600">{student.email ? <span>{student.email}</span> : <span>No email</span>}</div>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Link
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 sm:flex-none"
                href={`/submissions/new?studentId=${encodeURIComponent(student.id)}`}
              >
                <TinyIcon name="upload" className="h-3.5 w-3.5" />
                Upload submission
              </Link>
              <Link
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 sm:flex-none"
                href={`/submissions?studentId=${encodeURIComponent(student.id)}`}
              >
                <TinyIcon name="submissions" className="h-3.5 w-3.5" />
                All submissions
              </Link>
              <Link
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 sm:flex-none"
                href="/admin/students"
              >
                <TinyIcon name="users" className="h-3.5 w-3.5" />
                Manage student
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:col-span-1">
            <h2 className="text-sm font-semibold text-zinc-900">Snapshot</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-zinc-600">Total submissions</span>
                <span className="font-medium text-zinc-900">{summary.totalSubmissions}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-zinc-600">Last submission</span>
                <span className="font-medium text-zinc-900">{fmtDate(summary.lastSubmissionAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-zinc-600">Last grade</span>
                <span className="font-medium text-zinc-900">{summary.lastOverallGrade ?? "—"}</span>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-zinc-900">Statuses</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {statusBadges.length ? (
                  statusBadges.map(([k, v]) => (
                    <span key={k} className={["rounded-full border px-2 py-1 text-xs font-medium", statusTone(k)].join(" ")}>
                      {k}: <span className="font-semibold">{v}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-600">No submissions yet.</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Submissions</h2>

              <form className="flex w-full flex-wrap gap-2 text-sm sm:w-auto sm:justify-end" action={`/students/${student.id}`}>
                <input type="hidden" name="take" value={takeStr} />
                <input
                  className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 sm:w-48"
                  name="assignmentId"
                  placeholder="Assignment ID"
                  defaultValue={activeAssignmentId}
                />
                <input
                  className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 sm:w-40"
                  name="status"
                  placeholder="Status"
                  defaultValue={activeStatus}
                />
                <button className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 sm:w-auto" type="submit">
                  Apply filters
                </button>
                <Link
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 sm:w-auto"
                  href={`/students/${student.id}`}
                >
                  Reset
                </Link>
              </form>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-zinc-700">
                    <th className="border-b border-zinc-200 bg-white px-3 py-3">Uploaded</th>
                    <th className="border-b border-zinc-200 bg-white px-3 py-3">Assignment</th>
                    <th className="border-b border-zinc-200 bg-white px-3 py-3">Status</th>
                    <th className="border-b border-zinc-200 bg-white px-3 py-3">Grade</th>
                    <th className="border-b border-zinc-200 bg-white px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length ? (
                    items.map((s) => (
                      <tr key={s.id} className="text-zinc-800">
                        <td className="border-b border-zinc-100 px-3 py-3">{new Date(s.uploadedAt).toLocaleString()}</td>
                        <td className="border-b border-zinc-100 px-3 py-3">{s.assignmentTitle ?? s.assignmentId ?? "—"}</td>
                        <td className="border-b border-zinc-100 px-3 py-3">
                          <span className={["rounded-full border px-2 py-1 text-xs font-medium", statusTone(s.status)].join(" ")}>{s.status}</span>
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-3">{s.overallGrade ?? "—"}</td>
                        <td className="border-b border-zinc-100 px-3 py-3">
                          <Link
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                            href={`/submissions/${s.id}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-8 text-center text-sm text-zinc-600" colSpan={5}>
                        No submissions match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {nextCursor ? (
              <div className="mt-4">
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  href={`/students/${student.id}?${new URLSearchParams({
                    ...(activeAssignmentId ? { assignmentId: activeAssignmentId } : {}),
                    ...(activeStatus ? { status: activeStatus } : {}),
                    take: takeStr,
                    cursor: nextCursor,
                  }).toString()}`}
                >
                  Load more
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
  );
}
