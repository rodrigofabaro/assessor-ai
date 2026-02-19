# Brief Extraction System

Last updated: 2026-02-19

## Goal

Convert brief documents into reliable structured data for mapping and grading.

## Pipeline

1. PDF text and page extraction
2. brief header parsing
3. task and part parsing
4. criteria and LO region extraction
5. equation/image token cleanup and suppression of false positives
6. optional AI cleanup/recovery layers
7. artifact sanitization before save

## Required Outputs

- header fields
- tasks and parts
- detected criteria codes
- LO headers
- warnings and confidence markers
- extraction metadata (`pageCount`, `hasFormFeedBreaks`, parser version)

## Reliability Rules

- if uncertain, warn explicitly
- avoid false equation warnings on non-math briefs
- infer missing progression only with defensible heuristics
- preserve locked-state stability on re-extract unless explicitly overridden

## Regression Coverage

Use:

- `node scripts/brief-lo-extraction.test.js`
- `node scripts/brief-mapping-codes.test.js`
- `node scripts/brief-equation-false-positives.test.js`
- `node scripts/brief-readiness.test.js`