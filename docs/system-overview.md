# System overview

## Architecture summary

This repository is a Next.js App Router application with server endpoints under `app/api/*`, client/admin UI under `app/*` + `components/*`, and domain logic in `lib/*`. Persistence is Prisma-backed PostgreSQL with explicit models for submissions, extraction runs, reference documents, units, outcomes, criteria, and assignment briefs.

Evidence: package.json:5-13  
Evidence: app/layout.tsx:1-26  
Evidence: app/api/submissions/route.ts:1-20  
Evidence: prisma/schema.prisma:1-320

At runtime, Prisma client setup is centralized in `lib/prisma.ts`, with development query logging controlled by `NODE_ENV`. Prisma config points to `prisma/schema.prisma`, migrations, and a `DATABASE_URL` datasource value.

Evidence: lib/prisma.ts:1-20  
Evidence: prisma.config.ts:5-13

## Main runtime flows

### 1) Submission intake: UI upload → API write → extraction trigger

The upload page builds a `FormData` payload with optional `studentId` / `assignmentId` plus one or more files, then POSTs to `/api/submissions/upload`.

Evidence: app/upload/page.tsx:36-65  
Evidence: app/upload/page.tsx:84-124

The upload API validates file types (`.pdf`, `.docx`), writes files to `uploads/`, inserts `Submission` records, then best-effort triggers `/api/submissions/{id}/extract` for each newly created row.

Evidence: app/api/submissions/upload/route.ts:9-20  
Evidence: app/api/submissions/upload/route.ts:41-73  
Evidence: app/api/submissions/upload/route.ts:75-86

### 2) Submission extraction: extraction run lifecycle + persisted output

The extraction endpoint creates a `SubmissionExtractionRun` and marks the submission `EXTRACTING` in a transaction, calls `extractFile`, stores `ExtractedPage` records, derives `NEEDS_OCR` vs `EXTRACTED`, and updates submission text/status atomically.

Evidence: app/api/submissions/[submissionId]/extract/route.ts:58-75  
Evidence: app/api/submissions/[submissionId]/extract/route.ts:77-108  
Evidence: app/api/submissions/[submissionId]/extract/route.ts:114-155

On failure, it marks both run and submission as failed and returns HTTP 500.

Evidence: app/api/submissions/[submissionId]/extract/route.ts:174-201

### 3) Submissions review: list and manual resolve/linking

The submissions page renders grouped rows and a resolve drawer for unlinked records; post-link action refreshes from API.

Evidence: app/submissions/page.tsx:13-33  
Evidence: app/submissions/page.tsx:57-106

`GET /api/submissions` returns submissions with linked student/assignment and extraction/assessment counts. `PATCH /api/submissions/[submissionId]` validates `studentId`, verifies student existence, and records `studentLinkedAt` / `studentLinkedBy` for auditability.

Evidence: app/api/submissions/route.ts:4-19  
Evidence: app/api/submissions/[submissionId]/route.ts:39-73

### 4) Reference library flow: upload → extract → review/lock lifecycle

Reference uploads (`SPEC`, `BRIEF`, `RUBRIC`) are accepted as PDFs, hashed (`sha256`), written to `reference_uploads/`, and persisted as `ReferenceDocument` rows.

Evidence: app/api/reference-documents/route.ts:84-119  
Evidence: app/api/reference-documents/route.ts:127-156

Reference extraction resolves file paths (including fallback roots), blocks locked-doc overwrite unless `forceReextract=true`, invokes extractor/parser logic, and persists `extractedJson`, warnings, and metadata history.

Evidence: app/api/reference-documents/extract/route.ts:84-99  
Evidence: app/api/reference-documents/extract/route.ts:101-123  
Evidence: app/api/reference-documents/extract/route.ts:128-166  
Evidence: lib/extraction/storage/resolveStoredFile.ts:29-99  
Evidence: lib/extraction/index.ts:9-77

Locking commits extracted drafts into canonical records:
- SPEC lock upserts unit + outcomes + criteria and marks records/doc locked.
- BRIEF lock upserts assignment brief, maps criterion codes, and locks source doc.

Evidence: app/api/reference-documents/lock/route.ts:50-128  
Evidence: app/api/reference-documents/lock/route.ts:170-240  
Evidence: app/api/reference-documents/lock/route.ts:255-300

Unlocking is constrained to BRIEF docs, denied when linked submissions exist, and resets lock metadata/status.

Evidence: app/api/reference-documents/unlock/route.ts:31-60  
Evidence: app/api/reference-documents/unlock/route.ts:63-77

## Data model overview

Core persistence entities include `Student`, `Assignment`, `Submission`, `SubmissionExtractionRun`, `ExtractedPage`, `Assessment`, `ReferenceDocument`, `Unit`, `LearningOutcome`, `AssessmentCriterion`, `AssignmentBrief`, and `AssignmentCriterionMap`, with status enums governing workflow state.

Evidence: prisma/schema.prisma:9-120  
Evidence: prisma/schema.prisma:147-229  
Evidence: prisma/schema.prisma:231-320

## Local development

1. Install dependencies:
   - `pnpm install`
2. Ensure database environment is configured (see env vars below).
3. Apply migrations / generate Prisma client as needed:
   - `pnpm run prisma:generate`
   - `pnpm run prisma:migrate`
4. Start dev server:
   - `pnpm run dev`

Evidence: package.json:5-13  
Evidence: prisma.config.ts:7-13

## Testing and verification in this repo

Configured scripts:
- `pnpm run lint`
- `pnpm run build`

Not configured in `package.json`:
- `pnpm run typecheck`
- `pnpm run test`

Evidence: package.json:5-14

## Config locations

- NPM/PNPM scripts and dependency graph: `package.json`
- Prisma CLI/runtime config: `prisma.config.ts`
- Prisma schema/migrations: `prisma/schema.prisma`, `prisma/migrations/*`
- Next runtime/build config: `next.config.ts`
- TypeScript config: `tsconfig.json` (+ `tsconfig.prisma.json`)

Evidence: package.json:1-55  
Evidence: prisma.config.ts:7-13

## Environment variables referenced in code (names only)

- `DATABASE_URL`
- `NODE_ENV`
- `FILE_STORAGE_ROOT`

Evidence: prisma.config.ts:5  
Evidence: lib/prisma.ts:11-17  
Evidence: lib/extraction/storage/resolveStoredFile.ts:41-46
