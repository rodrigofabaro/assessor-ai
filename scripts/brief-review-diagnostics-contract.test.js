#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const taskCard = read("app/admin/briefs/components/TaskCard.tsx");
  const inlineEquationText = read("app/admin/briefs/components/InlineEquationText.tsx");
  const referenceLogic = read("app/admin/reference/reference.logic.ts");

  assert(
    taskCard.includes("looksLikeScenarioCue"),
    "expected task card to gate inferred scenario display behind scenario cues"
  );
  assert(
    taskCard.includes('const scenarioText = extractedScenarioText || (introLooksLikeScenario ? introText : "")'),
    "expected task card to stop treating every intro as scenario text"
  );
  assert(
    taskCard.includes("Extraction route") &&
      taskCard.includes("Page grounding") &&
      taskCard.includes("Visual evidence"),
    "expected task card diagnostics summary for extraction/provenance/image state"
  );
  assert(
    inlineEquationText.includes("Image token") &&
      inlineEquationText.includes("extracted figure asset could not be loaded"),
    "expected inline figure renderer to explain token-present but asset-missing failures"
  );
  assert(
    taskCard.includes("extractTrailingTextAfterStructuredParts") &&
      taskCard.includes("structuredPartsTrailingText"),
    "expected task card to render post-part trailing content such as orphaned image tokens"
  );
  assert(
    referenceLogic.includes("fidelityReport: draft?.fidelityReport || null"),
    "expected client-side mapping health evaluation to include the current brief fidelity report"
  );

  console.log("brief review diagnostics contract tests passed.");
}

run();
