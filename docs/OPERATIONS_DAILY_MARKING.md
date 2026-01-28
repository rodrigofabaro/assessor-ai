# Assessor‑AI — Daily Marking Workflow (Totara → Assessor‑AI → Totara)

This is the **day‑to‑day “get stuff marked”** workflow, designed for speed, traceability, and QA/IV sanity.

## 1) Daily intake (from Totara)

1. Download submissions from Totara for a single assignment (batch).
2. **If Totara gives you a ZIP:** unzip locally so you have one PDF per learner.
3. Keep the filenames as Totara provides them (they often contain helpful identity signals).

## 2) Upload into Assessor‑AI

1. Go to **Upload submissions**.
2. Select the assignment (optional now; recommended when batch is same assignment).
3. Drop in the PDFs (multi‑select) and click upload.

What happens automatically:
- Each file becomes a **Submission** record.
- A timestamp is stored (**uploadedAt**) for audit.
- Extraction is triggered so you can immediately triage and resolve.

## 3) Triage + resolve (fast QA-friendly linking)

Open **Submissions** → filter **Today**.

For anything marked **Unlinked**:
- Click **Resolve**.
- Assessor‑AI shows hints pulled from the cover page (name/email signals + a small text preview).
- Link the correct student record using the search.

Why this step exists:
- It gives you a reliable audit trail for “who this script belongs to”, and it keeps later exports clean.

## 4) Extraction sanity checks (don’t grade confident nonsense)

On a submission:
- Confirm you can see the PDF preview.
- Check extraction status:
  - **EXTRACTED** → OK to proceed
  - **NEEDS_OCR** → scan/handwriting needs OCR/vision step
  - **FAILED** → investigate (corrupt PDF etc.)

Rule of thumb:
- If extraction confidence is low or the PDF is mostly handwriting/images, you should treat the extracted text as **assistive only** and rely more heavily on the PDF view.

## 5) Marking output (what you need to upload back to Totara)

For each submission, the end state is:
- **Overall grade** (word grade only)
- **Constructive feedback** (human tone)
- **Annotated PDF** (ticks + short margin notes where possible)

Assessor‑AI should present these as a simple “upload back to Totara” checklist per submission.

## 6) QA / IV record keeping

Assessor‑AI logs should make it easy to defend decisions:
- submission timestamps
- who linked the student (actor)
- extraction runs + engine version
- the final grade and the evidence snippets used
- model/prompt versions (when AI marking is connected)

The goal: **a boring, defensible evidence trail**.

---

## Practical naming conventions (recommended)

Even if Totara filenames vary, internally we can keep a consistent display label:

`{uploadedAt} — {student} — {unitCode} {assignmentRef} — {originalFilename}`

That makes daily work much easier when you’re hunting for “the one missing script”.
