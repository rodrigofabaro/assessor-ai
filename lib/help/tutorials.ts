import { getHelpPageMeta, HELP_PAGES } from "@/lib/help/pages";

export type HelpIssue = {
  issue: string;
  cause: string;
  fix: string;
};

export type HelpDecisionRule = {
  if: string;
  then: string;
  because: string;
};

export type HelpMistake = {
  mistake: string;
  risk: string;
  correct: string;
};

export type HelpScreenshot = {
  title: string;
  caption: string;
  src?: string;
};

export type HelpUiControl = {
  kind: "Filter" | "Badge" | "Button" | "Alert" | "Tab" | "Toggle" | "Field" | "Card";
  label: string;
  location: string;
  meaning: string;
  useWhen: string;
  impact: string;
};

export type HelpStep = {
  id: string;
  title: string;
  what: string;
  how: string[];
  why: string;
  checks?: string[];
};

export type HelpTutorial = {
  slug: string;
  title: string;
  route: string;
  audience: string;
  purpose: string;
  howItWorks: string[];
  whyItMatters: string[];
  preflight: string[];
  steps: HelpStep[];
  issues: HelpIssue[];
  successCriteria?: string[];
  decisionGuide?: HelpDecisionRule[];
  commonMistakes?: HelpMistake[];
  screenshots?: HelpScreenshot[];
  uiControls?: HelpUiControl[];
};

