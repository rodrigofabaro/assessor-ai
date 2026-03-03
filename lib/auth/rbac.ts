export type AppRole = "ADMIN" | "ASSESSOR" | "IV";

export type RoutePolicy = {
  id: string;
  prefix: string;
  allowedRoles: AppRole[];
};

export const ROUTE_POLICIES: RoutePolicy[] = [
  { id: "admin-pages", prefix: "/admin", allowedRoles: ["ADMIN"] },
  { id: "admin-api", prefix: "/api/admin", allowedRoles: ["ADMIN"] },
  { id: "submissions-pages", prefix: "/submissions", allowedRoles: ["ADMIN", "ASSESSOR", "IV"] },
  { id: "submissions-api", prefix: "/api/submissions", allowedRoles: ["ADMIN", "ASSESSOR", "IV"] },
  { id: "students-pages", prefix: "/students", allowedRoles: ["ADMIN", "ASSESSOR", "IV"] },
  { id: "students-api", prefix: "/api/students", allowedRoles: ["ADMIN", "ASSESSOR", "IV"] },
];

export function isAuthGuardsEnabled() {
  const raw = String(process.env.AUTH_GUARDS_ENABLED || "").trim();
  if (!raw) return process.env.NODE_ENV === "production";
  return /^(1|true|yes|on)$/i.test(raw);
}

export function parseRole(value: string | null | undefined): AppRole | null {
  const role = String(value || "").trim().toUpperCase();
  if (role === "ADMIN" || role === "ASSESSOR" || role === "IV") return role;
  return null;
}

export function findPolicyForPath(pathname: string): RoutePolicy | null {
  for (const policy of ROUTE_POLICIES) {
    if (pathname === policy.prefix || pathname.startsWith(`${policy.prefix}/`)) return policy;
  }
  return null;
}
