# IV-AD AI Review Roadmap (Future Phase)

## Why this exists
The current `/admin/iv-ad` page fills the Pearson IV-AD DOCX template reliably (positional cell fill) but uses:
- PDF text extraction
- simple heuristics
- manual field entry

That is useful for fast manual operation, but it does **not yet perform a real IV judgement** on whether:
- the assessor's grading decision is justified
- the assessor feedback is compliant and useful
- the feedback links clearly to criteria/LOs

This document captures the next phase so it can be implemented later without re-discovering the design.

## Pearson-guided intent (for the AI-assisted phase)
Use the IV-AD workflow to support an Internal Verifier checking:
- assessor decisions against criteria and sampled learner evidence
- feedback quality and clarity
- standards consistency

Reference links (provided by user):
- Pearson forms/guides: https://qualifications.pearson.com/en/support/support-topics/delivering-our-qualifications/delivering-btec-qualifications/btec-forms-and-guides.html
- BTEC Centre Guide to Internal Assessment: https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-internal-assessment.pdf
- BTEC Centre Guide to Internal Verification: https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-internal-verification.pdf

## Target operating modes (must support both)

### 1) Internal mode (existing Assessor-AI records)
Use data already in the database when the learner submission was graded inside the platform.

Primary sources already available (varies by record):
- `Submission` (file, extracted text, metadata)
- `Assessment` (overall grade, feedback text, result JSON)
- marked PDF path / generated outputs
- assignment/unit/spec/brief mappings
- Turnitin state (if enabled)

Goal:
- auto-fill most IV-AD fields
- send a structured IV review prompt to AI
- present draft IV comments and action-required text for human approval

### 2) External mode (manual upload / ad hoc use)
For work graded outside the platform.

Inputs:
- marked student PDF
- selected existing SPEC (preferred) or uploaded support docs
- manual assessor/IV and assignment metadata

Goal:
- run the same AI IV review engine with less context
- still produce a valid IV-AD DOCX output

## How this connects to the current process

### Internal workflow integration (recommended path)
Add entry points from existing grading/submission flow:
- `Submissions` row action: `Generate IV-AD`
- `Submission detail` page action: `Open IV-AD draft`
- (optional) `QA` row action for sampled records

When launched from an internal submission:
- preload `studentName`, `unitCodeTitle`, `assignmentTitle`
- preload `assessorName` from grading/audit actor if available
- preload `markedPdf` from stored marked output if available
- preload awarded grade + assessor feedback from latest `Assessment`
- preload spec/brief links from assignment/unit bindings

This keeps the current `/admin/iv-ad` page reusable, but reduces manual typing to review/edit only.

### External workflow integration (keep current page behavior)
Keep `/admin/iv-ad` as the neutral/manual entry point:
- user uploads marked PDF
- user selects existing SPEC from dropdown (already implemented)
- AI review drafts the IV comments
- user confirms and generates DOCX

## Future architecture (AI-assisted IV review)

### New review step in `/admin/iv-ad`
Add a separate action before final DOCX generation:
- `Run AI IV Review`

The page flow becomes:
1. Load context (internal or external)
2. Run extraction
3. Run AI IV review (structured JSON)
4. Show editable review draft
5. `Generate IV DOCX` using approved text

### AI review input (normalized)
Create one normalized payload for both modes:
- learner metadata (student, programme, unit, assignment)
- awarded grade
- assessor feedback text
- marked submission text (and/or marked PDF snippets)
- criteria/spec context (LOs/ACs) from stored spec/brief data
- optional Turnitin indicators (if available)

### AI review output (structured)
Return JSON with fields like:
- `assessmentDecisionCheck`
- `feedbackComplianceCheck`
- `criteriaLinkingCheck`
- `academicIntegrityCheck`
- `generalCommentsDraft`
- `actionRequiredDraft`
- `confidence`
- `evidenceSnippets[]`
- `warnings[]`

### Human-in-the-loop requirement
AI drafts; human IV approves/edits.

Do not auto-finalize the IV judgement without human confirmation.

## Data model additions (future; optional)
If/when implemented, extend `IvAdDocument` or add a companion table to store AI review provenance:
- `mode` (`INTERNAL` | `EXTERNAL`)
- `sourceSubmissionId` (nullable)
- `sourceAssessmentId` (nullable)
- `sourceReferenceSpecId` (nullable)
- `aiReviewJson` (JSON)
- `aiModel` / `aiVersion`
- `reviewApprovedBy`
- `reviewApprovedAt`

This preserves auditability without breaking the current workflow.

## Implementation phases (recommended)

### Phase 1 (fastest value)
- Add `Run AI IV Review` button in `/admin/iv-ad`
- Use current inputs + marked PDF extraction + selected SPEC
- Produce editable structured draft
- Keep manual DOCX generation step

### Phase 2 (internal auto-fill)
- Add internal launch entry from `Submission detail` / `QA`
- Auto-populate fields from DB
- Reuse existing marked PDF + assessment feedback + grade

### Phase 3 (deeper evidence grounding)
- Feed criteria mappings from locked spec/brief
- Add evidence snippets from extracted submission text / grading result JSON
- Add stronger policy checks for feedback wording/compliance

## Current status (implemented now)
- `/admin/iv-ad` page exists
- active template upload + storage
- marked PDF upload
- selected SPEC dropdown from existing Reference Library
- grade/key-note heuristic extraction
- positional DOCX table fill
- output history + download

## Notes for future implementation
- Preserve template layout: continue positional table fill only.
- Keep manual fallback path available even if AI review fails.
- Prefer structured JSON AI output over free text for audit and editability.
