import { NextResponse } from "next/server";
import { listSettingsAuditEvents } from "@/lib/admin/settingsAudit";
import { getSettingsReadContext } from "@/lib/admin/settingsPermissions";

export async function GET(req: Request) {
  const readCtx = await getSettingsReadContext();
  if (!readCtx.canRead) {
    return NextResponse.json({ error: "Insufficient role for settings read." }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const take = Number(searchParams.get("take") || 40);
  const events = listSettingsAuditEvents(take);
  return NextResponse.json({ events });
}
