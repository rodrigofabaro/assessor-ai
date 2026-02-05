import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PageContainer from "@/components/PageContainer";


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
      <PageContainer>
        <div className="p-6">
        <h1 className="text-xl font-semibold">Student not found</h1>
        <div className="mt-3">
          <Link className="underline" href="/admin/students">
            Back to students
          </Link>
        </div>
        </div>
      </PageContainer>
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
    <PageContainer>
      <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs opacity-70">Student profile</div>
          <h1 className="text-2xl font-semibold">{student.fullName ?? "Unnamed student"}</h1>
          <div className="mt-1 text-sm opacity-80">
            <span>ID: {student.id}</span>
            {student.externalRef ? <span> · AB: {student.externalRef}</span> : null}
            {student.courseName ? <span> · Course: {student.courseName}</span> : null}
          </div>
          <div className="mt-1 text-sm opacity-80">{student.email ? <span>{student.email}</span> : <span>No email</span>}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm hover:opacity-80" href={`/submissions/new?studentId=${encodeURIComponent(student.id)}`}>
            Upload submission
          </Link>
          <Link className="rounded-md border px-3 py-2 text-sm hover:opacity-80" href={`/submissions?studentId=${encodeURIComponent(student.id)}`}>
            All submissions
          </Link>
          <Link className="rounded-md border px-3 py-2 text-sm hover:opacity-80" href={`/admin/students`}>
            Edit student
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-4 md:col-span-1">
          <h2 className="text-sm font-semibold opacity-80">Snapshot</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="opacity-70">Total submissions</span>
              <span className="font-medium">{summary.totalSubmissions}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="opacity-70">Last submission</span>
              <span className="font-medium">{fmtDate(summary.lastSubmissionAt)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="opacity-70">Last grade</span>
              <span className="font-medium">{summary.lastOverallGrade ?? "—"}</span>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold opacity-80">Statuses</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {statusBadges.length ? (
                statusBadges.map(([k, v]) => (
                  <span key={k} className="rounded-full border px-2 py-1 text-xs">
                    {k}: <span className="font-semibold">{v}</span>
                  </span>
                ))
              ) : (
                <span className="text-sm opacity-70">No submissions yet.</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 md:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold opacity-80">Submissions</h2>

            <form className="flex flex-wrap gap-2 text-sm" action={`/students/${student.id}`}>
              <input type="hidden" name="take" value={takeStr} />
              <input className="rounded-md border px-2 py-1" name="assignmentId" placeholder="Assignment ID" defaultValue={activeAssignmentId} />
              <input className="rounded-md border px-2 py-1" name="status" placeholder="Status" defaultValue={activeStatus} />
              <button className="rounded-md border px-3 py-1 hover:opacity-80" type="submit">
                Filter
              </button>
              <Link className="rounded-md border px-3 py-1 hover:opacity-80" href={`/students/${student.id}`}>
                Reset
              </Link>
            </form>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Uploaded</th>
                  <th className="py-2 pr-4">Assignment</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Grade</th>
                  <th className="py-2 pr-0">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="py-2 pr-4">{new Date(s.uploadedAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">{s.assignmentTitle ?? s.assignmentId ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full border px-2 py-1 text-xs">{s.status}</span>
                      </td>
                      <td className="py-2 pr-4">{s.overallGrade ?? "—"}</td>
                      <td className="py-2 pr-0">
                        <Link className="underline hover:opacity-80" href={`/submissions/${s.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 opacity-70" colSpan={5}>
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
                className="rounded-md border px-3 py-2 text-sm hover:opacity-80"
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
    </PageContainer>
  );
}
