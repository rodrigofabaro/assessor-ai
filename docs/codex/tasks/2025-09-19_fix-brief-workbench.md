# Fix brief workbench state, extraction, lock UX, and safe delete

## Governing rules
- Read and follow: [NON_NEGOTIABLES](../NON_NEGOTIABLES.md)

## Context
Brief extraction now returns headers but tasks are missing. Extracted data only appears after a manual refresh. The Refresh button should refetch in place but currently drops users back to the library tab. Locking a brief can fail with a known 409 conflict that should be handled with a dedicated UX. Admins also need a safe delete for unused brief uploads.

## Goal
Make brief extraction and refresh immediate, improve task extraction robustness, handle lock conflicts gracefully, and support safe deletion when unused.

## Required behaviour
- Extract results update the selected brief immediately without a reload.
- Refresh keeps the current tab and refetches data in place.
- Task headings are detected even with PDF whitespace quirks.
- Lock conflict (409 BRIEF_ALREADY_LOCKED) shows a friendly modal with open/replace actions.
- Brief deletion is allowed only when unlocked and unused by submissions; otherwise blocked with clear feedback.

## Acceptance tests
- Extract a brief and confirm the header/tasks render immediately without a manual reload.
- Click Refresh on the briefs workspace and confirm the current tab remains active while data refetches.
- Extract the provided brief and verify tasks[] contains Task 1/2/3 with prompts populated.
- Attempt to lock a brief that conflicts and confirm the modal shows the existing locked brief and actions.
- Delete an unused brief and confirm it is removed from the inbox; attempt delete on a brief with submissions and confirm it is blocked.

## Files to touch
- `lib/extractors/brief.ts`
- `app/api/reference-documents/extract/route.ts`
- `app/api/reference-documents/[documentId]/route.ts`
- `app/admin/reference/reference.logic.ts`
- `app/admin/briefs/briefs.page.tsx`
- `app/admin/briefs/components/BriefReviewCard.tsx`
- `app/admin/briefs/briefs.logic.ts`
- `app/admin/briefs/[briefId]/briefDetail.logic.ts`

## Definition of done
- Extract output updates in place without reloads.
- Refresh button refetches without navigation.
- Tasks extraction yields Task 1–3 for the brief.
- Lock conflict UX is handled with a modal and actionable choices.
- Safe delete works only for unused, unlocked briefs with visible success/error feedback.
