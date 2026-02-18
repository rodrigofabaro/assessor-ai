# `/upload` Help

## Purpose

Upload student submission files and trigger intake processing.

## Main actions

- Upload one or multiple files.
- Select/confirm student and assignment when available.
- Submit files into the submissions workflow.

## What happens after upload

1. Submission record is created.
2. File is stored.
3. Submission appears in `/submissions`.
4. Extraction/triage workflow continues from submissions workspace.

## How to use

1. Upload files.
2. Move to `/submissions` to resolve links and run grading steps.
3. Open `/submissions/[submissionId]` for detailed review and outputs.

## Common issue

- Upload accepted but not visible in list:
  - refresh `/submissions`
  - check filters (`unlinked only`, timeframe, status)
