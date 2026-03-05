import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { toStorageRelativePath, writeStorageFile } from "@/lib/storage/provider";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

function safeName(name: string) {
  // keep it filesystem-safe and predictable
  return (name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 120);
}

function clampInt(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function cleanMetaValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}

function summarizeExtractedJson(value: any) {
  if (!value || typeof value !== "object") return null;
  const kind = String(value?.kind || "").toUpperCase();
  if (kind === "BRIEF") {
    const tasks = Array.isArray(value?.tasks) ? value.tasks : [];
    return {
      kind: "BRIEF",
      parserVersion: value?.parserVersion || null,
      assignmentCode: value?.assignmentCode || null,
      unitCodeGuess: value?.unitCodeGuess || null,
      header: value?.header
        ? {
            academicYear: value.header.academicYear || null,
            issueDate: value.header.issueDate || null,
            finalSubmissionDate: value.header.finalSubmissionDate || null,
            verificationDate: value.header.verificationDate || null,
            unitCode: value.header.unitCode || null,
            unitNumberAndTitle: value.header.unitNumberAndTitle || null,
          }
        : null,
      detectedCriterionCodes: Array.isArray(value?.detectedCriterionCodes) ? value.detectedCriterionCodes : [],
      criteriaCodes: Array.isArray(value?.criteriaCodes) ? value.criteriaCodes : [],
      criteriaRefs: Array.isArray(value?.criteriaRefs) ? value.criteriaRefs : [],
      taskCount: tasks.length,
      pageCount: Number(value?.pageCount || 0) || null,
    };
  }
  if (kind === "SPEC") {
    const los = Array.isArray(value?.learningOutcomes) ? value.learningOutcomes : [];
    const criteriaCount = los.reduce((n: number, lo: any) => {
      const rows = Array.isArray(lo?.criteria) ? lo.criteria.length : 0;
      return n + rows;
    }, 0);
    return {
      kind: "SPEC",
      parserVersion: value?.parserVersion || null,
      unit: value?.unit
        ? {
            unitCode: value.unit.unitCode || null,
            specIssue: value.unit.specIssue || value.unit.specVersionLabel || null,
            unitTitle: value.unit.unitTitle || null,
          }
        : null,
      learningOutcomeCount: los.length,
      criteriaCount,
      detectedCriterionCodes: Array.isArray(value?.detectedCriterionCodes) ? value.detectedCriterionCodes : [],
    };
  }
  return {
    kind: kind || null,
    parserVersion: value?.parserVersion || null,
  };
}

function slimSourceMeta(value: any, keepFull = false) {
  if (!value || typeof value !== "object") return value ?? null;
  if (keepFull) return value;
  const next = { ...value };
  if ("manualDraft" in next) delete (next as any).manualDraft;
  return next;
}

function trimExtractionWarnings(value: unknown, keepFull = false) {
  if (keepFull) return value ?? null;
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 8).map((w) => String(w || "").slice(0, 400));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const organizationId = await getRequestOrganizationId();

  const type = (url.searchParams.get("type") || "").toUpperCase(); // SPEC | BRIEF | RUBRIC
  const status = (url.searchParams.get("status") || "").toUpperCase(); // UPLOADED | EXTRACTED | REVIEWED | LOCKED | FAILED
  const q = (url.searchParams.get("q") || "").trim();
  const framework = (url.searchParams.get("framework") || "").trim().toLowerCase();
  const category = (url.searchParams.get("category") || "").trim().toLowerCase();
  const onlyLocked = url.searchParams.get("onlyLocked") === "true";
  const onlyUnlocked = url.searchParams.get("onlyUnlocked") === "true";
  const extractedMode = String(url.searchParams.get("extracted") || "summary").toLowerCase(); // none | summary | full
  const limit = clampInt(url.searchParams.get("limit"), 200, 1, 500);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);
  const includeTotal = url.searchParams.get("includeTotal") === "true";
  const includeFullExtracted = extractedMode === "full";
  const includeSummaryExtracted = extractedMode === "summary";

  const where: any = {};

  // ✅ Key fix: apply type filter when provided
  if (type) {
    where.type = type;
  } else {
    where.type = { not: "IV_FORM" };
  }

  // Optional status filter
  if (status) where.status = status;

  // Optional locked filters (lockedAt is set when locked)
  if (onlyLocked) where.lockedAt = { not: null };
  if (onlyUnlocked) where.lockedAt = null;

  // Optional text search
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { originalFilename: { contains: q, mode: "insensitive" } },
      { storedFilename: { contains: q, mode: "insensitive" } },
    ];
  }

  const scopedWhere = addOrganizationReadScope(where, organizationId);

  const docs = await prisma.referenceDocument.findMany({
    where: scopedWhere as any,
    orderBy: [{ updatedAt: "desc" }, { uploadedAt: "desc" }],
    skip: offset,
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      version: true,
      originalFilename: true,
      storedFilename: true,
      storagePath: true,
      checksumSha256: true,
      uploadedAt: true,
      updatedAt: true,
      lockedAt: true,
      sourceMeta: true,
      extractionWarnings: true,
      extractedJson: includeFullExtracted || includeSummaryExtracted,
    },
  });

  let mappedDocs = docs.map((doc: any) => {
    const extractedJson = includeFullExtracted
      ? doc.extractedJson ?? null
      : includeSummaryExtracted
        ? summarizeExtractedJson(doc.extractedJson)
        : undefined;
    return {
      ...doc,
      sourceMeta: slimSourceMeta(doc.sourceMeta, includeFullExtracted),
      extractionWarnings: trimExtractionWarnings(doc.extractionWarnings, includeFullExtracted),
      ...(includeFullExtracted || includeSummaryExtracted ? { extractedJson } : {}),
    };
  });

  if (framework) {
    mappedDocs = mappedDocs.filter((doc: any) => String(doc?.sourceMeta?.framework || "").trim().toLowerCase() === framework);
  }
  if (category) {
    mappedDocs = mappedDocs.filter((doc: any) => String(doc?.sourceMeta?.category || "").trim().toLowerCase() === category);
  }

  if (!includeTotal) return NextResponse.json({ documents: mappedDocs });
  const total = await prisma.referenceDocument.count({ where: scopedWhere as any });
  return NextResponse.json({
    documents: mappedDocs,
    page: {
      limit,
      offset,
      total,
      hasMore: offset + mappedDocs.length < total,
    },
  });
}