const TUTORIALS_BY_SLUG: Record<string, Omit<HelpTutorial, "slug" | "title" | "route">> = {
  "home": {
    audience: "Operators and admins",
    purpose: "Use the home dashboard as the quickest routing surface to the right workspace.",
    howItWorks: [
      "Status cards summarize queue and system state.",
      "Primary navigation sends you to Upload, Submissions, or Admin areas.",
      "Shortcut cards reduce context switching when operations are busy.",
    ],
    whyItMatters: [
      "Prevents starting work in the wrong area.",
      "Reduces handoff errors between intake and grading teams.",
    ],
    preflight: [
      "Confirm environment is the correct instance (local/staging/production).",
      "Check system status cards before starting daily operations.",
    ],
    steps: [
      {
        id: "route-fast",
        title: "Route to the correct workspace",
        what: "Choose Upload for intake, Submissions for operations, Admin for governance.",
        how: [
          "Use shortcut cards based on your immediate task.",
          "If unclear, start in Submissions and inspect queue pressure.",
        ],
        why: "Correct routing avoids duplicate actions and missed blockers.",
      },
      {
        id: "confirm-health",
        title: "Confirm health before execution",
        what: "Check whether queue and services are healthy before mutation actions.",
        how: [
          "Review dashboard indicators.",
          "Escalate if core counts are stale or unavailable.",
        ],
        why: "Executing grading while system state is degraded increases retry and audit risk.",
      },
    ],
    issues: [
      {
        issue: "Counts look stale",
        cause: "Page cache or delayed processing.",
        fix: "Refresh and verify backend status in admin pages.",
      },
    ],
  },
  "upload": {
    audience: "Intake operators",
    purpose: "Ingest files and start extraction safely with minimal manual setup.",
    howItWorks: [
      "Upload accepts one or many files.",
      "Each file becomes a submission record in queue.",
      "Extraction and triage stages move records toward grading readiness.",
    ],
    whyItMatters: [
      "Upload quality directly affects extraction and triage confidence.",
      "Correct intake metadata reduces manual fixing later.",
    ],
    preflight: [
      "Ensure file types are supported and readable.",
      "Avoid duplicate uploads for the same learner and assignment.",
    ],
    steps: [
      {
        id: "upload-files",
        title: "Upload files in controlled batches",
        what: "Create submissions without overwhelming queue diagnostics.",
        how: [
          "Upload small batches when testing new units or templates.",
          "Use larger batches only when pipeline is stable.",
        ],
        why: "Controlled volume makes triage and blocker resolution faster.",
      },
      {
        id: "verify-created",
        title: "Verify queue creation",
        what: "Confirm uploaded files appeared in `/submissions`.",
        how: [
          "Open submissions list after upload.",
          "Search by filename and confirm one row per intended file.",
        ],
        why: "Early validation catches duplicate/missing records before grading actions.",
      },
    ],
    issues: [
      {
        issue: "File accepted but extraction fails",
        cause: "Unreadable source PDF or scanned content quality.",
        fix: "Re-export source PDF and rerun extraction.",
      },
    ],
  },
  "operations-playbook": {
    audience: "Operations leads, assessors, and QA reviewers",
    purpose: "Run the end-to-end grading pipeline consistently from settings and references through upload, grading, QA, and audit.",
    howItWorks: [
      "Starts with locked reference truth (spec + brief + criteria mapping).",
      "Moves each submission through extraction readiness, preview, commit, and feedback checks.",
      "Closes with QA flags, override analytics, and audit trace verification.",
    ],
    whyItMatters: [
      "Ensures grading quality is repeatable across all briefs.",
      "Turns assessor disagreement into structured improvement signals instead of ad-hoc rework.",
    ],
    preflight: [
      "Confirm active audit user and grading defaults in Admin Settings.",
      "Confirm spec/brief/rubric are extracted and locked for the target assignment.",
      "Confirm assignment binding points to the intended locked brief version.",
    ],
    steps: [
      {
        id: "configure-governance",
        title: "Set governance defaults",
        what: "Use Admin Settings to set model, policy, and release labels before running volume.",
        how: [
          "Confirm active audit user.",
          "Set tone, strictness, rubric usage, and page-note behavior.",
          "Confirm global contradiction guard and confidence policy defaults.",
        ],
        why: "Stable defaults reduce run-to-run drift and simplify QA interpretation.",
        checks: [
          "Footer shows intended stable candidate version label.",
          "No unreviewed high-impact setting changes pending.",
        ],
      },
      {
        id: "lock-references",
        title: "Lock references and binding",
        what: "Ensure specs, briefs, rubric support material, and assignment bindings are production-ready.",
        how: [
          "Verify spec extraction and lock status.",
          "Verify brief extraction, criteria scope, and exclusions.",
          "Verify assignment-to-brief binding is correct for the unit/AB.",
        ],
        why: "Wrong reference context causes systemic grading errors regardless of model quality.",
        checks: [
          "Brief and spec are LOCKED.",
          "Mapped criteria and expected criteria match.",
        ],
      },
      {
        id: "upload-and-triage",
        title: "Upload and triage submissions",
        what: "Upload files, link student/assignment as needed, and confirm extraction readiness.",
        how: [
          "Upload batch in controlled size.",
          "Resolve unlinked student or assignment rows first.",
          "Run extraction and verify quality signals before grading preview.",
        ],
        why: "Good intake quality lowers manual regrade and failed-run volume.",
        checks: [
          "Submission has student and assignment linked.",
          "Extraction gate is acceptable for preview.",
        ],
      },
      {
        id: "preview-and-commit",
        title: "Preview then commit grading",
        what: "Use preview to inspect criterion decisions and confidence, then commit only when ready.",
        how: [
          "Run preview and inspect criterion decisions + evidence pages.",
          "Review cap reasons and confidence decomposition.",
          "Commit grade and verify latest run is selected.",
        ],
        why: "Preview/commit discipline prevents stale or unsupported outcomes entering final output.",
        checks: [
          "Final grade aligns with criterion decisions and policy caps.",
          "Marked PDF regenerated for committed run.",
        ],
      },
      {
        id: "assessor-overrides",
        title: "Capture assessor overrides",
        what: "When assessor judgement disagrees with model decisions, use criterion override controls.",
        how: [
          "Set final decision, reason code, and optional note per criterion.",
          "Apply override and verify recomputed final grade.",
          "If needed, reset criterion back to model decision.",
        ],
        why: "Structured overrides preserve fairness and create data for hardening rules.",
        checks: [
          "Override badge is visible on changed criteria.",
          "Result stores override metadata (reason + actor + timestamp).",
        ],
      },
      {
        id: "qa-and-audit-close",
        title: "Run QA and audit close-out",
        what: "Use QA analytics and audit logs to validate quality before release.",
        how: [
          "Check QA Flags and Assessor Override Breakdown card.",
          "Review hotspots by reason code, criterion, and unit/AB.",
          "Confirm audit event trail for the final run.",
        ],
        why: "Final release confidence comes from evidence-backed QA and traceability, not grade output alone.",
        checks: [
          "High-risk QA flags reviewed and resolved or accepted with rationale.",
          "Audit chain can explain who changed what and why.",
        ],
      },
    ],
    issues: [
      {
        issue: "Preview and selected run show different grades",
        cause: "Historical run is selected in workspace.",
        fix: "Select latest run and refresh after commit.",
      },
      {
        issue: "Assessor override applied but impact unclear",
        cause: "Override reason/note missing or run context not refreshed.",
        fix: "Re-open latest run, confirm override badge, and inspect updated grade policy block.",
      },
      {
        issue: "Frequent overrides cluster on same criteria",
        cause: "Prompt/rule/rubric guidance mismatch.",
        fix: "Use QA breakdown hotspots to prioritize next hardening changes.",
      },
    ],
    screenshots: [
      {
        title: "Queue operations baseline",
        caption: "Submissions workspace with lane and readiness context before grading.",
        src: "/help/screenshots/operations-playbook-queue.png",
      },
      {
        title: "Submissions list and filtering",
        caption: "Filter and triage controls used before preview/commit runs.",
        src: "/help/screenshots/operations-playbook-submissions-list.png",
      },
      {
        title: "Submission detail criterion decisions",
        caption: "Criterion decisions and assessor override controls on a live run.",
        src: "/help/screenshots/operations-playbook-submission-detail.png",
      },
    ],
    successCriteria: [
      "Each run is traceable from settings/reference context through final grade and feedback.",
      "Override-heavy criteria are visible in QA and tracked for hardening actions.",
      "Release decisions are based on QA signals and audit evidence, not grade output alone.",
    ],
    decisionGuide: [
      {
        if: "QA shows repeated overrides for the same criterion across briefs",
        then: "Prioritize guard/prompt/rubric improvements for that criterion family first.",
        because: "High-frequency disagreement is the strongest reliability signal.",
      },
      {
        if: "Confidence is high but assessor disagrees often",
        then: "Treat as calibration defect and tune decision rules, not just confidence thresholds.",
        because: "Confidence can be internally consistent while still aligned to the wrong rubric interpretation.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Skipping preview and committing directly under pressure.",
        risk: "Incorrect grades and avoidable regrade load.",
        correct: "Always run preview first for new or recently changed contexts.",
      },
      {
        mistake: "Treating assessor overrides as one-off fixes.",
        risk: "The same disagreement repeats in future cohorts.",
        correct: "Feed override hotspots into regular hardening updates.",
      },
    ],
  },
  "submissions-list": {
    audience: "Daily queue operators",
    purpose: "Control queue flow across Blocked, Needs Human, QA, Auto-ready, and Completed lanes.",
    howItWorks: [
      "Filters narrow the queue to actionable rows.",
      "Batch actions run grading workflows on visible targets.",
      "Row-level Resolve/Open actions handle exceptions.",
    ],
    whyItMatters: [
      "Queue discipline prevents grading on unresolved context.",
      "Batch safety depends on clean lane state.",
    ],
    preflight: [
      "Start with Unlinked/Blocked filters before running batch actions.",
      "Do not run commit workflows until QA preview is current.",
    ],
    steps: [
      {
        id: "triage-lanes",
        title: "Work lanes in order",
        what: "Always resolve Blocked and Needs Human first.",
        how: [
          "Fix links and extraction blockers.",
          "Then process QA and Auto-ready lanes.",
        ],
        why: "Running grade actions too early creates avoidable failures and rework.",
      },
      {
        id: "use-qa-guard",
        title: "Use QA preview -> commit guard",
        what: "Commit only against validated preview context.",
        how: [
          "Run Preview QA lane.",
          "If queue changed, re-preview before commit.",
        ],
        why: "Ensures audit defensibility and prevents stale queue commits.",
      },
    ],
    issues: [
      {
        issue: "Many rows skipped in batch",
        cause: "Extraction gate failed or links missing.",
        fix: "Inspect skipped reasons and clear blockers first.",
      },
    ],
    screenshots: [
      {
        title: "Queue lane overview",
        caption: "Capture lane filter chips and row readiness statuses.",
        src: "/help/screenshots/submissions-workspace.png",
      },
    ],
  },
  "submissions-support": {
    audience: "Support and operations leads",
    purpose: "Provide a complete day-to-day operating tutorial for queue reliability.",
    howItWorks: [
      "Gives the canonical order of operations.",
      "Defines safety checks before each action type.",
      "Supplies troubleshooting paths for common failures.",
    ],
    whyItMatters: [
      "Standardized operations reduce grading drift and support load.",
      "New staff can execute safely without tribal knowledge.",
    ],
    preflight: [
      "Confirm automation flags match team policy.",
      "Confirm briefs/specs are locked for active units.",
    ],
    steps: [
      {
        id: "read-pressure",
        title: "Read queue pressure before acting",
        what: "Assess blocker density and prioritize effort.",
        how: [
          "Check Blocked, Needs Human, QA counts.",
          "Choose the lane with highest risk first.",
        ],
        why: "Pressure-first sequencing prevents queue churn.",
      },
      {
        id: "resolve-context",
        title: "Resolve context before grading",
        what: "Student and assignment context must be correct first.",
        how: [
          "Use Resolve for student links.",
          "Validate assignment binding and brief scope.",
        ],
        why: "Correct context is a prerequisite for defensible grading.",
      },
      {
        id: "execute-safely",
        title: "Execute grading with safeguards",
        what: "Use QA and automation safeguards as designed.",
        how: [
          "Use preview/commit for QA lane.",
          "Use auto-ready automation for stable rows.",
        ],
        why: "Preserves throughput without sacrificing correctness.",
      },
    ],
    issues: [
      {
        issue: "Auto-ready not moving to graded",
        cause: "Missing brief link, gate fail, or existing assessment.",
        fix: "Check readiness signals and assignment brief binding.",
      },
    ],
  },
  "submissions-onboarding": {
    audience: "New operators",
    purpose: "Run a controlled first-day validation of the full submission pipeline.",
    howItWorks: [
      "Uses a 3-sample dataset with expected outcomes.",
      "Verifies linking, lane behavior, and grading safety guards.",
      "Ends with audit confirmation.",
    ],
    whyItMatters: [
      "Establishes operator confidence before live volume.",
      "Catches environment misconfiguration early.",
    ],
    preflight: [
      "Prepare three known sample files.",
      "Confirm automation and extraction flags in environment.",
    ],
    steps: [
      {
        id: "run-samples",
        title: "Run 3-sample workflow",
        what: "Validate Auto-ready, Needs Human, and QA flows.",
        how: [
          "Upload all three files.",
          "Resolve links where required.",
          "Observe expected lane placement.",
        ],
        why: "Covers all critical execution branches.",
      },
      {
        id: "verify-audit",
        title: "Verify audit linkage",
        what: "Ensure preview and commit traceability exists.",
        how: [
          "Check `/admin/audit` events for matching context.",
          "Confirm run IDs and queue signatures align.",
        ],
        why: "Guarantees the onboarding run is defensible.",
      },
    ],
    issues: [
      {
        issue: "QA commit disabled",
        cause: "No valid preview or preview stale.",
        fix: "Run QA preview again and commit immediately after validation.",
      },
    ],
  },
  "submission-detail": {
    audience: "Assessors and QA reviewers",
    purpose: "Review one submission end-to-end: extraction, evidence, grading, and outputs.",
    howItWorks: [
      "Top strip surfaces blockers and next action.",
      "PDF workspace compares source and marked outputs.",
      "Audit & outputs panels show grade signals and traceability.",
    ],
    whyItMatters: [
      "Single-record truth source for disputes and QA checks.",
      "Prevents hidden assumptions during grading review.",
    ],
    preflight: [
      "Confirm selected assessment run.",
      "Check extraction and grading confidence signals.",
    ],
    steps: [
      {
        id: "validate-context",
        title: "Validate context before edits",
        what: "Student, assignment, and extraction context must be correct.",
        how: [
          "Check link cards and extraction status.",
          "Resolve mismatches before feedback edits.",
        ],
        why: "Feedback on wrong context creates incorrect learner outcomes.",
      },
      {
        id: "review-decisions",
        title: "Review criterion decisions and evidence",
        what: "Inspect criterion outcomes with page-level evidence.",
        how: [
          "Open Criterion Decisions and Page Feedback Map.",
          "Check evidence density and missing evidence warnings.",
        ],
        why: "Criterion-level traceability is the grading contract.",
      },
      {
        id: "finalize-output",
        title: "Finalize marked output",
        what: "Ensure student-facing feedback is clean and safe.",
        how: [
          "Use feedback editor and preview.",
          "Regenerate marked PDF after changes.",
        ],
        why: "Final PDF is the learner-facing output and must be accurate.",
      },
    ],
    issues: [
      {
        issue: "Confidence seems inconsistent",
        cause: "Caps/penalties applied from readiness, evidence, or policy.",
        fix: "Open Confidence Decomposition and inspect caps/penalties.",
      },
    ],
    screenshots: [
      {
        title: "Submission workspace",
        caption: "Capture left rail, PDF pane, and grading area in the same screenshot.",
        src: "/help/screenshots/submission-detail-left-rail-collapsed.png",
      },
      {
        title: "Feedback editing zone",
        caption: "Capture page-level notes panel and overall feedback area.",
      },
    ],
  },
  "students-pages": {
    audience: "Student record operators",
    purpose: "Manage learner identity and submission linkage integrity.",
    howItWorks: [
      "Student list and detail pages expose profile and submission history.",
      "Linking flows use these records for triage and grading context.",
    ],
    whyItMatters: [
      "Identity integrity prevents wrong-student grading.",
      "Accurate records improve automatic linking quality.",
    ],
    preflight: [
      "Confirm full name and identifier format standards.",
      "Avoid duplicate records for same learner.",
    ],
    steps: [
      {
        id: "search-match",
        title: "Find or create correct student record",
        what: "Use strong matching criteria before linking submissions.",
        how: [
          "Search by full name, email, external reference.",
          "Create only when no reliable match exists.",
        ],
        why: "Duplicate records degrade triage confidence.",
      },
      {
        id: "verify-history",
        title: "Verify submission history consistency",
        what: "Check learner history for anomalies after linking.",
        how: [
          "Inspect submission list on student detail.",
          "Correct accidental links immediately.",
        ],
        why: "History integrity supports appeals and QA audits.",
      },
    ],
    issues: [
      {
        issue: "Ambiguous surname matches",
        cause: "Conservative triage surname heuristic.",
        fix: "Use explicit identifiers and manual link confirmation.",
      },
    ],
  },
  "admin-index": {
    audience: "Admin leads",
    purpose: "Use admin overview as the command center for risk, blockers, and QA readiness decisions.",
    howItWorks: [
      "KPIs and attention blocks surface operational pressure.",
      "Quick links route to area-specific controls.",
      "Automation-ready and open-blocker metrics define the next queue actions.",
    ],
    whyItMatters: [
      "Fast risk visibility reduces incident response time.",
      "Direct navigation avoids hidden backlog growth.",
      "Prevents blind grading by forcing blocker and QA checks first.",
    ],
    preflight: [
      "Check blockers and failed runs first.",
      "Escalate recurring failure patterns to runbook owners.",
      "Confirm automation-ready rows are actually reviewed through QA flow.",
    ],
    steps: [
      {
        id: "scan-kpis",
        title: "Scan KPIs and attention queue",
        what: "Prioritize system pressure, not convenience.",
        how: [
          "Open queue-heavy pages directly from attention blocks.",
          "Assign owners for high-pressure items.",
        ],
        why: "Without prioritization, backlog grows in the wrong lane.",
      },
      {
        id: "review-automation-ready",
        title: "Review automation-ready rows correctly",
        what: "Automation ready means rows are eligible for QA pass, not auto-approved by default.",
        how: [
          "Open `/submissions` from Admin.",
          "Enable `QA review only` filter.",
          "Run `Preview QA lane`, verify outcomes, then `Commit QA lane` if safe.",
        ],
        why: "Preserves quality control and prevents silent release errors.",
      },
      {
        id: "clear-open-blockers",
        title: "Clear open blockers with dependency order",
        what: "Resolve the highest-impact blockers before more grading runs.",
        how: [
          "Fix lock blockers in Specs and Briefs first.",
          "Resolve unlinked/OCR rows in Submissions next.",
          "Use Audit to retry failed runs after root-cause correction.",
        ],
        why: "Blockers compound quickly and degrade queue confidence.",
      },
    ],
    issues: [
      {
        issue: "Overview looks healthy but grading quality drops",
        cause: "Hidden confidence/evidence pressure in detail pages.",
        fix: "Audit confidence decomposition and evidence density on sampled runs.",
      },
      {
        issue: "Automation-ready count is high but QA outcomes are weak",
        cause: "Rows were not actually reviewed through preview/commit QA flow.",
        fix: "Use Submissions QA lane workflow and sample outputs before commit.",
      },
    ],
  },
  "admin-qa": {
    audience: "QA reviewers",
    purpose: "Analyze output quality trends and audit grading defensibility.",
    howItWorks: [
      "QA pages aggregate run quality signals and outcomes.",
      "Supports targeted review and export workflows.",
    ],
    whyItMatters: [
      "QA detects drift before it impacts many learners.",
      "Evidence-based QA supports governance reporting.",
    ],
    preflight: [
      "Define sampling strategy for units and grade bands.",
      "Confirm latest runs are selected.",
    ],
    steps: [
      {
        id: "sample-runs",
        title: "Sample runs by risk profile",
        what: "Review low-confidence, capped, or high-variance runs first.",
        how: [
          "Filter by run quality indicators.",
          "Cross-check criterion evidence and policy caps.",
        ],
        why: "Risk-based sampling gives better QA coverage per hour.",
      },
    ],
    issues: [
      {
        issue: "High confidence but weak narrative",
        cause: "Confidence reflects signals, not writing quality alone.",
        fix: "Use criterion evidence and feedback quality checks together.",
      },
    ],
  },
  "admin-specs": {
    audience: "Reference owners",
    purpose: "Maintain authoritative spec extraction that drives criteria truth.",
    howItWorks: [
      "Spec extraction produces LO/criteria universe.",
      "Import commits update unit LO/criteria records.",
      "Locking freezes versions for defensible grading.",
    ],
    whyItMatters: [
      "Spec errors cascade into briefs and grading decisions.",
      "Locked spec versions are required for stable governance.",
    ],
    preflight: [
      "Confirm source spec issue/version.",
      "Validate LO and criteria completeness before lock.",
    ],
    steps: [
      {
        id: "extract-validate-lock",
        title: "Extract, validate, then lock",
        what: "Never lock unvalidated extraction.",
        how: [
          "Review LO headers and criteria rows.",
          "Fix extraction issues before import/lock.",
        ],
        why: "Spec integrity is the top of the grading dependency chain.",
      },
    ],
    issues: [
      {
        issue: "Missing LO text in downstream brief view",
        cause: "Spec extraction/integration incomplete.",
        fix: "Re-validate spec extract and ensure locked version is linked.",
      },
    ],
  },
  "admin-briefs": {
    audience: "Brief and mapping owners",
    purpose: "Control brief extraction quality, criteria scope, and lock readiness.",
    howItWorks: [
      "Library manages locked briefs and criteria scope toggles.",
      "Extract tools fix parsing and mapping issues before lock.",
      "Brief detail provides overview/tasks/versions/IV/rubric tabs.",
    ],
    whyItMatters: [
      "Brief mapping quality directly controls grading criteria set.",
      "Scope changes must be audited and reasoned.",
    ],
    preflight: [
      "Confirm mapped spec is correct.",
      "Review mapping health before lock.",
    ],
    steps: [
      {
        id: "quality-gate",
        title: "Pass quality gate before lock",
        what: "Lock only when extraction and mapping are reliable.",
        how: [
          "Review warnings and mapping metrics.",
          "Resolve blockers, then lock.",
        ],
        why: "Locked bad mappings create downstream grading failures.",
      },
      {
        id: "scope-change",
        title: "Apply criteria scope change safely",
        what: "Scope change requires reason, confirmation, and audit event.",
        how: [
          "Click criterion pill.",
          "Provide reason.",
          "Confirm action; if brief is live, confirm again.",
        ],
        why: "Scope changes alter grading contract and must be controlled.",
      },
    ],
    issues: [
      {
        issue: "Scope change rejected",
        cause: "Missing reason, mismatch payload, or live-brief confirmation not supplied.",
        fix: "Re-run with valid reason and explicit live confirmation if prompted.",
      },
    ],
    screenshots: [
      {
        title: "Criteria scope pills",
        caption: "Capture normal and excluded criteria states in the brief library row.",
        src: "/help/screenshots/admin-briefs-overview.png",
      },
      {
        title: "Live scope confirmation",
        caption: "Capture the reason and confirmation flow used for live brief changes.",
        src: "/help/screenshots/admin-briefs-criteria-mapping.png",
      },
    ],
  },
  "admin-reference": {
    audience: "Reference inbox operators",
    purpose: "Manage raw reference documents and extraction lifecycle state.",
    howItWorks: [
      "Reference inbox tracks upload, extract, review, lock states.",
      "Meta updates and usage checks protect live documents.",
    ],
    whyItMatters: [
      "Reference integrity underpins brief/spec reliability.",
      "Lock and usage rules prevent destructive drift.",
    ],
    preflight: [
      "Check file provenance and version intent.",
      "Verify extract outputs before lock.",
    ],
    steps: [
      {
        id: "triage-docs",
        title: "Triage by state and risk",
        what: "Process failed and pending items before bulk lock activity.",
        how: [
          "Filter by type and status.",
          "Re-extract failed items after source correction.",
        ],
        why: "Keeps reference backlog clean and predictable.",
      },
    ],
    issues: [
      {
        issue: "Cannot unlock/delete",
        cause: "Document is in live use by graded submissions.",
        fix: "Use new version workflow instead of destructive mutation.",
      },
    ],
  },
  "admin-library": {
    audience: "Governance and mapping operators",
    purpose: "Inspect learning structures and control brief criteria scope safely.",
    howItWorks: [
      "Shows unit/LO/criteria relationships and brief scope signals.",
      "Scope toggles feed directly into grading criteria selection.",
    ],
    whyItMatters: [
      "Makes grading scope explicit and auditable.",
      "Helps avoid silent criteria drift.",
    ],
    preflight: [
      "Confirm selected brief and unit context.",
      "Review current exclusions before changing scope.",
    ],
    steps: [
      {
        id: "inspect-scope",
        title: "Inspect current scope before changing",
        what: "Understand what is currently excluded and why.",
        how: [
          "Check exclusion pills and history entries.",
          "Use brief detail history panel for timeline context.",
        ],
        why: "Prevents accidental override of intentional governance decisions.",
      },
    ],
    issues: [
      {
        issue: "All criteria excluded",
        cause: "Over-aggressive scope change.",
        fix: "Re-include required criteria; grading blocks until active criteria exist.",
      },
    ],
    screenshots: [
      {
        title: "Library LO and criteria card",
        caption: "Capture criteria list and any excluded-pill indicator.",
        src: "/help/screenshots/admin-briefs-criteria-mapping.png",
      },
    ],
  },
  "admin-bindings": {
    audience: "Binding administrators",
    purpose: "Manage assignment-to-brief binding integrity for grading.",
    howItWorks: [
      "Bindings connect operational assignments to locked briefs.",
      "Grading resolves criteria through these bindings.",
    ],
    whyItMatters: [
      "Wrong binding means wrong criteria and wrong grade envelope.",
      "Binding accuracy is non-negotiable before batch grading.",
    ],
    preflight: [
      "Confirm assignment refs and unit codes.",
      "Confirm target brief is locked and validated.",
    ],
    steps: [
      {
        id: "set-binding",
        title: "Set and validate binding",
        what: "Bind assignments to the intended brief version.",
        how: [
          "Apply binding update.",
          "Sample one submission and validate criteria snapshot.",
        ],
        why: "Binding mistakes are high-impact and hard to detect late.",
      },
    ],
    issues: [
      {
        issue: "Grading mismatch after binding change",
        cause: "Old runs still reflect previous context.",
        fix: "Regrade impacted submissions with clear run notes.",
      },
    ],
  },
  "admin-settings": {
    audience: "Platform administrators",
    purpose: "Configure AI, grading, and app policy with safe tests, atomic save, and auditable change tracking.",
    howItWorks: [
      "Settings are split into AI, Grading, and App sections with independent draft state.",
      "Test config actions validate AI connectivity and grading template/schema before save.",
      "Save all uses an atomic batch update path to avoid partial cross-section saves.",
      "Unsaved-change guard warns before navigation and keeps edits safe.",
    ],
    whyItMatters: [
      "Centralized policy prevents per-operator drift and hidden local overrides.",
      "Atomic saves reduce mixed-state incidents when multiple sections change together.",
      "Structured audit entries improve rollback and governance analysis.",
    ],
    preflight: [
      "Confirm active audit user identity.",
      "Document expected impact before changing grading settings.",
      "Run current smoke checks so you can compare before/after behavior.",
    ],
    steps: [
      {
        id: "draft-and-validate",
        title: "Draft changes and validate first",
        what: "Edit only the controls you intend to change, then run test checks before saving.",
        how: [
          "Use `Test config` in AI and Grading sections.",
          "Check warnings/errors and resolve them before commit.",
        ],
        why: "Validation-first flow catches misconfiguration before it reaches production runs.",
      },
      {
        id: "save-atomically",
        title: "Commit safely with atomic save",
        what: "Use Save all when multiple sections changed so config updates are committed together.",
        how: [
          "Review dirty indicators for AI/Grading/App.",
          "Use `Save all atomically` from top bar or unsaved-changes bar.",
          "If needed, use section `Revert` or `Reset defaults` before save.",
        ],
        why: "Atomic commit reduces partial-save risk and cross-section drift.",
      },
      {
        id: "audit-confirm",
        title: "Confirm audit output",
        what: "Review structured from/to changes in the settings audit trail after save.",
        how: [
          "Open latest audit entry and inspect key diffs.",
          "Copy event payload when documenting change approvals.",
        ],
        why: "Post-save audit confirmation ensures governance traceability.",
      },
    ],
    issues: [
      {
        issue: "Model change not reflected in run",
        cause: "Effective model resolved from active config at run time.",
        fix: "Re-open run and inspect model snapshot in result metadata.",
      },
      {
        issue: "Save all fails with rollback message",
        cause: "One section failed validation during batch commit.",
        fix: "Use section smoke tests, correct invalid fields, then run Save all again.",
      },
    ],
  },
  "admin-audit-users": {
    audience: "Audit and identity administrators",
    purpose: "Track event history and manage active audit actors/users.",
    howItWorks: [
      "Audit feed captures operational and grading events.",
      "Users and active audit actor control attribution.",
    ],
    whyItMatters: [
      "Audit quality is essential for governance and disputes.",
      "Correct actor attribution supports accountability.",
    ],
    preflight: [
      "Confirm active user role and status.",
      "Set retention/export expectations for audit review.",
    ],
    steps: [
      {
        id: "inspect-events",
        title: "Inspect event chain for key actions",
        what: "Trace extraction, scope changes, grading, and feedback edits.",
        how: [
          "Filter by route/type/time.",
          "Match request context across related events.",
        ],
        why: "Event linkage is required for forensic and compliance use.",
      },
    ],
    issues: [
      {
        issue: "Missing expected event",
        cause: "Action failed pre-commit or wrong environment viewed.",
        fix: "Verify route response and environment, then retry trace.",
      },
    ],
  },
};

