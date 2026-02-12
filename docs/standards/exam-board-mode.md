# Exam Board Mode (Jacob Allen template discipline)

These rules apply whenever we generate **Exam Board documents**.

This is intentionally strict. “Looks about right” is not a feature.

## Formatting rules

- Use the user‑provided **Jacob Allen template structure**.
- Preserve the exact table layout, spacing, borders, and row count (**8 unit rows only**).
- Grades are **word grades only**:
  - Pass
  - Merit
  - Distinction
  - Fail
- Overall Grade must be in **ALL CAPS**.

## Resubs column logic

- Resubs = **Yes** only if the grade text contains the word **"resubmission"** (case insensitive).
- Otherwise Resubs = **No**.

## Unit type mapping

- Use the correct unit type mapping for **Electrical** and **Mechanical HNC** programmes.
- Never guess the mapping: use the project’s mapping table / config.

## Table fill method

- Use **positional table replacement** when inserting student data.
- Do **not** insert/delete rows or columns unless explicitly instructed.

## Audit requirements

- Store:
  - template version identifier
  - model/prompt version (if AI‑assisted)
  - generation timestamp
- Output must be **deterministic** given the same inputs.

## Forbidden actions

- Do not “improve” the template.
- Do not reflow table text.
- Do not add extra rows.