function parseVersion(raw: FormDataEntryValue | null): { version: number; versionLabel?: string } {
  if (typeof raw !== "string") return { version: 1 };

  const label = raw.trim();
  if (!label) return { version: 1 };

  // If user typed "2" or "02"
  if (/^\d+$/.test(label)) {
    const v = Math.max(1, parseInt(label, 10));
    return { version: v, versionLabel: label };
  }

  // If user typed "issue 2", "Issue: 2", "v2", "2025/26 issue 2", etc.
  const m = label.match(/(\d+)/);
  if (m) {
    const v = Math.max(1, parseInt(m[1], 10));
    return { version: v, versionLabel: label };
  }

  // No number found (e.g., "Draft") — default to 1 but keep label
  return { version: 1, versionLabel: label };
}


export async function POST(req: Request) {
  try {
    const organizationId = await getRequestOrganizationId();
    const formData = await req.formData();

    const typeRaw = formData.get("type");
    const titleRaw = formData.get("title");
    const versionRaw = formData.get("version");
    const fileEntries = [
      ...formData.getAll("file"),
      ...formData.getAll("files"),
    ].filter((entry): entry is File => entry instanceof File);

    const type = typeof typeRaw === "string" ? typeRaw.toUpperCase() : "";
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    const { version, versionLabel } = parseVersion(versionRaw);
    const framework = cleanMetaValue(formData.get("framework"));
    const category = cleanMetaValue(formData.get("category"));

    if (!title || !fileEntries.length) {
      return NextResponse.json({ error: "Missing title or file" }, { status: 400 });
    }

    if (type !== "SPEC" && type !== "BRIEF" && type !== "RUBRIC") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (!Number.isFinite(version) || version < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }

    const MAX_BYTES = 50 * 1024 * 1024;
    const documents = [];

    for (const file of fileEntries) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "File too large (max 50MB)." }, { status: 413 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

      // ✅ storedFilename should be stable and safe; keep original name for humans
      const originalSafe = safeName(file.name);
      const storedFilename = `${uuid()}-${originalSafe}`;

      // Keep DB storage key relative for portability across environments.
      const storagePathRel = toStorageRelativePath("reference_uploads", storedFilename);
      const saved = await writeStorageFile(storagePathRel, buffer);

      const sourceMeta: Record<string, unknown> = {};
      if (versionLabel) sourceMeta.versionLabel = versionLabel;
      if (framework) sourceMeta.framework = framework;
      if (category) sourceMeta.category = category;

      const baseCreateData = {
        type: type as any,
        title,
        version,
        originalFilename: file.name,
        storedFilename,
        storagePath: saved.storagePath,
        checksumSha256,
        sourceMeta: Object.keys(sourceMeta).length ? (sourceMeta as any) : undefined,
      };

      const scopedCreateData = organizationId
        ? {
            ...baseCreateData,
            organizationId,
          }
        : baseCreateData;

      let doc: Awaited<ReturnType<typeof prisma.referenceDocument.create>>;
      try {
        doc = await prisma.referenceDocument.create({
          data: scopedCreateData as any,
        });
      } catch (createErr) {
        if (!isOrgScopeCompatError(createErr)) throw createErr;
        doc = await prisma.referenceDocument.create({
          data: baseCreateData as any,
        });
      }

      documents.push(doc);
    }

    if (documents.length === 1) {
      return NextResponse.json({ document: documents[0] });
    }

    return NextResponse.json({ documents });
  } catch (err) {
    console.error("REFERENCE_UPLOAD_ERROR:", err);
    const raw = String((err as { message?: unknown } | null)?.message || err || "").trim();
    const msgLower = raw.toLowerCase();
    let userMessage = "Upload failed.";
    if (msgLower.includes("blob_read_write_token")) {
      userMessage = "Storage is not configured. Set BLOB_READ_WRITE_TOKEN in Vercel and redeploy.";
    } else if (msgLower.includes("storage_backend")) {
      userMessage = "Storage backend is misconfigured. Use STORAGE_BACKEND=filesystem or STORAGE_BACKEND=vercel_blob.";
    } else if (raw) {
      userMessage = raw;
    }
    return NextResponse.json(
      {
        error: userMessage,
        code: "REFERENCE_UPLOAD_FAILED",
      },
      { status: 500 }
    );
  }
}
