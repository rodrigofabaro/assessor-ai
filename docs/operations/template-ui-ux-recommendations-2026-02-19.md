# Template and UI/UX Recommendations

Date: 2026-02-19

## Feedback Template Recommendations

1. Keep two channels separated
- student-facing feedback
- internal system diagnostics

2. Required student-facing sections
- what was achieved
- what is missing and why
- actionable next steps (without giving full answers)

3. Page-note template quality
- title should be `Note`, not internal system terms
- references must be page-specific and criterion-linked
- avoid generic placeholders like `type text here`

4. Overall feedback typography
- clearer hierarchy
- short paragraphs
- bullet spacing tuned for readability

## Brief Template Recommendations

1. Force explicit LO -> criteria block in source templates.
2. Use consistent `Task n` and `Part a/b/c` markers.
3. Include assessment modality hints in explicit labels (table/chart/video/presentation).
4. Include structured submission requirements section separated from narrative tasks.

## Spec Template Recommendations

1. Keep LO headers in a strict, repeated format.
2. Keep criteria rows one per line with code prefix.
3. Avoid mixing footer text into criteria pages where possible.

## Submission UI/UX Recommendations

1. Default compact left navigation list
- minimal collapsed row height
- expand only on demand

2. Keep quick actions in a dedicated card
- always visible
- no accordion behavior

3. Reduce right-panel overload
- move advanced controls behind `More` drawer
- keep grading-critical actions visible

4. Improve confidence explainability
- show confidence contributors inline (model, evidence density, readiness, caps)

5. Improve lane-level pressure visibility
- default pressure summary in submissions list
- one-click jump to blocker category

## Governance Recommendations

1. Add reason-required confirmations for impactful actions
- criterion exclusion
- force re-extract on locked docs
- manual bypass of quality gate

2. Add policy profiles
- strict mode (high assurance)
- standard mode (balanced)
- exploratory mode (manual-heavy)