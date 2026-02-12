# Brief Extraction Regression Lock

This document defines the locked extraction/rendering behaviors for the current brief pipeline.

## Scope Locked

### U4002 A1 (`Unit 4002 - Engineering Mathematics`)
- Task 2 `a` must contain the `Sample / Power (+dBm)` table lines.
- Task 2 `b.ii` must **not** contain that table.
- A `TABLE` block for `Sample` must be detected.

### 4017 A1 (`Quality Control Tools and Costing`)
- Task 1 must keep intro line:
  - `In a bid to convince the CEO ...`
- Task 1 must keep vocational scenario text:
  - `You've recently joined ...`
- Task 2:
  - `Sample / Power (+dBm)` lines must be in part `a`.
  - Those lines must not leak into part `b.ii`.
  - Part `c` must preserve `standard deviation of 12μF` as contiguous prose.
  - A `TABLE` block for `Sample` must be detected.
- Task 3:
  - Must detect one costing template table with headers:
    - `Month | Before QC | After QC`
  - Must include rows:
    - `Units Sold`
    - `Net Profit/Loss`

## How To Run

Run extraction assertions with `scripts/brief-extract.test.js`:

```powershell
node scripts/brief-extract.test.js "<PDF_PATH>" --assert "<EXPECTED_JSON_PATH>"
```

For local fixture generation/update:

```powershell
node scripts/brief-extract.test.js "<PDF_PATH>" --out "<SNAPSHOT_JSON_PATH>"
```

## Enforcement Point

Regression checks are enforced in:

- `scripts/brief-extract.test.js`

If a change breaks any lock condition, the script exits non-zero with a targeted warning.

## Rule For Future Changes

1. Do not weaken existing assertions.
2. Add new assertions only as additive coverage.
3. If a parser change is intentional, update fixture + this lock document in the same commit.
