# System File Map

Last updated: 2026-03-05

## Purpose

Technical index of what each major file area does, so implementation work stays grounded in existing behavior.

## Coverage notes

1. This map is authoritative for code areas and route groups.
2. Large static datasets/assets are mapped by directory pattern (not every individual file line-by-line).
3. Generated files are marked as generated and should not be hand-edited.

## Top-level architecture

1. `app/`: Next.js App Router pages/layouts/API routes (primary runtime surface).
2. `components/`: reusable UI components used across routes.
3. `lib/`: domain/business logic (grading, extraction, submissions, IV-AD, OpenAI, Turnitin, admin controls).
4. `prisma/`: schema, migrations, and seeders (database contract).
5. `scripts/`: regression tests, operational scripts, import/repair utilities.
6. `data/`: Pearson reference source datasets (JSON/PDF/TXT bundles).
7. `public/`: static assets and help screenshots.
8. `tests/fixtures/`: test fixtures used by script-level tests.
9. `src/generated/prisma/`: generated Prisma client artifacts.
10. `docs/`: operational, roadmap, standards, help, and governance documentation.

## Runtime app surfaces (`app/`)

### App shell and global pages

- `app/layout.tsx`: root layout for entire app.
- `app/page.tsx`: home route.
- `app/not-found.tsx`: 404 route.
- `app/globals.css`: global styles.
- `app/help/*`: help center routes and dynamic help topic rendering.
- `app/upload/*`: upload flow route and client logic.
- `app/submissions/*`: submissions list/new/detail pages and detail client modules.
- `app/students/[id]/page.tsx`: student detail route.

### Admin routes (`app/admin/*`)

- `app/admin/layout.tsx`, `app/admin/AdminShell.tsx`: admin layout/nav shell.
- `app/admin/page.tsx`: admin overview entry.
- `app/admin/audit/page.tsx`, `app/admin/users/page.tsx`: audit/user administration.
- `app/admin/developer/page.tsx`, `app/admin/developer/DeveloperPageClient.tsx`: super-admin developer console (organization lifecycle, deep platform ops, and backup org config/secrets controls).
- `app/admin/settings/organization/page.tsx`, `app/admin/settings/organization/OrganizationSettingsPageClient.tsx`: org-scoped settings workspace for per-tenant config/secrets in the normal admin flow.
- `app/admin/settings/*`: settings sections and client wrapper.
- `app/admin/briefs/*`: brief list/detail workflows, tabs, task editing/override UI, extraction workbench.
- `app/admin/specs/*`: specs admin view, logic and UI composition.
- `app/admin/library/*`: unit/spec library workspace.
- `app/admin/reference/*`: reference inbox/list/toolbar/cards and logic.
- `app/admin/bindings/page.tsx`: assignment binding UI.
- `app/admin/qa/page.tsx`: QA route.
- `app/admin/students/page.tsx`: admin student list.
- `app/admin/iv-ad/page.tsx`: IV-AD generation UI.

### API routes (`app/api/*`)

#### Admin configuration and ops

- `app/api/admin/app-config/*`: app configuration state.
- `app/api/admin/grading-config/*`: grading defaults config.
- `app/api/admin/openai-model/*`, `openai-usage/*`: AI model selection and usage diagnostics.
- `app/api/admin/settings/*`, `settings-audit/*`: settings save/defaults/smoke and audit trail.
- `app/api/admin/turnitin/*`: Turnitin config/smoke checks.
- `app/api/admin/ops/events|metrics|mapping-drift/*`: operations telemetry endpoints.
- `app/api/admin/users/*`, `audit/*`: admin user CRUD and audit feeds.
- `app/api/admin/favicon/*`: favicon management.

#### IV-AD

- `app/api/admin/iv-ad/template/*`: IV template upload/active selection.
- `app/api/admin/iv-ad/generate/*`: IV-AD DOCX generation from current form payload.
- `app/api/admin/iv-ad/generate-from-submission/*`: prefilled generation from submission context.
- `app/api/admin/iv-ad/documents/*`: IV-AD history listing and file download.
- `app/api/admin/iv-ad/documents/[documentId]/*`: IV-AD document audit detail payload.
- `app/api/iv-ad/review-draft/*`: strict AI review draft generation contract for IV-AD Phase 4.

#### Submissions pipeline

