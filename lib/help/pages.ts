export type HelpPageMeta = {
  slug: string;
  title: string;
  route: string;
  icon?: "home" | "upload" | "submissions" | "detail" | "students" | "admin" | "qa" | "specs" | "briefs" | "reference" | "library" | "bindings" | "settings" | "audit";
};

export const HELP_PAGES: HelpPageMeta[] = [
  { slug: "home", title: "Home Dashboard", route: "/", icon: "home" },
  { slug: "upload", title: "Upload", route: "/upload", icon: "upload" },
  { slug: "submissions-list", title: "Submissions List", route: "/submissions", icon: "submissions" },
  { slug: "submissions-support", title: "Submissions Support Guide", route: "/submissions", icon: "submissions" },
  { slug: "submissions-onboarding", title: "Submissions Onboarding (First Run)", route: "/submissions", icon: "submissions" },
  { slug: "submission-detail", title: "Submission Detail", route: "/submissions/[submissionId]", icon: "detail" },
  { slug: "students-pages", title: "Students Pages", route: "/students/[id], /admin/students", icon: "students" },
  { slug: "admin-index", title: "Admin Overview", route: "/admin", icon: "admin" },
  { slug: "admin-qa", title: "Admin QA", route: "/admin/qa", icon: "qa" },
  { slug: "admin-specs", title: "Admin Specs", route: "/admin/specs", icon: "specs" },
  { slug: "admin-briefs", title: "Admin Briefs", route: "/admin/briefs, /admin/briefs/[briefId]", icon: "briefs" },
  { slug: "admin-reference", title: "Admin Reference", route: "/admin/reference", icon: "reference" },
  { slug: "admin-library", title: "Admin Library", route: "/admin/library", icon: "library" },
  { slug: "admin-bindings", title: "Admin Bindings", route: "/admin/bindings", icon: "bindings" },
  { slug: "admin-settings", title: "Admin Settings", route: "/admin/settings", icon: "settings" },
  { slug: "admin-audit-users", title: "Admin Audit + Users", route: "/admin/audit, /admin/users", icon: "audit" },
];

export function getHelpPageMeta(slug: string) {
  return HELP_PAGES.find((p) => p.slug === slug) || null;
}
