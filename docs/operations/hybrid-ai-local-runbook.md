# Hybrid AI Quality-First Runbook

Last updated: 2026-03-03


This runbook configures the app to keep quality-critical operations on OpenAI while using local AI only where risk is lower.

## Goal

- Keep extraction and grading quality high.
- Keep audit reliability high.
- Reduce cost safely with local cleanup where appropriate.

## 1) Copy environment template

Use `.env.example` as the baseline and apply values in your local `.env`.
Note: `.env.example` now reflects production OpenAI-first defaults, so for hybrid/local runs you must override provider keys below.

Key controls:

- `AI_PROVIDER_MODE=hybrid`
- `AI_PROVIDER_CLEANUP_MODE=local`
- `AI_PROVIDER_OCR_MODE=hybrid`
- `AI_PROVIDER_EQUATION_MODE=hybrid`

## 2) Start local model server

Recommended local server: Ollama-compatible API.

Example models:

- Text cleanup: `qwen2.5:7b-instruct`
- Vision/OCR helpers: `llava:7b`

Ensure `AI_LOCAL_BASE_URL` matches your running endpoint.

## 3) Keep OpenAI fallback enabled

Do not remove OpenAI keys in production-like environments.

Why:

- Local calls may fail intermittently.
- Fallback protects reliability for OCR/equation/cleanup helpers.
- Final grading remains OpenAI-backed for accuracy and consistency.

## 4) Validate behavior

1. Start app:
- `pnpm dev`

2. Run a submission through:
- upload
- extraction
- student link
- grading

3. Check:
- no hard failures in helper AI steps
- extraction/cleanup warnings remain auditable
- grading output stays schema-valid

## 5) Reliability tuning

Use these env knobs:

- Local timeout: `AI_LOCAL_TIMEOUT_MS`
- Local OCR timeout: `AI_LOCAL_OCR_TIMEOUT_MS`
- OpenAI grade retries: `OPENAI_GRADE_RETRIES`
- OpenAI OCR retries: `OPENAI_OCR_RETRIES`

If local model is unstable:

- keep `AI_PROVIDER_OCR_MODE=hybrid`
- keep `AI_PROVIDER_EQUATION_MODE=hybrid`
- keep `AI_PROVIDER_CLEANUP_MODE=local` only if cleanup quality remains stable.

## 6) Recommended production profile

- `global mode`: `hybrid`
- `cleanup`: `local`
- `ocr`: `openai`
- `equation`: `openai`
- `grading`: OpenAI model from `.openai-model.json` with fallback model configured

This gives the best balance of grading/extraction quality, reliability, and controlled cost.