- `app/api/submissions/upload/*`: intake upload endpoint.
- `app/api/submissions/*`: submissions listing/base operations.
- `app/api/submissions/[submissionId]/extract/*`: extraction runs.
- `app/api/submissions/[submissionId]/triage/*`: triage/linking intelligence.
- `app/api/submissions/[submissionId]/grade/*`: grading execution.
- `app/api/submissions/[submissionId]/assessments/[assessmentId]/*`: assessment updates.
- `app/api/submissions/[submissionId]/marked-file/*`: marked PDF access.
- `app/api/submissions/[submissionId]/export/*`: deterministic export-pack generation.
- `app/api/submissions/[submissionId]/export/replay/*`: replay parity verification for prior exports.
- `app/api/submissions/[submissionId]/exports/[exportId]/file/*`: export artifact download.
- `app/api/submissions/[submissionId]/turnitin/*`: submission-level Turnitin actions.
- `app/api/submissions/[submissionId]/link-student|unlink-student/*`: student relation changes.
- `app/api/submissions/batch-grade/*`, `qa-flags/*`: queue-wide batch actions and QA flags.

#### Reference/spec/brief domain

- `app/api/reference-documents/*`: reference docs CRUD/extract/lock/unlock/file/meta/archive/usage/figure/debug.
- `app/api/reference-imports/commit/*`: import commit operations.
- `app/api/units/*`, `learning-outcomes/*`, `criteria/*`: unit/LO/criteria management.
- `app/api/assignment-briefs/*`, `assignment-bindings/*`: brief mapping and assignment binding endpoints.
- `app/api/briefs/*`: brief IV/rubric/attachment/backfill summary endpoints.
- `app/api/assignments/*`: assignment list/management.

#### Student domain

- `app/api/students/*`: student CRUD/search/import and student submissions endpoints.

#### Dev utilities

- `app/api/dev/build-info/*`, `dev/screenshot/*`: local development diagnostics/utilities.

## Reusable UI components (`components/`)

1. `components/TopNav.tsx`, `PageContainer.tsx`: shared layout/navigation primitives.
2. `components/DevBuildBadge.tsx`: development build marker.
3. `components/admin/LibraryShell.tsx`: admin library wrapper layout.
4. `components/submissions/*`: submissions toolbar/table/pills/resolve drawer/button utilities.
5. `components/upload/*`: upload pickers/actions/modal.
6. `components/spec/LoCriteriaGrid.tsx`: LO/criteria display grid.
7. `components/ui/*`: generic tiny icon, toast host, shared UI class constants.

## Domain/business logic (`lib/`)

### Core infrastructure

- `lib/prisma.ts`: Prisma client singleton.
- `lib/http.ts`, `lib/api/errors.ts`: request/response helpers and API error handling.

### Admin/settings/permissions

- `lib/admin/*`: app config, settings permissions, settings audit, automation policy, admin permissions.

### Extraction and parsing

- `lib/extraction.ts`, `lib/extraction/index.ts`: extraction orchestration entry points.
- `lib/extraction/extractReferenceDocument.ts`: reference extraction orchestrator.
- `lib/extraction/text/pdfToText.ts`: PDF text extraction/OCR integration and telemetry.
- `lib/extraction/brief/*`: brief extraction hard validation, AI fallback/recovery, integrity checks.
- `lib/extraction/parsers/specParser/*`: spec parser for LOs/criteria/labels/essential content.
- `lib/extraction/normalize/*`: text/symbol normalization utilities.
- `lib/extraction/render/*`: rendering helpers for parsed parts/tables.
- `lib/extraction/storage/resolveStoredFile.ts`: storage path resolution for extraction.
- `lib/extraction/utils/criteriaCodes.ts`: criteria code utilities.
- `lib/extractors/*`: higher-level extractors shared by routes.

### Brief/reference governance

- `lib/briefs/*`: brief readiness, lock quality gate, mapping code logic, warnings, grading-scope changes, brief/spec audit.
- `lib/referenceParser.ts`: reference parsing integration helper.

### Grading engine and outputs

- `lib/grading/*`: grading contract/result validation, confidence scoring, extraction gate checks, input strategy, feedback generation/linting/personalization, page notes, marked PDF generation.
- `lib/math/wordLinearToLatex.ts`: Word-linear math to LaTeX normalization.
- `lib/notes/toneDatabase.ts`: note tone vocabulary/support.

### Submissions workflow

- `lib/submissions/*`: submissions list API/client hooks/types/utilities, queue terms, cover metadata handling, extraction quality, automation/auto-grade execution, marked PDF URL handling.
- `lib/submissionReady.ts`: readiness/gating logic.
- `lib/triageHeader.ts`: triage header parsing/signals.

### IV/IV-AD

