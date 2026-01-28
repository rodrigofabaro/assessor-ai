Assessor-AI Patch Pack (2026-01-27)

Goal: teacher workflow = Upload → extraction starts automatically, plus more robust Students API & a calmer UI.

Copy these files into your repo at:
C:\Users\rodri\Website\assessor-ai\webapp\

(Keep folder structure.)

Files included:
- app/upload/page.tsx
- app/api/students/route.ts
- app/api/submissions/upload/route.ts
- app/submissions/[submissionId]/page.tsx
- docs/PROJECT_STATUS.md

After copying:
1) npm install (if needed)
2) npx prisma generate
3) npm run dev

Sanity test:
- Upload a PDF → you should see status move to EXTRACTING/EXTRACTED without clicking Extract.
- Upload page should no longer crash on students.map.
