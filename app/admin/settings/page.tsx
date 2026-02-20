import { redirect } from "next/navigation";

export { AdminSettingsPage } from "./SettingsPageClient";

export default function SettingsPage() {
  redirect("/admin/settings/ai");
}
