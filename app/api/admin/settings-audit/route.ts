import { NextResponse } from "next/server";
import { listSettingsAuditEvents } from "@/lib/admin/settingsAudit";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const take = Number(searchParams.get("take") || 40);
  const events = listSettingsAuditEvents(take);
  return NextResponse.json({ events });
}
