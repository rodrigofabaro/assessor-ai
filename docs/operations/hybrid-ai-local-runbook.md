# Hybrid AI Local-First Runbook

This runbook configures the app to use local AI first (lower cost) while keeping OpenAI fallback for reliability and quality.

## Goal

- Maximize AI usage in the app.
- Minimize external API spend.
- Keep grading quality and audit reliability high.

## 1) Copy environment template

Use `.env.example` as the baseline and apply values in your local `.env`.

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

- `cleanup`: local
- `equation fallback`: hybrid
- `ocr`: hybrid
- `grading`: OpenAI

This gives the best balance of cost control, speed, and grading quality.
