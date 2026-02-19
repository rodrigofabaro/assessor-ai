# Admin Specs (`/admin/specs`)

Last updated: 2026-02-19

## Purpose

Specs define the criteria universe used by briefs and grading.

## Workflow

1. upload spec
2. run extraction
3. verify unit metadata, LO list, criteria by LO
4. commit import
5. lock authoritative version

## Quality Checks

- LO headers complete and ordered
- criteria coverage complete for each LO
- footer noise not polluting LO/criteria text
- issue label and unit code detected correctly

## Rule

Do not grade against an unlocked or unverified spec.