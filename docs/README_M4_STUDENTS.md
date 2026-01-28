# M4 — Student Detail Page (Drop-in files)

These files add the new route:
- `GET /students/[studentId]`

And its APIs:
- `GET /api/students/[studentId]`
- `GET /api/students/[studentId]/submissions`

## Where to put them
Copy the folder structure into your `webapp/` root:

- `app/students/[studentId]/page.tsx`
- `app/api/students/[studentId]/route.ts`
- `app/api/students/[studentId]/submissions/route.ts`

## Assumptions (rename if yours differ)
This code assumes Prisma models exist:

- `student` (fields: id, fullName, email, programme, createdAt)
- `submission` (fields: id, studentId, assignmentId, status, uploadedAt; relation: assignment)
- `assignment` (fields: id, title)
- `gradeResult` (fields: submissionId, overallGrade, createdAt)

If your grade table isn't implemented yet, you can safely:
- remove the `gradeResult` lookups in the API routes
- or keep them; the code catches failures and returns null grades.

## Prisma import
This assumes you have:
`lib/prisma.ts` exporting `prisma` as PrismaClient:
`export const prisma = new PrismaClient()`

If yours is `lib/db.ts`, change:
`import { prisma } from "@/lib/prisma";` accordingly.

## Base URL note
The page uses `NEXT_PUBLIC_BASE_URL` if present. If not, it calls relative `/api/...` which works in Next.js.
If you see fetch issues in dev, set:
`NEXT_PUBLIC_BASE_URL=http://localhost:3000`

## Quick test
1) Run dev server.
2) Visit: `/students/<some-student-id>`
3) You should see the student snapshot + submissions table with click-through links.
