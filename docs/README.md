# Briefs Admin UI Rebuild (Drop-in)

This patch rebuilds the **Admin → Briefs** page to match the Spec Library UX, with a clearer lifecycle:

- **Library tab** lists structured `AssignmentBrief` records (DRAFT/MAPPED/LOCKED).
- **Extract tools tab** lists uploaded `ReferenceDocument` BRIEF PDFs.
- Default behavior shows drafts (no more invisible briefs).
- Adds filters: search, unit, status, and an optional checkbox for locked-only BRIEF PDFs.

## Files
- `app/admin/briefs/page.tsx`
- `app/admin/briefs/briefs.logic.ts`

## Expected existing API
- `GET /api/units` returns Units including `assignmentBriefs`.
- `GET /api/reference-documents?type=BRIEF` returns BRIEF reference docs.
- Optional: `onlyLocked=true` is supported.

## Install
Copy the `app/admin/briefs` folder into your Next.js `app/admin/briefs` directory, replacing the existing files.

## Next step (not included)
Wire extract/reset/lock buttons in the Extract tools tab to your existing endpoints.
