import { getHelpPageMeta, HELP_PAGES } from "@/lib/help/pages";

export type HelpIssue = {
  issue: string;
  cause: string;
  fix: string;
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
    purpose: "Configure grading behavior, AI model selection, and app-level policies.",
    howItWorks: [
      "Settings persist model, grading template, and note behavior.",
      "Policy toggles affect automation and mutation controls.",
    ],
    whyItMatters: [
      "Centralized policy prevents per-operator drift.",
      "Settings changes should be deliberate and audited.",
    ],
    preflight: [
      "Confirm active audit user identity.",
      "Document expected impact before changing grading settings.",
    ],
    steps: [
      {
        id: "configure-policy",
        title: "Apply policy changes with validation",
        what: "Change one policy group at a time and test on sample submissions.",
        how: [
          "Save setting changes.",
          "Run controlled sample and review output panels.",
        ],
        why: "Prevents multi-variable uncertainty in grading behavior.",
      },
    ],
    issues: [
      {
        issue: "Model change not reflected in run",
        cause: "Effective model resolved from active config at run time.",
        fix: "Re-open run and inspect model snapshot in result metadata.",
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
  ],
  "admin-settings": [
    {
      kind: "Field",
      label: "Model selection",
      location: "Admin settings grading section",
      meaning: "Default model used for grading runs where not overridden.",
      useWhen: "Policy tuning or model migration.",
      impact: "Changes run behavior across the platform.",
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
      label: "Save settings",
      location: "Settings page action bar",
      meaning: "Persists global configuration changes.",
      useWhen: "After controlled setting edits.",
      impact: "Applies defaults to subsequent operations.",
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
  ],
};

export function getHelpTutorial(slug: string): HelpTutorial | null {
  const meta = getHelpPageMeta(slug);
  if (!meta) return null;
  const body = TUTORIALS_BY_SLUG[slug];
  if (!body) return null;
  return {
    slug: meta.slug,
    title: meta.title,
    route: meta.route,
    ...body,
    uiControls: body.uiControls || UI_CONTROLS_BY_SLUG[slug] || [],
  };
}

export function getAllHelpTutorials(): HelpTutorial[] {
  return HELP_PAGES.map((p) => getHelpTutorial(p.slug)).filter(Boolean) as HelpTutorial[];
}