const UI_CONTROLS_BY_SLUG: Record<string, HelpUiControl[]> = {
  "home": [
    {
      kind: "Badge",
      label: "Hero status pills (Ready / Reference-driven / Audit-friendly)",
      location: "Home hero header",
      meaning: "Indicate current platform posture and governance focus.",
      useWhen: "Quickly confirming operating mode before task routing.",
      impact: "Sets operator expectation for lock-first grading workflow.",
    },
    {
      kind: "Button",
      label: "Go to Upload",
      location: "Home hero actions",
      meaning: "Routes directly to intake workflow.",
      useWhen: "Starting new evidence ingestion.",
      impact: "Begins submission creation and extraction pipeline.",
    },
    {
      kind: "Button",
      label: "Go to Admin",
      location: "Home hero actions",
      meaning: "Routes directly to admin control tower.",
      useWhen: "Investigating blockers, QA, or policy operations.",
      impact: "Switches from operations intake to governance workflows.",
    },
    {
      kind: "Card",
      label: "Status summary cards",
      location: "Home top section",
      meaning: "Show queue and system health at a glance.",
      useWhen: "Start of day and before running bulk operations.",
      impact: "Helps choose the right next page and priority.",
    },
    {
      kind: "Card",
      label: "Workspace cards (Spec Library / Briefs Library / Upload / Submissions)",
      location: "Home workspace section",
      meaning: "Shortcut cards into core operational modules.",
      useWhen: "Routing from overview into active work.",
      impact: "Reduces navigation time and missed module transitions.",
    },
    {
      kind: "Card",
      label: "Admin workspace shortcuts",
      location: "Home lower section",
      meaning: "Direct links to admin sub-areas from landing page.",
      useWhen: "Need fast jump to admin submodule without opening admin index first.",
      impact: "Improves incident response speed.",
    },
    {
      kind: "Button",
      label: "Primary route shortcuts",
      location: "Home quick links",
      meaning: "Direct links to Upload, Submissions, and Admin modules.",
      useWhen: "When switching from overview to action.",
      impact: "Reduces routing mistakes and context switching.",
    },
  ],
  "upload": [
    {
      kind: "Field",
      label: "File upload dropzone",
      location: "Upload page main form",
      meaning: "Accepts student evidence files for ingestion.",
      useWhen: "Creating new submissions.",
      impact: "Starts extraction and queue placement.",
    },
    {
      kind: "Field",
      label: "Student / assignment selectors",
      location: "Upload metadata panel",
      meaning: "Bind evidence to the correct learner and assignment context.",
      useWhen: "After file upload, before final save.",
      impact: "Prevents wrong-context grading and manual relinking later.",
    },
    {
      kind: "Badge",
      label: "Readiness status",
      location: "Upload results / queue row",
      meaning: "Indicates whether submission can proceed toward grading.",
      useWhen: "Post-upload validation.",
      impact: "Determines whether row enters auto-ready or manual lanes.",
    },
    {
      kind: "Button",
      label: "Upload / Submit action",
      location: "Upload form action bar",
      meaning: "Creates submission records from selected files and metadata.",
      useWhen: "After validating file set and learner context.",
      impact: "Commits intake to queue and starts downstream workflow.",
    },
    {
      kind: "Alert",
      label: "Unsupported file / quality warnings",
      location: "Upload validation feedback",
      meaning: "Warns when file type or document quality may fail extraction.",
      useWhen: "Before final upload confirmation.",
      impact: "Prevents avoidable failures from entering operational queue.",
    },
  ],
  "submissions-list": [
    {
      kind: "Filter",
      label: "Unlinked only",
      location: "Top filter bar",
      meaning: "Shows rows missing student/assignment linkage.",
      useWhen: "Link-cleanup pass before grading.",
      impact: "Removes hidden linkage blockers early.",
    },
    {
      kind: "Filter",
      label: "Ready to upload",
      location: "Top filter bar",
      meaning: "Shows rows ready for external upload workflow.",
      useWhen: "Preparing delivery/export batches.",
      impact: "Keeps upload handoff separated from grading triage.",
    },
    {
      kind: "Toggle",
      label: "Handoff mode",
      location: "Top filter bar",
      meaning: "Switches queue behavior to handoff-oriented operations.",
      useWhen: "Team handover and dispatch windows.",
      impact: "Changes visible actions and expected workflow order.",
    },
    {
      kind: "Filter",
      label: "QA review only",
      location: "Top filter bar",
      meaning: "Shows rows requiring QA attention only.",
      useWhen: "Moderation and quality pass.",
      impact: "Prevents mixing QA tasks with intake triage.",
    },
    {
      kind: "Filter",
      label: "Today / This week",
      location: "Top filter bar",
      meaning: "Date window quick filters for queue slicing.",
      useWhen: "Daily or weekly queue management.",
      impact: "Keeps workload review scoped and measurable.",
    },
    {
      kind: "Field",
      label: "Search (filename, student, email)",
      location: "Top filter bar",
      meaning: "Finds rows by file or learner metadata.",
      useWhen: "Investigating a specific submission.",
      impact: "Reduces scan time in large queues.",
    },
    {
      kind: "Filter",
      label: "All statuses / All lanes",
      location: "Top filter bar dropdowns",
      meaning: "Global scoping across lifecycle status and lane.",
      useWhen: "Targeted queue subsets for actions.",
      impact: "Controls which rows receive bulk actions.",
    },
    {
      kind: "Badge",
      label: "Queue pressure",
      location: "Pressure strip above lane actions",
      meaning: "Aggregates backlog and risk signals.",
      useWhen: "Before selecting batch operations.",
      impact: "Guides priority to highest-risk lane first.",
    },
    {
      kind: "Alert",
      label: "Preview stale",
      location: "Pressure strip",
      meaning: "QA preview no longer matches current queue state.",
      useWhen: "Before committing QA lane.",
      impact: "Blocks unsafe commit actions until re-preview.",
    },
    {
      kind: "Button",
      label: "Grade auto ready",
      location: "Primary batch actions",
      meaning: "Runs grading only for automation-safe rows.",
      useWhen: "Normal throughput operations.",
      impact: "Improves speed with lower manual handling.",
    },
    {
      kind: "Button",
      label: "Grade all visible",
      location: "Primary batch actions",
      meaning: "Runs grading for currently filtered rows.",
      useWhen: "After strict filter validation.",
      impact: "High impact; can trigger broad queue mutation.",
    },
    {
      kind: "Button",
      label: "Preview QA lane",
      location: "Primary batch actions",
      meaning: "Builds non-committed QA candidate set.",
      useWhen: "Before QA commit.",
      impact: "Required guard step for defensible QA commits.",
    },
    {
      kind: "Button",
      label: "Commit QA lane",
      location: "Primary batch actions",
      meaning: "Applies QA actions against latest valid preview.",
      useWhen: "Only after preview is current and reviewed.",
      impact: "Writes queue changes and audit trail entries.",
    },
    {
      kind: "Button",
      label: "Retry failed",
      location: "Primary batch actions",
      meaning: "Retries rows with previous failed runs.",
      useWhen: "After fixing root causes.",
      impact: "Clears stale failures without touching healthy rows.",
    },
    {
      kind: "Card",
      label: "Lane cards (Auto-ready, Needs Human, Blocked, Completed)",
      location: "Queue body",
      meaning: "Group submissions by execution state.",
      useWhen: "Core daily triage.",
      impact: "Defines the safe order of operations.",
    },
    {
      kind: "Button",
      label: "Lane collapse",
      location: "Each lane header",
      meaning: "Collapses lane to reduce vertical noise.",
      useWhen: "When focusing on one lane at a time.",
      impact: "Improves scanning speed and situational clarity.",
    },
    {
      kind: "Button",
      label: "Open record",
      location: "Row action column",
      meaning: "Opens `/submissions/[submissionId]` full workspace.",
      useWhen: "Deep evidence and feedback review is required.",
      impact: "Switches from queue triage to detailed grading context.",
    },
    {
      kind: "Badge",
      label: "Grade badge (PASS/MERIT/etc.)",
      location: "Row grade column",
      meaning: "Latest recorded grade outcome for that row.",
      useWhen: "Quick outcome scan and QA sampling.",
      impact: "Supports moderation prioritization by grade band.",
    },
    {
      kind: "Badge",
      label: "Workflow badge (DONE/EXTRACTED/FAILED)",
      location: "Row workflow column",
      meaning: "Current processing stage for the row.",
      useWhen: "Diagnosing why a row is not progressing.",
      impact: "Directs whether to fix extraction, mapping, or grading.",
    },
  ],
  "submissions-support": [
    {
      kind: "Card",
      label: "Support playbook cards",
      location: "Support guide sections",
      meaning: "Incident types with standardized response steps.",
      useWhen: "Operational troubleshooting and handovers.",
      impact: "Improves response consistency and audit quality.",
    },
    {
      kind: "Alert",
      label: "Escalation criteria blocks",
      location: "Support guide warnings",
      meaning: "Conditions where support should escalate to admin.",
      useWhen: "Queue-wide failures or governance-sensitive incidents.",
      impact: "Prevents risky fixes at wrong permission level.",
    },
    {
      kind: "Card",
      label: "Queue triage priority matrix",
      location: "Support guide operational sequence",
      meaning: "Orders blocker handling by dependency and risk.",
      useWhen: "Planning daily workload or incident response.",
      impact: "Stabilizes queue before throughput actions.",
    },
    {
      kind: "Card",
      label: "Support handover checklist",
      location: "Support guide closure section",
      meaning: "Records what was fixed, what remains, and who owns next action.",
      useWhen: "End of shift or escalation transfer.",
      impact: "Reduces rework and context loss between operators.",
    },
  ],
  "submissions-onboarding": [
    {
      kind: "Card",
      label: "Onboarding scenario cards",
      location: "Onboarding tutorial page",
      meaning: "Structured first-run tasks and expected outcomes.",
      useWhen: "Training new assessors/operators.",
      impact: "Builds baseline consistency before live grading.",
    },
    {
      kind: "Badge",
      label: "Checkpoint completion state",
      location: "Tutorial progress and checklist",
      meaning: "Tracks completion of onboarding steps.",
      useWhen: "Guided first-run execution.",
      impact: "Ensures full flow is validated end-to-end.",
    },
    {
      kind: "Card",
      label: "Expected lane outcomes",
      location: "Onboarding scenario definitions",
      meaning: "Shows where each sample should land after upload and linking.",
      useWhen: "Validating first-run environment behavior.",
      impact: "Quickly detects configuration drift.",
    },
    {
      kind: "Alert",
      label: "Preview/commit audit mismatch",
      location: "Onboarding verification notes",
      meaning: "Flags missing or stale QA linkage in audit.",
      useWhen: "Final onboarding verification pass.",
      impact: "Prevents certifying an unverified operational setup.",
    },
  ],
  "submission-detail": [
    {
      kind: "Badge",
      label: "Status chips (Ready/Blocked/Regreaded/etc.)",
      location: "Top submission status area",
      meaning: "Current operational state and context markers.",
      useWhen: "Before any grading or feedback edits.",
      impact: "Shows if prerequisites are satisfied.",
    },
    {
      kind: "Button",
      label: "Ready to upload action",
      location: "Top action strip",
      meaning: "Moves record toward external upload handoff stage.",
      useWhen: "After grading and QA are complete.",
      impact: "Changes queue readiness for downstream delivery.",
    },
    {
      kind: "Tab",
      label: "Checklist / Student / Assignment / Extraction / Grading",
      location: "Header tab row",
      meaning: "Quick navigation to key lifecycle views.",
      useWhen: "Switching between setup and grading evidence checks.",
      impact: "Maintains full context on one page.",
    },
    {
      kind: "Card",
      label: "Quick Actions card",
      location: "Left rail, top card",
      meaning: "Fast action commands for this submission.",
      useWhen: "High-frequency operations during review.",
      impact: "Reduces clicks for repeated workflows.",
    },
    {
      kind: "Toggle",
      label: "Left rail section collapse",
      location: "Left rail cards",
      meaning: "Collapses section into compact line view.",
      useWhen: "Needing all sections visible without scrolling.",
      impact: "Increases navigation density and speed.",
    },
    {
      kind: "Card",
      label: "Grade config card",
      location: "Audit & outputs area",
      meaning: "Model and grading behavior settings for run context.",
      useWhen: "Before triggering grading run.",
      impact: "Defines effective model and generation strategy.",
    },
    {
      kind: "Alert",
      label: "Confidence decomposition warnings",
      location: "Audit & outputs confidence panel",
      meaning: "Explains why confidence was capped or reduced.",
      useWhen: "Low-confidence or disputed outcomes.",
      impact: "Guides targeted fixes before re-run.",
    },
    {
      kind: "Field",
      label: "Page note editor",
      location: "Marked PDF feedback section",
      meaning: "Page-specific constructive note to the learner.",
      useWhen: "Evidence on page needs coaching or correction guidance.",
      impact: "Improves actionable learner feedback quality.",
    },
    {
      kind: "Field",
      label: "Overall feedback editor",
      location: "Final feedback panel",
      meaning: "Final summary feedback shown to learner.",
      useWhen: "After criterion-level and page-level review is complete.",
      impact: "Produces final student-facing narrative.",
    },
  ],
  "students-pages": [
    {
      kind: "Field",
      label: "Student search",
      location: "Students list page header",
      meaning: "Find learners by name/email/reference.",
      useWhen: "Resolving linkage or checking history.",
      impact: "Speeds correction of wrong or missing links.",
    },
    {
      kind: "Card",
      label: "Student profile summary",
      location: "Student detail page",
      meaning: "Identity fields and linked submission history.",
      useWhen: "Before merging or relinking records.",
      impact: "Prevents accidental edits on wrong profile.",
    },
  ],
  "admin-index": [
    {
      kind: "Badge",
      label: "Operations Overview pill + Live system snapshot",
      location: "Admin hero section",
      meaning: "Indicates the page is a real-time control tower view.",
      useWhen: "At start of admin review cycles.",
      impact: "Signals current state should drive task ordering.",
    },
    {
      kind: "Button",
      label: "Open QA workspace / Open audit log / Open submissions",
      location: "Admin hero actions",
      meaning: "High-priority operational routes from the control tower.",
      useWhen: "Moving from signal to active intervention.",
      impact: "Cuts response time for QA and incident triage.",
    },
    {
      kind: "Card",
      label: "Admin KPI cards",
      location: "Admin overview",
      meaning: "High-level risk and workload signals for governance.",
      useWhen: "Daily admin review.",
      impact: "Prioritizes module-level intervention order.",
    },
    {
      kind: "Card",
      label: "Automation ready",
      location: "Admin KPI cards",
      meaning: "Rows that are linked and stable enough to enter QA review flow.",
      useWhen: "Planning QA workload.",
      impact: "Indicates review candidate volume, not final approval count.",
    },
    {
      kind: "Card",
      label: "Open blockers",
      location: "Admin KPI cards",
      meaning: "Total unresolved lock, extraction, linking, and failure blockers.",
      useWhen: "Before running new grading batches.",
      impact: "If high, grading throughput will degrade until resolved.",
    },
    {
      kind: "Card",
      label: "How to review Automation ready",
      location: "Admin guidance cards",
      meaning: "Step-by-step instruction card for QA review flow.",
      useWhen: "When team asks how to action automation-ready metric.",
      impact: "Standardizes QA pass process across assessors.",
    },
    {
      kind: "Card",
      label: "How to clear Open blockers",
      location: "Admin guidance cards",
      meaning: "Dependency-ordered instructions for blocker resolution.",
      useWhen: "When blocker count is non-zero.",
      impact: "Keeps remediation ordered and reduces repeated failures.",
    },
    {
      kind: "Card",
      label: "Action cards (QA Research / Audit Log / Settings / Bindings)",
      location: "Admin action grid",
      meaning: "Role-specific entry points to key admin modules.",
      useWhen: "After identifying which area needs intervention.",
      impact: "Keeps remediation paths explicit and consistent.",
    },
    {
      kind: "Card",
      label: "Needs attention now list",
      location: "Admin middle section",
      meaning: "Operational blocker list with counts and hints.",
      useWhen: "Prioritizing unresolved blockers.",
      impact: "Defines the immediate fix queue.",
    },
    {
      kind: "Card",
      label: "Grade distribution snapshot",
      location: "Admin middle section",
      meaning: "Current grade-band volume by outcome.",
      useWhen: "Monitoring grading trend and QA sampling strategy.",
      impact: "Highlights abnormal grading distribution quickly.",
    },
    {
      kind: "Card",
      label: "Recently updated references/submissions",
      location: "Admin bottom section",
      meaning: "Recent activity feed for reference docs and submissions.",
      useWhen: "Tracing latest changes before incident analysis.",
      impact: "Improves temporal context and debugging speed.",
    },
    {
      kind: "Button",
      label: "Module quick links",
      location: "Admin overview actions",
      meaning: "Direct route to QA, Briefs, Specs, Settings, etc.",
      useWhen: "Moving from signal to remediation.",
      impact: "Reduces response time during incidents.",
    },
  ],
  "admin-qa": [
    {
      kind: "Filter",
      label: "Run quality filters",
      location: "Admin QA toolbar",
      meaning: "Scope by confidence, failures, or run recency.",
      useWhen: "Sampling for moderation and drift detection.",
      impact: "Improves defect detection efficiency.",
    },
    {
      kind: "Card",
      label: "QA output cards",
      location: "Admin QA results",
      meaning: "Summarize grading quality and risk trends.",
      useWhen: "Weekly QA reviews and incident follow-up.",
      impact: "Informs tuning and process improvements.",
    },
    {
      kind: "Card",
      label: "Run-level evidence table",
      location: "Admin QA detail list",
      meaning: "Shows confidence, caps, and anomalies per run.",
      useWhen: "Selecting candidates for manual moderation.",
      impact: "Improves risk-focused QA sampling.",
    },
    {
      kind: "Button",
      label: "Open submission from QA result",
      location: "Admin QA row actions",
      meaning: "Jumps into full submission detail for evidence inspection.",
      useWhen: "QA finding needs page-level confirmation.",
      impact: "Shortens path from trend signal to root-cause review.",
    },
  ],
  "admin-specs": [
    {
      kind: "Button",
      label: "Extract / Re-extract spec",
      location: "Spec detail actions",
      meaning: "Parses source spec into LO and criteria structure.",
      useWhen: "Initial setup or fixing extraction defects.",
      impact: "Updates canonical criteria source for briefs.",
    },
    {
      kind: "Badge",
      label: "Lock state",
      location: "Spec header",
      meaning: "Indicates whether spec version is locked for stable use.",
      useWhen: "Before linking briefs or publishing changes.",
      impact: "Prevents unreviewed spec drift.",
    },
    {
      kind: "Filter",
      label: "Quick filter (Needs review / Locked / Failed)",
      location: "Specs extract inbox",
      meaning: "Scopes the list to specific remediation states.",
      useWhen: "Prioritizing backlog cleanup.",
      impact: "Keeps focus on highest-risk spec records.",
    },
    {
      kind: "Button",
      label: "Force re-extract",
      location: "Spec detail actions",
      meaning: "Re-runs extraction for locked or problematic records with intent.",
      useWhen: "Correcting known extraction defects after source validation.",
      impact: "Refreshes extracted structure while preserving governance flow.",
    },
  ],
  "admin-briefs": [
    {
      kind: "Tab",
      label: "Overview / Tasks / Versions / IV / Rubric",
      location: "Brief detail tab bar",
      meaning: "Breaks brief governance into focused views.",
      useWhen: "Reviewing extraction quality and lock readiness.",
      impact: "Improves structured audit of brief quality.",
    },
    {
      kind: "Badge",
      label: "Mapping health metrics",
      location: "Brief overview and tasks",
      meaning: "Selected/matched counts and band distribution.",
      useWhen: "Before lock decision.",
      impact: "Flags extraction gaps that would degrade grading.",
    },
    {
      kind: "Badge",
      label: "Criterion pills (active/excluded)",
      location: "Brief library and overview criteria areas",
      meaning: "Show grading scope inclusion state per criterion.",
      useWhen: "Handling external evidence modalities.",
      impact: "Changes final grade envelope and required evidence set.",
    },
    {
      kind: "Alert",
      label: "Quality gate failed",
      location: "Brief lock panel",
      meaning: "Brief cannot lock until extraction/mapping gates pass.",
      useWhen: "Lock action blocked.",
      impact: "Prevents unstable brief from entering live grading.",
    },
    {
      kind: "Button",
      label: "Scope change confirmation flow",
      location: "Criterion pill toggle dialog",
      meaning: "Collects reason and explicit confirmation for scope mutation.",
      useWhen: "Excluding or re-including criteria.",
      impact: "Creates auditable governance trail.",
    },
  ],
  "admin-reference": [
    {
      kind: "Filter",
      label: "Reference status filters",
      location: "Reference inbox toolbar",
      meaning: "Narrow documents by extract/review/lock state.",
      useWhen: "Backlog cleanup and QA checks.",
      impact: "Ensures high-risk docs are resolved first.",
    },
    {
      kind: "Button",
      label: "Extract / Lock controls",
      location: "Reference row actions",
      meaning: "Run extraction and freeze validated reference documents.",
      useWhen: "Preparing docs for spec/brief usage.",
      impact: "Stabilizes downstream extraction dependencies.",
    },
    {
      kind: "Card",
      label: "Reference lifecycle status card",
      location: "Reference inbox rows",
      meaning: "Shows where each document sits in upload-to-lock lifecycle.",
      useWhen: "Daily reference operations.",
      impact: "Avoids acting on the wrong lifecycle stage.",
    },
    {
      kind: "Alert",
      label: "In-use protection warning",
      location: "Reference mutation confirmations",
      meaning: "Warns that document is already used in live grading context.",
      useWhen: "Attempting delete/unlock/replace on active references.",
      impact: "Prevents destructive drift in historical grading runs.",
    },
  ],
  "admin-library": [
    {
      kind: "Badge",
      label: "Criteria pills under each brief",
      location: "Library brief cards/rows",
      meaning: "Show which criteria are in or out of grading scope.",
      useWhen: "Before grading cycle starts.",
      impact: "Makes grading scope visible to all assessors.",
    },
    {
      kind: "Button",
      label: "Criterion toggle",
      location: "Library criteria pills",
      meaning: "Toggles criterion inclusion with governed confirmation.",
      useWhen: "Intentional scope exception handling.",
      impact: "Updates grading scope snapshot for linked submissions.",
    },
    {
      kind: "Alert",
      label: "Scope-change confirmation dialog",
      location: "Criterion toggle flow",
      meaning: "Requires explicit reason and acknowledgement before mutation.",
      useWhen: "Applying inclusion/exclusion changes.",
      impact: "Creates traceable governance justification.",
    },
    {
      kind: "Card",
      label: "Scope state indicators",
      location: "Library row summary",
      meaning: "Shows active/excluded mix at a glance for each brief.",
      useWhen: "Pre-grade scope validation.",
      impact: "Reduces surprise criteria omissions in grading outcomes.",
    },
  ],
  "admin-bindings": [
    {
      kind: "Field",
      label: "Binding target selectors",
      location: "Bindings edit form",
      meaning: "Maps assignment references to locked briefs.",
      useWhen: "New unit setup or correcting mismatches.",
      impact: "Controls which criteria set grading resolves against.",
    },
    {
      kind: "Alert",
      label: "Conflict / duplicate binding warnings",
      location: "Bindings validation area",
      meaning: "Signals ambiguous or invalid mapping relationships.",
      useWhen: "Before saving binding changes.",
      impact: "Prevents high-impact grading context errors.",
    },
    {
      kind: "Button",
      label: "Save binding",
      location: "Bindings action bar",
      meaning: "Persists assignment-to-brief mapping update.",
      useWhen: "After resolving all validation warnings.",
      impact: "Immediately affects criteria resolution in future runs.",
    },
    {
      kind: "Card",
      label: "Binding health summary",
      location: "Bindings overview panel",
      meaning: "Aggregates linked, unresolved, and conflicting mappings.",
      useWhen: "Before enabling batch grading.",
      impact: "Highlights readiness and risk in one view.",
    },
  ],
  "admin-settings": [
    {
      kind: "Field",
      label: "Model selection",
      location: "AI section - Agent model card",
      meaning: "Default model used for grading runs where not overridden.",
      useWhen: "Policy tuning or model migration.",
      impact: "Changes run behavior across the platform.",
    },
    {
      kind: "Button",
      label: "Test config (AI)",
      location: "AI section action bar",
      meaning: "Runs connectivity smoke check against OpenAI and selected model availability.",
      useWhen: "Before saving model or key-related changes.",
      impact: "Prevents saving unusable AI config to live workflow.",
    },
    {
      kind: "Toggle",
      label: "Policy toggles",
      location: "Admin settings policy section",
      meaning: "Enable/disable automation and governance gates.",
      useWhen: "Operational hardening updates.",
      impact: "Can alter queue behavior and mutation permissions.",
    },
    {
      kind: "Button",
      label: "Save all / Save all atomically",
      location: "Top settings bar and unsaved-changes bar",
      meaning: "Commits AI + grading + app changes using batch save path.",
      useWhen: "When multiple sections are edited together.",
      impact: "Avoids partial cross-section saves and mixed-state drift.",
    },
    {
      kind: "Alert",
      label: "Unsaved changes guard",
      location: "Navigation leave warning + sticky unsaved bar",
      meaning: "Signals local edits are not yet persisted and guards accidental exit.",
      useWhen: "Navigating away or switching pages with dirty state.",
      impact: "Prevents accidental loss of config edits.",
    },
    {
      kind: "Card",
      label: "Section status cards",
      location: "Settings overview strip",
      meaning: "Shows whether AI/Grading/App sections are in sync or dirty.",
      useWhen: "Before committing changes.",
      impact: "Improves clarity of pending scope.",
    },
    {
      kind: "Button",
      label: "Revert / Reset defaults",
      location: "Section action bars",
      meaning: "Revert restores last loaded values; reset applies baseline defaults.",
      useWhen: "Undoing drafts or returning to known-safe baseline.",
      impact: "Reduces risky manual re-entry and speeds rollback.",
    },
    {
      kind: "Button",
      label: "Test config (Grading)",
      location: "Grading section action bar",
      meaning: "Validates grading template placeholders and config limits before save.",
      useWhen: "Before committing grading prompt/tone/note changes.",
      impact: "Prevents invalid grading config from being persisted.",
    },
    {
      kind: "Alert",
      label: "Automation-disabled dependency warning",
      location: "App section automation policy card",
      meaning: "Provider and batch controls are disabled when pipeline toggle is off.",
      useWhen: "Changing automation enable state.",
      impact: "Avoids inconsistent policy combinations.",
    },
    {
      kind: "Card",
      label: "Structured settings audit entries",
      location: "Settings audit trail list",
      meaning: "Displays from/to diffs with copy action and raw payload toggle.",
      useWhen: "Reviewing or documenting settings changes.",
      impact: "Improves governance traceability and incident rollback speed.",
    },
  ],
  "admin-audit-users": [
    {
      kind: "Filter",
      label: "Audit event filters",
      location: "Audit page toolbar",
      meaning: "Filter by time, event type, actor, and entity.",
      useWhen: "Incident investigation or moderation review.",
      impact: "Improves traceability and root-cause speed.",
    },
    {
      kind: "Card",
      label: "Event detail card",
      location: "Audit event expansion",
      meaning: "Shows payload, actor, and timestamps for each action.",
      useWhen: "Verifying what changed and why.",
      impact: "Supports governance evidence requirements.",
    },
    {
      kind: "Field",
      label: "User role controls",
      location: "Users admin page",
      meaning: "Manage permissions for sensitive actions.",
      useWhen: "Team changes or permission hardening.",
      impact: "Controls access to high-impact mutations.",
    },
    {
      kind: "Card",
      label: "QA preview-to-commit integrity panel",
      location: "Audit page top table",
      meaning: "Verifies each commit references a matching preview run.",
      useWhen: "Checking QA process compliance.",
      impact: "Protects against unsafe direct commit behavior.",
    },
    {
      kind: "Button",
      label: "Open linked entity",
      location: "Audit event rows",
      meaning: "Navigates to submission/reference associated with an event.",
      useWhen: "Moving from log evidence to object-level remediation.",
      impact: "Speeds incident triage and validation loops.",
    },
  ],
};

