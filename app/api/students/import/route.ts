import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

function clean(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === "—" || s === "-") return null;
  return s;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normKey(k: string) {
  return k.replace(/\s+/g, " ").trim().toLowerCase();
}

function getCell(row: Record<string, any>, candidates: string[]) {
  const map = new Map<string, string>();
  for (const k of Object.keys(row)) map.set(normKey(k), k);

  for (const c of candidates) {
    const realKey = map.get(normKey(c));
    if (realKey !== undefined) return row[realKey];
  }
  return undefined;
}

function normEmail(v: any) {
  const s = clean(v);
  return s ? s.toLowerCase() : null;
}

function normRef(v: any) {
  const s = clean(v);
  return s ? s.toUpperCase() : null;
}

function mergeCourses(existing: string | null, incoming: string | null): string | null {
  const e = clean(existing);
  const i = clean(incoming);
  if (!e && !i) return null;
  if (!e) return i!;
  if (!i) return e;

  const split = (x: string) =>
    x
      .split("|")
      .flatMap((p) => p.split(","))
      .flatMap((p) => p.split(";"))
      .flatMap((p) => p.split("/"))
      .map((p) => p.trim())
      .filter(Boolean);

  const items = [...split(e), ...split(i)];
  const seen = new Map<string, string>();
  for (const it of items) {
    const key = it.toLowerCase();
    if (!seen.has(key)) seen.set(key, it);
  }
  return Array.from(seen.values()).join(" | ");
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const row of rows) {
    const fullName = clean(getCell(row, ["Full Name", "Name", "Student Name"]));
    const email = normEmail(getCell(row, ["Email", "E-mail"]));
    const externalRef = normRef(getCell(row, ["AB Number", "AB", "External Ref", "externalRef"]));
    const courseName = clean(getCell(row, ["Course", "Course ", "Programme", "Program", "Course Name"]));
    const registrationDate = parseDate(getCell(row, ["Registration Date", "Reg Date", "Start Date"]));

    if (!fullName) {
      skipped++;
      continue;
    }
    if (!externalRef && !email) {
      skipped++;
      continue;
    }

    let student = null as any;

    if (externalRef) student = await prisma.student.findFirst({ where: { externalRef } });
    if (!student && email) student = await prisma.student.findFirst({ where: { email } });

    if (student) {
      // prevent email collision
      let safeEmail = email;
      if (email && student.email !== email) {
        const owner = await prisma.student.findFirst({ where: { email }, select: { id: true } });
        if (owner && owner.id !== student.id) {
          safeEmail = null;
          conflicts++;
        }
      }

      const nextCourse = mergeCourses(student.courseName ?? null, courseName ?? null);

      const data: any = {
        fullName,
        ...(safeEmail ? { email: safeEmail } : {}),
        ...(externalRef ? { externalRef } : {}),
        ...(nextCourse ? { courseName: nextCourse } : {}),
        ...(registrationDate ? { registrationDate } : {}),
      };

      try {
        await prisma.student.update({ where: { id: student.id }, data });
        updated++;
      } catch (e: any) {
        if (e?.code === "P2002") {
          conflicts++;
          continue;
        }
        throw e;
      }
    } else {
      // prevent create collisions
      if (email) {
        const owner = await prisma.student.findFirst({ where: { email }, select: { id: true } });
        if (owner) {
          conflicts++;
          continue;
        }
      }
      if (externalRef) {
        const owner = await prisma.student.findFirst({ where: { externalRef }, select: { id: true } });
        if (owner) {
          conflicts++;
          continue;
        }
      }

      try {
        await prisma.student.create({
          data: { fullName, email, externalRef, courseName, registrationDate },
        });
        created++;
      } catch (e: any) {
        if (e?.code === "P2002") {
          conflicts++;
          continue;
        }
        throw e;
      }
    }
  }

  return NextResponse.json({
    summary: { created, updated, skipped, conflicts, total: rows.length },
  });
}
