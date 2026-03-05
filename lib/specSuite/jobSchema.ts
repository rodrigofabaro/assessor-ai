export function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

export function isSpecSuiteJobSchemaMissing(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") {
    if (msg.includes("specsuiteimportjob") || msg.includes("specsuiteimportjobstatus")) return true;
  }
  if (msg.includes("specsuiteimportjob") && (msg.includes("does not exist") || msg.includes("not exist"))) {
    return true;
  }
  return false;
}