const DEEP_GUIDE_BY_SLUG: Record<
  string,
  {
    successCriteria: string[];
    decisionGuide: HelpDecisionRule[];
    commonMistakes: HelpMistake[];
  }
> = {
  "home": {
    successCriteria: [
      "You can route to Upload, Submissions, or Admin in one click without second-guessing.",
      "You can explain what each top summary card means for today's priority.",
      "You can identify when to escalate to Admin instead of continuing normal queue work.",
    ],
    decisionGuide: [
      {
        if: "Queue pressure or blockers are high",
        then: "Open Submissions first and triage blockers before intake or regrade actions.",
        because: "Throughput work on top of unresolved blockers compounds failure volume.",
      },
      {
        if: "Governance questions or lock uncertainty appear",
        then: "Open Admin and validate lock/readiness state before operational mutations.",
        because: "Governance state defines whether downstream grading is safe.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Jumping straight to grading from the landing page.",
        risk: "Runs execute with unresolved blockers or stale context.",
        correct: "Read summary cards first and route according to risk and ownership.",
      },
      {
        mistake: "Treating Home as static information only.",
        risk: "You miss fast remediation links and lose response time.",
        correct: "Use Home as an operations router, not just a dashboard snapshot.",
      },
    ],
  },
  "upload": {
    successCriteria: [
      "Every intended file appears exactly once in Submissions.",
      "Uploads are linked with enough metadata to avoid avoidable manual resolution.",
      "You can spot low-quality scans before they become extraction failures.",
    ],
    decisionGuide: [
      {
        if: "Source files are mixed quality or unknown templates",
        then: "Upload in small batches and verify first outcomes before full volume.",
        because: "Small-batch validation prevents broad queue contamination.",
      },
      {
        if: "Same learner/assignment appears twice",
        then: "Pause and verify whether duplicate upload or genuine resubmission.",
        because: "Duplicate records distort lane pressure and grading coverage.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Uploading large unverified batches with new formats.",
        risk: "Mass OCR/extraction failures and heavy manual cleanup.",
        correct: "Run controlled pilot uploads first, then scale volume.",
      },
      {
        mistake: "Skipping post-upload queue verification.",
        risk: "Missing files or duplicates are detected too late.",
        correct: "Immediately confirm row creation and key metadata in Submissions.",
      },
    ],
  },
  "submissions-list": {
    successCriteria: [
      "Blocked and Needs Human lanes trend downward before bulk grading actions.",
      "QA preview/commit workflow is used only with current preview context.",
      "Batch actions target intentional, filtered subsets rather than broad accidental scope.",
    ],
    decisionGuide: [
      {
        if: "Lane counts are rising in Blocked or Needs Human",
        then: "Stop grading batches and clear context blockers first.",
        because: "Unresolved context causes predictable rework and weak audit trails.",
      },
      {
        if: "QA commit button is unavailable or stale",
        then: "Run Preview QA lane again and commit only if queue is unchanged.",
        because: "Commit requires traceable alignment with the latest preview snapshot.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Using Grade all visible with broad filters still active.",
        risk: "High-impact unintended queue mutation.",
        correct: "Narrow filters explicitly and verify visible count before batch actions.",
      },
      {
        mistake: "Treating QA lane as optional.",
        risk: "Lower defensibility and weaker moderation outcomes.",
        correct: "Use preview then commit for QA-marked records every time.",
      },
    ],
  },
  "submissions-support": {
    successCriteria: [
      "Support actions follow a repeatable blocker-first sequence.",
      "Escalations include clear evidence (status, context, and route to reproduce).",
      "Support handovers preserve exactly what was done and what remains.",
    ],
    decisionGuide: [
      {
        if: "Issue is isolated to one submission",
        then: "Resolve in submission detail and record root cause in notes.",
        because: "Single-record fixes should not trigger broad operational changes.",
      },
      {
        if: "Issue pattern affects multiple rows",
        then: "Escalate through Admin/Audit with sample evidence and counts.",
        because: "Systemic issues require policy or pipeline-level intervention.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Applying global workarounds for local data defects.",
        risk: "Wide regression risk and inconsistent grading behavior.",
        correct: "Keep local fixes local; escalate only repeated pattern failures.",
      },
      {
        mistake: "Closing support action without verifying queue movement.",
        risk: "Hidden blockers remain and resurface later.",
        correct: "Re-check lane state and affected records after every fix.",
      },
    ],
  },
  "submissions-onboarding": {
    successCriteria: [
      "All planned sample scenarios land in expected lanes.",
      "New operator can explain preview/commit guard without prompting.",
      "Onboarding run leaves a clear audit chain from upload to result.",
    ],
    decisionGuide: [
      {
        if: "One sample behaves unexpectedly",
        then: "Pause onboarding and inspect extraction/linking assumptions before proceeding.",
        because: "Continuing hides early configuration issues.",
      },
      {
        if: "QA linkage is missing in audit",
        then: "Repeat preview+commit sequence on current queue state.",
        because: "Training is incomplete without validated traceability.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Skipping onboarding verification on a new environment.",
        risk: "Undetected environment drift during live operations.",
        correct: "Always run the controlled first-run scenario before live volume.",
      },
      {
        mistake: "Focusing only on grade output, not process evidence.",
        risk: "Operator cannot debug failures later.",
        correct: "Validate both outcomes and process trace data during onboarding.",
      },
    ],
  },
  "submission-detail": {
    successCriteria: [
      "Page-level and overall feedback are aligned with criterion evidence.",
      "Student-facing output excludes internal system tuning language.",
      "Confidence warnings are understood and either accepted or remediated.",
    ],
    decisionGuide: [
      {
        if: "Evidence is thin or missing for a criterion",
        then: "Document the gap in page/overall feedback and avoid unsupported claims.",
        because: "Evidence traceability is required for defensible outcomes.",
      },
      {
        if: "Constructive notes feel generic",
        then: "Anchor notes to what is visible on that page and what to improve next.",
        because: "Targeted notes improve learner actionability and fairness.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Leaving placeholder text or template-like comments in notes.",
        risk: "Learner-facing quality drops and trust is reduced.",
        correct: "Write concrete, page-specific comments and remove placeholders.",
      },
      {
        mistake: "Exposing internal controls (tone/strictness/system hints) in learner feedback.",
        risk: "Confusing and non-compliant student output.",
        correct: "Keep internal diagnostics in audit; keep learner feedback educational.",
      },
    ],
  },
  "students-pages": {
    successCriteria: [
      "Each learner has one authoritative record unless a justified merge path exists.",
      "Submission history reflects accurate learner identity after linking changes.",
      "Manual linking decisions are repeatable and explainable.",
    ],
    decisionGuide: [
      {
        if: "Two near-identical student profiles appear",
        then: "Validate identifiers before merge or relink actions.",
        because: "Name-only matching is insufficient for identity-critical operations.",
      },
      {
        if: "Link confidence is low",
        then: "Use explicit external reference or email to confirm.",
        because: "False links propagate grading and audit errors.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Linking based on surname similarity alone.",
        risk: "Wrong learner receives grading evidence.",
        correct: "Require at least one strong identifier match before link confirmation.",
      },
      {
        mistake: "Ignoring historical anomalies after relink.",
        risk: "Silent identity corruption in reports and audits.",
        correct: "Review student submission history immediately after any link mutation.",
      },
    ],
  },
  "admin-index": {
    successCriteria: [
      "Blocker backlog is actioned in dependency order.",
      "Automation-ready rows are routed through QA review discipline.",
      "Admin decisions are backed by current, not stale, page signals.",
    ],
    decisionGuide: [
      {
        if: "Open blockers is high",
        then: "Address lock and extraction blockers before initiating new grading batches.",
        because: "Running more grading during blocker pressure degrades reliability.",
      },
      {
        if: "Automation-ready rises but quality concerns remain",
        then: "Increase QA sampling and force preview-first review path.",
        because: "Eligibility is not equivalent to quality assurance completion.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Treating KPI cards as success indicators without drill-down.",
        risk: "Hidden operational risk remains unresolved.",
        correct: "Use KPI cards as routing signals, then verify root causes in target modules.",
      },
      {
        mistake: "Clearing symptoms instead of dependency blockers.",
        risk: "Failures recur in subsequent cycles.",
        correct: "Fix lock/extraction/link foundations first, then rerun workflows.",
      },
    ],
  },
  "admin-qa": {
    successCriteria: [
      "Sampling prioritizes risk (low confidence, caps, high variance) rather than convenience.",
      "QA notes map back to specific criteria/evidence patterns.",
      "QA outcomes feed concrete tuning actions in settings/policy.",
    ],
    decisionGuide: [
      {
        if: "Confidence is high but narrative quality is weak",
        then: "Escalate feedback quality standards rather than confidence thresholds only.",
        because: "Confidence scoring and communication quality are different dimensions.",
      },
      {
        if: "Quality defects cluster by unit or brief",
        then: "Inspect upstream spec/brief extraction and scope assumptions.",
        because: "Recurring defects are often rooted in reference context.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Sampling only PASS outcomes.",
        risk: "Misses drift patterns in higher/lower bands.",
        correct: "Sample across bands with explicit risk weighting.",
      },
      {
        mistake: "Logging findings without remediation owners.",
        risk: "Known defects persist across cycles.",
        correct: "Attach each QA finding to owner, target module, and follow-up date.",
      },
    ],
  },
  "admin-specs": {
    successCriteria: [
      "LO and criteria extraction is complete before lock.",
      "Failed/uncertain extracts are corrected before downstream usage.",
      "Spec lock decisions are consistent with issue/version intent.",
    ],
    decisionGuide: [
      {
        if: "Criteria are missing or malformed",
        then: "Re-extract and validate before lock or import.",
        because: "Spec defects propagate directly to brief mapping and grading scope.",
      },
      {
        if: "Spec is already used downstream",
        then: "Prefer controlled new-version update over destructive edits.",
        because: "Stable lineage is required for governance and reproducibility.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Locking after a superficial scan only.",
        risk: "Hidden extraction gaps become grading contract defects.",
        correct: "Verify LO headers, criteria counts, and warning details before lock.",
      },
      {
        mistake: "Using failed docs as if they were complete extracts.",
        risk: "False confidence in downstream mapping health.",
        correct: "Resolve failed state first, then promote only validated extracts.",
      },
    ],
  },
  "admin-briefs": {
    successCriteria: [
      "Brief lock passes with acceptable extraction and mapping health.",
      "Criteria scope changes have reasoned, auditable confirmation.",
      "Overview/tasks views present complete LO and criteria context.",
    ],
    decisionGuide: [
      {
        if: "Quality gate blocks locking",
        then: "Fix extraction/mapping issues before attempting governance overrides.",
        because: "Quality gate exists to stop unstable briefs entering live grading.",
      },
      {
        if: "External evidence mode requires exclusion",
        then: "Apply criterion toggle with explicit reason and verify downstream impact.",
        because: "Scope changes alter grade envelope and expected learner evidence.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Changing scope without documenting operational reason.",
        risk: "Future moderation cannot explain grade-envelope changes.",
        correct: "Always provide clear reason and keep change history auditable.",
      },
      {
        mistake: "Locking while LO/criteria text is incomplete.",
        risk: "Brief appears valid but grading logic is partially blind.",
        correct: "Confirm LO text and all expected criteria (for example M3/M4 continuity) before lock.",
      },
    ],
  },
  "admin-reference": {
    successCriteria: [
      "Reference documents move predictably from upload to lock.",
      "Failed documents have clear remediation paths before retries.",
      "Live-use safeguards are respected when versioning references.",
    ],
    decisionGuide: [
      {
        if: "Reference is in active downstream use",
        then: "Create a new version rather than deleting/unlocking aggressively.",
        because: "Immutable lineage protects grading reproducibility.",
      },
      {
        if: "Extraction repeatedly fails for a file",
        then: "Validate file integrity/OCR source quality before more retries.",
        because: "Repeated retries without source correction waste queue capacity.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Prioritizing new uploads while failures accumulate.",
        risk: "Backlog quality degrades and lock readiness stalls.",
        correct: "Clear failed/high-risk docs first, then continue normal ingestion.",
      },
      {
        mistake: "Unlock/delete attempts on in-use docs.",
        risk: "Potential downstream breakage and governance violation.",
        correct: "Use versioned updates and maintain historical continuity.",
      },
    ],
  },
  "admin-library": {
    successCriteria: [
      "Criteria inclusion/exclusion state is transparent at a glance.",
      "Scope exceptions are intentional and reversible with audit trail.",
      "Library view supports pre-grade validation for each active brief.",
    ],
    decisionGuide: [
      {
        if: "A criterion should not be graded from submitted file evidence",
        then: "Toggle criterion out with confirmation and reason.",
        because: "Explicit scope management avoids unfair grade caps from missing modalities.",
      },
      {
        if: "Unexpected exclusions appear",
        then: "Review change history before re-including criteria.",
        because: "Reversal without context can reintroduce known governance exceptions.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Using library toggles as ad-hoc experiment controls.",
        risk: "Frequent unstable scope drift in live grading.",
        correct: "Apply toggles through governed intent with change reason.",
      },
      {
        mistake: "Ignoring downstream impact after scope change.",
        risk: "Surprising grade-envelope shifts in active submissions.",
        correct: "Follow with impacted regrade/review process when applicable.",
      },
    ],
  },
  "admin-bindings": {
    successCriteria: [
      "Every active assignment resolves to the intended locked brief.",
      "Binding changes are validated against at least one real submission sample.",
      "Binding conflicts are cleared before queue-wide grading.",
    ],
    decisionGuide: [
      {
        if: "Assignment mapping is ambiguous",
        then: "Resolve conflict before enabling automated grading for that assignment.",
        because: "Ambiguous binding can route grading to the wrong criteria set.",
      },
      {
        if: "Binding was changed after grading already occurred",
        then: "Use impacted regrade flow with documented reason.",
        because: "Past outputs may reflect outdated criteria context.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Treating binding edits as low-impact metadata.",
        risk: "High-impact grading context regressions.",
        correct: "Handle bindings as governance-critical configuration.",
      },
      {
        mistake: "Skipping post-change sample validation.",
        risk: "Incorrect mappings are discovered late in production.",
        correct: "Validate with real sample submission immediately after change.",
      },
    ],
  },
  "admin-settings": {
    successCriteria: [
      "Global model/policy changes are deliberate, tested, and explained.",
      "Operators understand effective settings before running grading.",
      "Configuration drift is minimized across environments.",
      "Multi-section edits are committed through atomic save with a clean audit trail.",
    ],
    decisionGuide: [
      {
        if: "Need to change model or strictness behavior",
        then: "Draft in section, run smoke test, then commit with section save or Save all atomically.",
        because: "Validation before commit prevents broken config from reaching production.",
      },
      {
        if: "Unexpected behavior appears after setting edits",
        then: "Inspect effective run metadata and audit event timeline.",
        because: "Stored settings and effective runtime context may differ by timing.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Applying multiple policy changes in one pass.",
        risk: "Root cause of behavior shifts becomes unclear.",
        correct: "Use section-level tests and atomic save so grouped changes stay traceable.",
      },
      {
        mistake: "Assuming UI-selected model always equals effective model in prior runs.",
        risk: "Incorrect conclusions during QA investigation.",
        correct: "Use run metadata snapshots to confirm effective configuration.",
      },
      {
        mistake: "Navigating away with dirty sections.",
        risk: "Silent loss of operational policy edits.",
        correct: "Use unsaved bar actions (Revert all or Save all atomically) before leaving.",
      },
    ],
  },
  "admin-audit-users": {
    successCriteria: [
      "Critical actions are traceable by actor, time, entity, and request context.",
      "Audit filters can isolate incidents quickly.",
      "User permissions align with operational responsibility boundaries.",
    ],
    decisionGuide: [
      {
        if: "Incident timeline is unclear",
        then: "Filter by entity and timeframe, then reconstruct event chain top-down.",
        because: "Structured timeline analysis reduces false assumptions.",
      },
      {
        if: "Sensitive action lacks clear owner attribution",
        then: "Review active audit actor/user mapping before further mutations.",
        because: "Attribution integrity is required for governance and rollback decisions.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Reviewing audit feed without scoping filters.",
        risk: "High-noise analysis and missed causal events.",
        correct: "Start with narrow filters, then widen scope only when needed.",
      },
      {
        mistake: "Leaving broad permissions assigned after temporary tasks.",
        risk: "Unnecessary high-impact access persists.",
        correct: "Re-tighten roles after task completion and verify user state.",
      },
    ],
  },
};

export function getHelpTutorial(slug: string): HelpTutorial | null {
  const meta = getHelpPageMeta(slug);
  if (!meta) return null;
  const body = TUTORIALS_BY_SLUG[slug];
  if (!body) return null;
  const deepGuide = DEEP_GUIDE_BY_SLUG[slug];
  return {
    slug: meta.slug,
    title: meta.title,
    route: meta.route,
    ...body,
    successCriteria: body.successCriteria || deepGuide?.successCriteria || [],
    decisionGuide: body.decisionGuide || deepGuide?.decisionGuide || [],
    commonMistakes: body.commonMistakes || deepGuide?.commonMistakes || [],
    uiControls: body.uiControls || UI_CONTROLS_BY_SLUG[slug] || [],
  };
}

export function getAllHelpTutorials(): HelpTutorial[] {
  return HELP_PAGES.map((p) => getHelpTutorial(p.slug)).filter(Boolean) as HelpTutorial[];
}
