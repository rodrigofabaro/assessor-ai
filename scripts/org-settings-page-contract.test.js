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
  const orgSettingsPage = read("app/admin/settings/organization/page.tsx");
  const orgSettingsClient = read("app/admin/settings/organization/OrganizationSettingsPageClient.tsx");
  const settingsClient = read("app/admin/settings/SettingsPageClient.tsx");

  assert(
    orgSettingsPage.includes("OrganizationSettingsPageClient"),
    "expected organization settings route to render dedicated page client"
  );
  assert(
    !orgSettingsPage.includes("redirect("),
    "expected organization settings route to stop redirecting to developer console"
  );

  assert(
    orgSettingsClient.includes("/api/auth/organizations"),
    "expected org settings workspace to load session organizations"
  );
  assert(
    orgSettingsClient.includes("/api/auth/switch-organization"),
    "expected org settings workspace to support active organization switching"
  );
  assert(
    orgSettingsClient.includes("/api/admin/organizations/"),
    "expected org settings workspace to load/save organization settings from the tenant settings API"
  );

  assert(
    settingsClient.includes('href="/admin/settings/organization"'),
    "expected main settings nav to link to organization settings"
  );

  console.log("organization settings page contract tests passed.");
}

run();
