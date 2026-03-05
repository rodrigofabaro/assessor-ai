import { redirect } from "next/navigation";

export default function OrganizationSettingsRedirectPage() {
  redirect("/admin/developer#organization-settings");
}

