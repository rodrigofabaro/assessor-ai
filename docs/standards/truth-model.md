# Truth model (Specs + Briefs + Evidence)

Assessor‑AI is a **marking pipeline**, not a chatty grader.

It exists to survive QA/IV/appeals months later by answering:

> “Show me where, exactly, in the learner work you decided P3 was met — and which spec/brief version governed that decision.”

## Reference documents

### Specs (unit specifications) = the law
Specs define the criteria universe:

- unit code/title and issue/version label
- learning outcomes (LO1…)
- assessment criteria (P/M/D codes) and descriptions
- optional essential content anchors

**Rules**
- A spec used for grading must be **locked**.
- Locked specs are **immutable**.
- If a spec changes, it is a **new version** (new record), not a mutation.

### Briefs (assignment briefs) = the question paper
Briefs define what learners were asked to produce:

- header audit fields (academic year, issue date, IV, final submission date)
- the tasks/questions
- sometimes references to criteria codes

**Rules**
- A brief used for grading must be **locked**.
- Locked briefs are **immutable**.
- “Tasks” must be stored as a **task register**: ordered, preserved, warning‑flagged when unclear.

## Submissions
A submission is the learner’s work artefact (PDF/DOCX etc.).

**Rules**
- Preserve the original file.
- Extracted text is *derived data* and must be stored with:
  - extraction method + engine/version
  - per‑page text
  - confidence/warnings

## Extraction‑first pipeline

1) **Ingest**: store file + DB record + timestamps.
2) **Extract**: generate per‑page text (and/or blocks) with confidence.
3) **Triage/Link**: link submission → learner → assignment/brief/spec version.
4) **Grade** (later phases): per‑criterion decisions with evidence citations.
5) **Outputs**: marked PDF + JSON + export pack, all reproducible.

## Evidence discipline
Every criterion decision must record:

- `decision`: MET / NOT_MET / NOT_ASSESSED
- `evidence[]`: page refs + snippets (exact text, minimal length)
- `rationale`: brief explanation tied to the spec criterion wording
- `referenceIds`: spec version id + brief version id

If the extractor is uncertain, the grader must **downgrade confidence** or **refuse to decide**, never invent.

## Audit trail expectations
Anything that changes state should be evented (even if only internally):

- upload
- extract
- lock
- archive
- (future) grade
- (future) resubmission

Silent overwrites are disallowed.
