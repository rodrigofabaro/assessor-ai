#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const qaPage = read("app/admin/qa/page.tsx");
  const submissionsRoute = read("app/api/submissions/route.ts");

  assert(
    qaPage.includes("const [datasetRows, setDatasetRows] = useState<SubmissionResearchRow[]>([])"),
    "expected QA page to maintain a filtered dataset state separate from paginated rows"
  );
  assert(
    qaPage.includes("const filteredRows = datasetRows;"),
    "expected QA page summaries to read from the filtered dataset state"
  );
  assert(
    qaPage.includes("const pageRows = rows;"),
    "expected QA page to keep paginated rows for the table actions"
  );
  assert(
    !qaPage.includes("if (row?.ivAd?.exists && existingUrl)"),
    "expected QA page IV-AD action to avoid stale client-side short-circuit reuse"
  );
  assert(
    qaPage.includes("Generate or reuse the active-template IV-AD DOCX"),
    "expected QA page IV-AD button copy to describe active-template generation behaviour"
  );
  assert(
    submissionsRoute.includes("templateId: activeIvTemplate.id"),
    "expected QA submissions route to scope IV-AD rows to the active template"
  );

  console.log("qa page contract tests passed.");
}

run();
