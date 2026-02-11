# Repository map

## Purpose
Assessor AI is a Next.js + Prisma application for managing assessment inputs and workflow data across three broad domains: (1) student submission intake and extraction, (2) reference document ingestion (specs/briefs/rubrics) and locking, and (3) admin-facing management of units, criteria, students, and assignment mappings.

The runtime is API-first inside the Next.js App Router (`app/api/*`), with React route pages and reusable UI components in `app/*` and `components/*`, and data/state logic split into `lib/*` modules. Persistent state is modeled in Prisma and backed by PostgreSQL.

## Folder tree (top 2–3 levels)

```text
.
├─ app/
│  ├─ api/
│  │  ├─ submissions/
│  │  ├─ reference-documents/
│  │  ├─ reference-imports/
│  │  ├─ students/
│  │  ├─ assignments/
│  │  └─ units/
│  ├─ admin/
│  │  ├─ briefs/
│  │  ├─ library/
│  │  ├─ reference/
│  │  ├─ specs/
│  │  └─ students/
│  ├─ upload/
│  ├─ submissions/
│  └─ students/
├─ components/
│  ├─ admin/
│  ├─ submissions/
│  ├─ upload/
│  ├─ spec/
│  └─ ui/
├─ lib/
│  ├─ extraction/
│  │  ├─ parsers/
│  │  ├─ storage/
│  │  ├─ text/
│  │  └─ utils/
│  ├─ extractors/
│  ├─ submissions/
│  ├─ upload/
│  └─ ui/
├─ prisma/
│  ├─ migrations/
│  ├─ schema.prisma
│  ├─ seed.cjs
│  └─ seed.ts
├─ scripts/
│  └─ dev/
├─ src/
│  ├─ app/
│  ├─ lib/
│  └─ types/
├─ tests/
│  └─ fixtures/
├─ tools/
│  └─ smoke/
└─ docs/
```

## Key modules

- **App shell / routing** → `app/layout.tsx`, `app/page.tsx`  
  Defines global layout/navigation and route-level UI entry points.
- **Submission upload API** → `app/api/submissions/upload/route.ts`  
  Accepts PDF/DOCX files, stores files under `uploads/`, creates `Submission` records, and triggers extraction.
- **Submission extraction API** → `app/api/submissions/[submissionId]/extract/route.ts`  
  Starts extraction runs, persists per-page extraction output, derives status (`EXTRACTED`, `NEEDS_OCR`, `FAILED`), and updates submission text.
- **Submission query/update API** → `app/api/submissions/route.ts`, `app/api/submissions/[submissionId]/route.ts`  
  Lists submissions and supports linking to students with audit fields.
- **Reference document API** → `app/api/reference-documents/route.ts`  
  Upload/list endpoint for reference documents (SPEC/BRIEF/RUBRIC), including checksum and filesystem persistence.
- **Reference extraction API** → `app/api/reference-documents/extract/route.ts` + `lib/extraction/index.ts`  
  Resolves file path, runs extraction/parsing, writes extraction warnings/results into `ReferenceDocument`.
- **Reference lock/unlock APIs** → `app/api/reference-documents/lock/route.ts`, `app/api/reference-documents/unlock/route.ts`  
  Commits extracted drafts into canonical Unit/LO/criteria/brief mappings and enforces lock lifecycle.
- **Legacy/manual commit endpoint** → `app/api/reference-imports/commit/route.ts`  
  Commits supplied draft payloads to Unit/Brief records and criterion mappings.
- **Upload UI flow** → `app/upload/page.tsx`, `components/upload/*`, `lib/upload/*`  
  Handles picker loading, optional student creation, file selection, and upload POST.
- **Submissions UI flow** → `app/submissions/page.tsx`, `components/submissions/*`, `lib/submissions/*`  
  Shows processing status and resolve workflow for unlinked submissions.
- **Reference admin UI flow** → `app/admin/reference/page.tsx`, `components/spec/*`, `components/admin/*`  
  Provides inbox/review/lock interactions for extracted reference docs.
- **Data model and DB config** → `prisma/schema.prisma`, `prisma.config.ts`, `lib/prisma.ts`  
  Defines entities/enums/relations and runtime Prisma client setup.