- `lib/iv-ad/*`: IV-AD analysis, AI review generation, DOCX filler, storage.
- `lib/iv-ad/reviewDraft.ts`: IV-AD review-draft request/output schemas + AI review draft runtime validation.
- `lib/iv/evidenceSummary.ts`: IV evidence summarization support.

### AI/OpenAI/OCR/Turnitin integrations

- `lib/openai/*`: OpenAI client, model config, Responses params, usage logging, brief cleanup/structure recovery fallback flows.
- `lib/ocr/openaiPdfOcr.ts`: OCR via OpenAI route.
- `lib/ai/hybrid.ts`: provider routing/hybrid mode strategy.
- `lib/turnitin/*`: Turnitin client/config/service/state.

### Help/UI support

- `lib/help/*`: help page/topic registry.
- `lib/ui/toast.ts`: toast utilities.
- `lib/ops/eventLog.ts`: operational event logging.
- `lib/upload/*`: upload picklists/search/types/hooks/utils.

## Database contract (`prisma/`)

1. `prisma/schema.prisma`: canonical DB schema (submissions, extraction runs, assessments, references, briefs/specs/criteria, IV-AD templates/documents, app users/config).
2. `prisma/migrations/*`: ordered schema evolution history.
3. `prisma/seed.ts`, `prisma/seed.cjs`: seed data scripts.
4. `prisma/migrations/migration_lock.toml`: migration tool lock metadata.

## Automation and regression scripts (`scripts/`)

### Test/regression scripts

- `scripts/*test.js`: focused contract/regression tests (tasks tab, fallback policy, grading schema/confidence/input, extraction integrity/readiness, brief readiness/mapping/LO/equation validation, symbol normalization, marked PDF URLs, page notes, feedback personalization, draft integrity).
- `scripts/regression-pack.js`: broader grouped regression execution.

### Ops/dev utilities

- `scripts/bootstrap-grade-baseline.cjs`: bootstrap grading baseline.
- `scripts/mapping-drift-check.js`: mapping drift diagnostics.
- `scripts/openai-costs-smoketest.js`: OpenAI usage/cost endpoint smoke check.
- `scripts/dev.ps1`, `scripts/reset-dev.ps1`: local dev helpers.
- `scripts/dev/brief-fixtures.js`: brief fixture tooling.

### Data import/repair utilities

- `scripts/import-pearson-units-into-reference-specs.cjs`: import Pearson units.
- `scripts/lock-imported-pearson-specs.cjs`: lock imported specs.
- `scripts/repair-pearson-imported-spec-criteria.cjs`: repair spec criteria mapping.
- `scripts/fixReferencePaths.ts`: fix reference path metadata.
- `scripts/pearson-unit-descriptor-extract.mjs`, `scripts/pdf-parse-extract.mjs`: extraction helpers for source materials.

## Data/reference assets (`data/`)

1. `data/pearson/source/*`: raw source PDFs.
2. `data/pearson/unit-lists/*`: unit list metadata.
3. `data/pearson/engineering-suite-2024*/unit-json/*`: parsed unit JSON payloads used for imports.
4. `data/pearson/engineering-suite-2024*/unit-pdfs/*`: unit PDF references.
5. `data/pearson/engineering-suite-2024*/unit-text/*`: extracted text snapshots.
6. `manifest.json` files: bundle manifests for import scripts.

## Static/public assets (`public/`)

1. `public/help/screenshots/*`: screenshot assets for help/tutorial pages.
2. `public/help/submissions/*`: submissions-help graphics.
3. default icons/svg files (`favicon.ico`, `*.svg`): generic static assets.

## Generated/legacy and special paths

1. `src/generated/prisma/*`: generated Prisma client artifacts (do not edit manually).
2. `src/lib/prisma.ts`: legacy/alternate prisma helper under `src/`.
3. `src/app/*`: legacy or template app scaffold; active runtime currently uses top-level `app/`.
4. `tests/fixtures/*`: fixtures consumed by script-level tests.

## High-change zones (most likely to impact behavior)

1. `app/api/submissions/*`
2. `lib/grading/*`
3. `lib/extraction/*`
4. `app/admin/briefs/*`
5. `lib/submissions/*`
6. `prisma/schema.prisma` + latest migrations

## Safe-edit checklist before touching core flows

1. Confirm which canonical doc applies:
   - roadmap: `docs/Milestones.md`
   - release contract: `RELEASE.md`
   - operations: `docs/ops-checklist.md`
2. Run focused regression scripts for the touched area.
3. Update relevant docs in the same branch.
