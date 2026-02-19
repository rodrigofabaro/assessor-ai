# Admin Reference (`/admin/reference`)

Last updated: 2026-02-19

## Purpose

Reference inbox for uploaded docs (specs/briefs) with extract/lock lifecycle.

## Workflow

1. upload and extract
2. inspect warnings
3. review parsed content
4. lock when reliable

## Lock Rules

- locked docs are immutable unless explicit force re-extract is requested
- force re-extract on locked docs must keep history in source metadata

## Common Issues

- file path missing in storage
  - fix stored path and re-extract
- recurring extraction warnings
  - validate source PDF quality and parser assumptions