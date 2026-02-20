"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { FEEDBACK_TEMPLATE_ALL_TOKENS, FEEDBACK_TEMPLATE_REQUIRED_TOKENS } from "@/lib/grading/feedbackDocument";
import { TinyIcon } from "@/components/ui/TinyIcon";

type EndpointOkUsage = {
  available: true;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type EndpointOkCosts = {
  available: true;
  amount: number;
  currency: string;
};

type EndpointError = {
  available: false;
  status?: number;
  message?: string;
};
type AnyEndpoint = EndpointOkUsage | EndpointOkCosts | EndpointError;

type UsagePayload = {
  configured: boolean;
  keyType?: "admin" | "standard";
  model?: string;
  modelSource?: "env" | "settings";
  message?: string;
  generatedAt?: string;
  connection?: {
    reachable: boolean;
    status: number;
    message: string;
  };
  window?: {
    startTime: number;
    endTime: number;
    days: number;
  };
  hints?: {
    needsAdminKeyForOrgMetrics?: boolean;
  };
  localUsage?: {
    available: boolean;
    totals: {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd?: number;
    };
    days: Array<{
      date: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd?: number;
    }>;
    recentEvents?: Array<{
      ts: number;
      model: string;
      op: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd?: number;
    }>;
  };
  usage?: EndpointOkUsage | EndpointError;
  costs?: EndpointOkCosts | EndpointError;
};

type ModelPayload = {
  model: string;
  autoCleanupApproved?: boolean;
  source: "env" | "settings";
  allowedModels: string[];
};

type GradingConfigPayload = {
  model: string;
  tone: "supportive" | "professional" | "strict";
  strictness: "lenient" | "balanced" | "strict";
  useRubricIfAvailable: boolean;
  studentSafeMarkedPdf: boolean;
  maxFeedbackBullets: number;
  feedbackTemplate: string;
  feedbackTemplateScope?: "active-user" | "default";
  activeTemplateUserId?: string | null;
  feedbackTemplateByUserCount?: number;
  feedbackTemplateAllTokens?: string[];
  feedbackTemplateRequiredTokens?: string[];
  pageNotesEnabled: boolean;
  pageNotesTone: "supportive" | "professional" | "strict";
  pageNotesMaxPages: number;
  pageNotesMaxLinesPerPage: number;
  pageNotesIncludeCriterionCode: boolean;
};

type AppUser = {
  id: string;
  fullName: string;
  email?: string | null;
  role: string;
  isActive: boolean;
};

type AppConfigPayload = {
  id: number;
  activeAuditUserId?: string | null;
  faviconUpdatedAt?: string | null;
  automationPolicy?: AutomationPolicyPayload;
  automationPolicySource?: "default" | "settings";
  activeAuditUser?: AppUser | null;
};

type AutomationPolicyPayload = {
  enabled: boolean;
  providerMode: "openai" | "local" | "hybrid";
  allowBatchGrading: boolean;
  requireOperationReason: boolean;
  updatedAt?: string;
};

type SettingsAuditEvent = {
  id: string;
  ts: string;
  actor: string;
  role: string;
  action: string;
  target: "openai-model" | "grading-config" | "app-config" | "favicon" | "automation-policy" | "turnitin-config";
  changes?: Record<string, unknown>;
};

type SettingsDefaultsPayload = {
  defaults: {
    ai: {
      model: string;
      autoCleanupApproved: boolean;
      allowedModels: string[];
    };
    grading: GradingConfigPayload;
    app: {
      automationPolicy: AutomationPolicyPayload;
    };
  };
};

type SmokeAiResult = {
  ok: boolean;
  status: number;
  keyType: string | null;
  message: string;
  modelAvailable: boolean;
};

type SmokeGradingResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  samplePreview: string;
};

type SmokeResponse = {
  ok: boolean;
  target: "ai" | "grading" | "all";
  checkedAt: string;
  ai?: SmokeAiResult;
  grading?: SmokeGradingResult;
};

type TurnitinSmokeResult = {
  configured: boolean;
  connected: boolean;
  status: number;
  message: string;
  keySource?: string;
  baseUrl?: string;
  checkedAt: string;
};

type TurnitinConfigPayload = {
  source: "default" | "settings";
  enabled: boolean;
  qaOnly: boolean;
  autoSendOnExtract: boolean;
  autoDetectAiWritingOnGrade: boolean;
  baseUrl: string;
  ownerUserId: string;
  viewerUserId: string;
  locale: string;
  integrationName: string;
  integrationVersion: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
  apiKeySource: string;
  updatedAt?: string;
};

type LocalAiSnapshot = {
  enabled: boolean;
  baseUrl: string;
  reachable: boolean;
  status: number;
  message: string;
  textModel: string;
  visionModel: string;
};

export type SettingsScope = "all" | "ai" | "grading" | "app";

const TONE_PREVIEW: Record<"supportive" | "professional" | "strict", string[]> = {
  supportive: [
    "P2 (NOT_ACHIEVED): Add clearer evidence to secure this criterion.",
    "M1 (UNCLEAR): Clarify this section to strengthen evidence.",
  ],
  professional: [
    "P2 (NOT_ACHIEVED): More evidence is required.",
    "M1 (UNCLEAR): Evidence needs clarification.",
  ],
  strict: [
    "P2 (NOT_ACHIEVED): Insufficient evidence; provide explicit criterion evidence.",
    "M1 (UNCLEAR): Evidence unclear; tighten technical clarity.",
  ],
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toLocaleString();
}

function endpointStatusText(value: UsagePayload["usage"] | UsagePayload["costs"]) {
  if (!value) return "Not loaded";
  if (!isEndpointError(value)) return "Available";
  return `Unavailable${value.status ? ` (${value.status})` : ""}`;
}

function endpointMessage(value: UsagePayload["usage"] | UsagePayload["costs"]) {
  if (!value || !isEndpointError(value)) return "";
  return value.message || "";
}

function isEndpointError(value: AnyEndpoint): value is EndpointError {
  return value.available === false;
}

function prettifyChangeKey(raw: string) {
  return raw
    .replace(/From$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function summarizeAuditChanges(changes?: Record<string, unknown>) {
  if (!changes || typeof changes !== "object") return [];
  const keys = Object.keys(changes);
  const seen = new Set<string>();
  const rows: Array<{ label: string; from?: unknown; to?: unknown; value?: unknown }> = [];

  for (const key of keys) {
    if (seen.has(key)) continue;
    if (key.endsWith("From")) {
      const base = key.slice(0, -4);
      const toKey = `${base}To`;
      const label = prettifyChangeKey(base);
      rows.push({ label, from: changes[key], to: changes[toKey] });
      seen.add(key);
      seen.add(toKey);
      continue;
    }
    if (key.endsWith("To") && keys.includes(`${key.slice(0, -2)}From`)) {
      continue;
    }
    rows.push({ label: prettifyChangeKey(key), value: changes[key] });
    seen.add(key);
  }
  return rows;
}

export function AdminSettingsPage({ scope = "all" }: { scope?: SettingsScope }) {
  const pathname = usePathname();
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("");
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [savingModel, setSavingModel] = useState(false);
  const [modelMessage, setModelMessage] = useState<string>("");
  const [autoCleanupApproved, setAutoCleanupApproved] = useState(false);
  const [gradingCfg, setGradingCfg] = useState<GradingConfigPayload | null>(null);
  const [gradingSaving, setGradingSaving] = useState(false);
  const [gradingMsg, setGradingMsg] = useState("");
  const [appCfg, setAppCfg] = useState<AppConfigPayload | null>(null);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [appSaving, setAppSaving] = useState(false);
  const [appMsg, setAppMsg] = useState("");
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [activeSectionHash, setActiveSectionHash] = useState("#ai-usage");
  const [settingsAudit, setSettingsAudit] = useState<SettingsAuditEvent[]>([]);
  const [localAi, setLocalAi] = useState<LocalAiSnapshot | null>(null);
  const [defaults, setDefaults] = useState<SettingsDefaultsPayload["defaults"] | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");
  const [smokeAiBusy, setSmokeAiBusy] = useState(false);
  const [smokeGradingBusy, setSmokeGradingBusy] = useState(false);
  const [smokeTurnitinBusy, setSmokeTurnitinBusy] = useState(false);
  const [smokeAiResult, setSmokeAiResult] = useState<SmokeAiResult | null>(null);
  const [smokeGradingResult, setSmokeGradingResult] = useState<SmokeGradingResult | null>(null);
  const [smokeTurnitinResult, setSmokeTurnitinResult] = useState<TurnitinSmokeResult | null>(null);
  const [smokeCheckedAt, setSmokeCheckedAt] = useState("");
  const [turnitinCfg, setTurnitinCfg] = useState<TurnitinConfigPayload | null>(null);
  const [turnitinApiKeyDraft, setTurnitinApiKeyDraft] = useState("");
  const [turnitinClearApiKey, setTurnitinClearApiKey] = useState(false);
  const [turnitinSaving, setTurnitinSaving] = useState(false);
  const [turnitinMsg, setTurnitinMsg] = useState("");
  const [copiedAuditEventId, setCopiedAuditEventId] = useState<string | null>(null);

  const [baseModel, setBaseModel] = useState("");
  const [baseAutoCleanupApproved, setBaseAutoCleanupApproved] = useState(false);
  const [baseGradingCfgJson, setBaseGradingCfgJson] = useState("");
  const [baseActiveAuditUserId, setBaseActiveAuditUserId] = useState("");
  const [baseAutomationPolicyJson, setBaseAutomationPolicyJson] = useState("");

  const isAll = scope === "all";
  const showAi = scope === "all" || scope === "ai";
  const showGrading = scope === "all" || scope === "grading";
  const showApp = scope === "all" || scope === "app";

  useEffect(() => {
    if (typeof window === "undefined" || !isAll) return;
    const sync = () => setActiveSectionHash(window.location.hash || "#ai-usage");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [isAll]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const appCfgRes = await fetch("/api/admin/app-config", { method: "GET", cache: "no-store" });
      if (appCfgRes.ok) {
        const appCfgJson = (await appCfgRes.json()) as AppConfigPayload;
        setAppCfg(appCfgJson);
        setBaseActiveAuditUserId(String(appCfgJson.activeAuditUserId || ""));
        setBaseAutomationPolicyJson(JSON.stringify(appCfgJson.automationPolicy || {}));
      } else {
        setAppCfg(null);
        setBaseActiveAuditUserId("");
        setBaseAutomationPolicyJson("");
      }

      if (showAi) {
        const res = await fetch("/api/admin/openai-usage", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as UsagePayload;
        setData(json);
        if (json.model) setModel(json.model);

        const [modelRes, devRes] = await Promise.all([
          fetch("/api/admin/openai-model", { method: "GET", cache: "no-store" }),
          fetch("/api/dev/build-info", { method: "GET", cache: "no-store" }),
        ]);

        if (modelRes.ok) {
          const modelJson = (await modelRes.json()) as ModelPayload;
          setAllowedModels(modelJson.allowedModels || []);
          setAutoCleanupApproved(!!modelJson.autoCleanupApproved);
          setBaseAutoCleanupApproved(!!modelJson.autoCleanupApproved);
          setBaseModel(modelJson.model || "");
          if (!json.model && modelJson.model) setModel(modelJson.model);
        } else {
          setAllowedModels([]);
          setAutoCleanupApproved(false);
          setBaseAutoCleanupApproved(false);
          setBaseModel("");
        }

        if (devRes.ok) {
          const devJson = (await devRes.json()) as { localAi?: LocalAiSnapshot };
          setLocalAi(devJson?.localAi || null);
        } else {
          setLocalAi(null);
        }
      } else {
        setData(null);
        setAllowedModels([]);
        setLocalAi(null);
      }

      if (showGrading) {
        const gradingRes = await fetch("/api/admin/grading-config", { method: "GET", cache: "no-store" });
        if (gradingRes.ok) {
          const gradingJson = (await gradingRes.json()) as GradingConfigPayload;
          setGradingCfg(gradingJson);
          setBaseGradingCfgJson(JSON.stringify(gradingJson));
        } else {
          setGradingCfg(null);
          setBaseGradingCfgJson("");
        }
      } else {
        setGradingCfg(null);
        setBaseGradingCfgJson("");
      }

      if (showApp) {
        const [appUsersRes, settingsAuditRes, turnitinRes] = await Promise.all([
          fetch("/api/admin/users", { method: "GET", cache: "no-store" }),
          fetch("/api/admin/settings-audit?take=30", { method: "GET", cache: "no-store" }),
          fetch("/api/admin/turnitin/config", { method: "GET", cache: "no-store" }),
        ]);
        if (appUsersRes.ok) {
          const usersJson = (await appUsersRes.json()) as { users?: AppUser[] };
          setAppUsers(Array.isArray(usersJson.users) ? usersJson.users : []);
        } else {
          setAppUsers([]);
        }
        if (settingsAuditRes.ok) {
          const settingsAuditJson = (await settingsAuditRes.json()) as { events?: SettingsAuditEvent[] };
          setSettingsAudit(Array.isArray(settingsAuditJson.events) ? settingsAuditJson.events : []);
        } else {
          setSettingsAudit([]);
        }
        if (turnitinRes.ok) {
          const turnitinJson = (await turnitinRes.json()) as TurnitinConfigPayload;
          setTurnitinCfg(turnitinJson);
          setTurnitinApiKeyDraft("");
          setTurnitinClearApiKey(false);
        } else {
          setTurnitinCfg(null);
        }
      } else {
        setAppUsers([]);
        setSettingsAudit([]);
        setTurnitinCfg(null);
        setTurnitinApiKeyDraft("");
        setTurnitinClearApiKey(false);
      }

      if (showAi || showGrading || showApp) {
        const defaultsRes = await fetch("/api/admin/settings/defaults", { method: "GET", cache: "no-store" });
        if (defaultsRes.ok) {
          const defaultsJson = (await defaultsRes.json()) as SettingsDefaultsPayload;
          setDefaults(defaultsJson?.defaults || null);
        } else {
          setDefaults(null);
        }
      } else {
        setDefaults(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
      setData(null);
      setLocalAi(null);
      setDefaults(null);
      setTurnitinCfg(null);
      setTurnitinApiKeyDraft("");
      setTurnitinClearApiKey(false);
    } finally {
      setLoading(false);
    }
  }, [showAi, showApp, showGrading]);

  useEffect(() => {
    load();
  }, [load]);

  const windowLabel = useMemo(() => {
    if (!data?.window) return "Last 30 days";
    return `${formatDate(data.window.startTime)} to ${formatDate(data.window.endTime)}`;
  }, [data?.window]);

  const usageTotal = data?.usage && data.usage.available ? formatNumber(data.usage.totalTokens) : "Unavailable";
  const localUsageTotal = data?.localUsage?.available ? formatNumber(data.localUsage.totals.totalTokens) : "Unavailable";
  const effectiveUsageTotal = data?.usage && data.usage.available ? usageTotal : localUsageTotal;
  const usageSource = data?.usage && data.usage.available ? "OpenAI org metrics" : data?.localUsage?.available ? "Local app telemetry" : "No usage data";
  const localEstimatedCost = typeof data?.localUsage?.totals?.estimatedCostUsd === "number" ? data.localUsage.totals.estimatedCostUsd : 0;
  const costTotal =
    data?.costs && data.costs.available
      ? formatMoney(data.costs.amount, data.costs.currency)
      : localEstimatedCost > 0
        ? `${formatMoney(localEstimatedCost, "usd")} (local estimate)`
        : "Unavailable";
  const activeUsersCount = appUsers.filter((u) => u.isActive).length;
  const activeAuditLabel = appCfg?.activeAuditUser?.fullName || "system";
  const activeAuditRole = String(appCfg?.activeAuditUser?.role || "SYSTEM").toUpperCase();
  const canWriteSensitive = ["ADMIN", "OWNER", "SUPERADMIN"].includes(activeAuditRole);
  const aiConnectionLabel = data?.connection?.reachable ? "Connected" : data?.connection ? "Issue" : "Checking";
  const localAiLabel = !localAi
    ? "Unavailable"
    : !localAi.enabled
      ? "Disabled"
      : localAi.reachable
        ? "Reachable"
        : "Unreachable";
  const gradingProfileLabel = gradingCfg
    ? `${gradingCfg.tone}/${gradingCfg.strictness}`
    : "Loading";
  const dirtyAi = model !== baseModel || autoCleanupApproved !== baseAutoCleanupApproved;
  const dirtyGrading = !!gradingCfg && JSON.stringify(gradingCfg) !== baseGradingCfgJson;
  const dirtyApp =
    String(appCfg?.activeAuditUserId || "") !== baseActiveAuditUserId ||
    JSON.stringify(appCfg?.automationPolicy || {}) !== baseAutomationPolicyJson ||
    !!faviconFile;
  const anyDirty = dirtyAi || dirtyGrading || dirtyApp;
  const sectionStatusForAi =
    data?.connection?.reachable && !isEndpointError(data?.usage as AnyEndpoint) ? "Healthy" : "Check endpoints";
  const gradingSchemaStatus = "Ready";
  const currentSectionFromPath =
    pathname?.startsWith("/admin/settings/ai")
      ? "#ai-usage"
      : pathname?.startsWith("/admin/settings/grading")
        ? "#grading-defaults"
        : pathname?.startsWith("/admin/settings/app")
          ? "#app-settings"
          : activeSectionHash;
  const baseGradingCfg = useMemo(() => {
    if (!baseGradingCfgJson) return null;
    try {
      return JSON.parse(baseGradingCfgJson) as GradingConfigPayload;
    } catch {
      return null;
    }
  }, [baseGradingCfgJson]);
  const baseAutomationPolicy = useMemo(() => {
    if (!baseAutomationPolicyJson) return null;
    try {
      return JSON.parse(baseAutomationPolicyJson) as AutomationPolicyPayload;
    } catch {
      return null;
    }
  }, [baseAutomationPolicyJson]);
  const automationEnabled = !!appCfg?.automationPolicy?.enabled;
  const automationControlDisabled = !canWriteSensitive || !automationEnabled;
  const busyAny =
    savingModel ||
    gradingSaving ||
    appSaving ||
    faviconBusy ||
    batchSaving ||
    smokeAiBusy ||
    smokeGradingBusy ||
    smokeTurnitinBusy ||
    turnitinSaving;

  const confirmLeaveIfDirty = useCallback(() => {
    if (!anyDirty) return true;
    if (typeof window === "undefined") return true;
    return window.confirm("You have unsaved settings changes. Leave this page and discard them?");
  }, [anyDirty]);

  const onGuardedLinkClick = useCallback(
    (e: any) => {
      if (!confirmLeaveIfDirty()) e.preventDefault();
    },
    [confirmLeaveIfDirty]
  );

  useEffect(() => {
    if (!anyDirty || typeof window === "undefined") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  const saveModel = useCallback(async () => {
    if (!model) return;
    setSavingModel(true);
    setModelMessage("");
    try {
      const res = await fetch("/api/admin/openai-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, autoCleanupApproved }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save model");
      setModelMessage("Model saved.");
      await load();
    } catch (e) {
      setModelMessage(e instanceof Error ? e.message : "Failed to save model.");
    } finally {
      setSavingModel(false);
    }
  }, [autoCleanupApproved, load, model]);

  const saveGradingConfig = useCallback(async () => {
    if (!gradingCfg) return;
    setGradingSaving(true);
    setGradingMsg("");
    try {
      const res = await fetch("/api/admin/grading-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gradingCfg),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save grading config.");
      setGradingMsg("Grading config saved.");
      await load();
    } catch (e) {
      setGradingMsg(e instanceof Error ? e.message : "Failed to save grading config.");
    } finally {
      setGradingSaving(false);
    }
  }, [gradingCfg, load]);

  const saveAppConfig = useCallback(async () => {
    if (!appCfg) return;
    setAppSaving(true);
    setAppMsg("");
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeAuditUserId: appCfg.activeAuditUserId || null,
          automationPolicy: appCfg.automationPolicy || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save app config.");
      setAppMsg("App settings saved.");
      await load();
    } catch (e) {
      setAppMsg(e instanceof Error ? e.message : "Failed to save app config.");
    } finally {
      setAppSaving(false);
    }
  }, [appCfg, load]);

  const uploadFavicon = useCallback(async () => {
    if (!faviconFile) return;
    setFaviconBusy(true);
    setAppMsg("");
    try {
      const fd = new FormData();
      fd.append("file", faviconFile);
      const res = await fetch("/api/admin/favicon", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to upload favicon.");
      setAppMsg("Favicon uploaded. Hard refresh may be required.");
      setFaviconFile(null);
      await load();
    } catch (e) {
      setAppMsg(e instanceof Error ? e.message : "Failed to upload favicon.");
    } finally {
      setFaviconBusy(false);
    }
  }, [faviconFile, load]);

  const revertAiDraft = useCallback(() => {
    setModel(baseModel || model);
    setAutoCleanupApproved(baseAutoCleanupApproved);
    setModelMessage("AI draft reverted to last loaded values.");
  }, [baseAutoCleanupApproved, baseModel, model]);

  const resetAiToDefaults = useCallback(() => {
    if (!defaults?.ai) return;
    setModel(defaults.ai.model);
    setAutoCleanupApproved(!!defaults.ai.autoCleanupApproved);
    setModelMessage("AI draft reset to defaults.");
  }, [defaults]);

  const revertGradingDraft = useCallback(() => {
    if (!baseGradingCfg) return;
    setGradingCfg(baseGradingCfg);
    setGradingMsg("Grading draft reverted to last loaded values.");
  }, [baseGradingCfg]);

  const resetGradingToDefaults = useCallback(() => {
    if (!defaults?.grading) return;
    setGradingCfg(defaults.grading);
    setGradingMsg("Grading draft reset to defaults.");
  }, [defaults]);

  const revertAppDraft = useCallback(() => {
    setAppCfg((prev) =>
      prev
        ? {
            ...prev,
            activeAuditUserId: baseActiveAuditUserId || null,
            automationPolicy: baseAutomationPolicy || prev.automationPolicy,
          }
        : prev
    );
    setFaviconFile(null);
    setAppMsg("App draft reverted to last loaded values.");
  }, [baseActiveAuditUserId, baseAutomationPolicy]);

  const resetAppToDefaults = useCallback(() => {
    if (!defaults?.app) return;
    setAppCfg((prev) =>
      prev
        ? {
            ...prev,
            activeAuditUserId: null,
            automationPolicy: defaults.app.automationPolicy,
          }
        : prev
    );
    setFaviconFile(null);
    setAppMsg("App draft reset to defaults.");
  }, [defaults]);

  const runAiSmoke = useCallback(async () => {
    setSmokeAiBusy(true);
    setModelMessage("");
    try {
      const res = await fetch("/api/admin/settings/smoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "ai", ai: { model } }),
      });
      const json = (await res.json()) as SmokeResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || "AI smoke test failed.");
      setSmokeAiResult(json.ai || null);
      setSmokeCheckedAt(json.checkedAt || new Date().toISOString());
      setModelMessage(json.ai?.ok ? "AI smoke test passed." : `AI smoke test failed: ${json.ai?.message || "Unknown issue"}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI smoke test failed.";
      setSmokeAiResult({
        ok: false,
        status: 0,
        keyType: null,
        message,
        modelAvailable: false,
      });
      setModelMessage(message);
    } finally {
      setSmokeAiBusy(false);
    }
  }, [model]);

  const runTurnitinSmoke = useCallback(async () => {
    setSmokeTurnitinBusy(true);
    setTurnitinMsg("");
    try {
      const res = await fetch("/api/admin/turnitin/smoke", {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json()) as TurnitinSmokeResult & { error?: string };
      if (!res.ok) throw new Error(json.error || json.message || "Turnitin smoke test failed.");
      setSmokeTurnitinResult({
        configured: !!json.configured,
        connected: !!json.connected,
        status: Number(json.status || 0),
        message: String(json.message || ""),
        keySource: json.keySource,
        baseUrl: json.baseUrl,
        checkedAt: json.checkedAt || new Date().toISOString(),
      });
      setTurnitinMsg(
        json.connected ? "Turnitin smoke test passed." : `Turnitin smoke test failed: ${json.message || "Unknown issue"}`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Turnitin smoke test failed.";
      setSmokeTurnitinResult({
        configured: false,
        connected: false,
        status: 0,
        message,
        checkedAt: new Date().toISOString(),
      });
      setTurnitinMsg(message);
    } finally {
      setSmokeTurnitinBusy(false);
    }
  }, []);

  const runGradingSmoke = useCallback(async () => {
    setSmokeGradingBusy(true);
    setGradingMsg("");
    try {
      const res = await fetch("/api/admin/settings/smoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "grading", grading: gradingCfg || undefined }),
      });
      const json = (await res.json()) as SmokeResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || "Grading smoke test failed.");
      setSmokeGradingResult(json.grading || null);
      setSmokeCheckedAt(json.checkedAt || new Date().toISOString());
      setGradingMsg(json.grading?.ok ? "Grading smoke test passed." : "Grading smoke test found configuration issues.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Grading smoke test failed.";
      setSmokeGradingResult({
        ok: false,
        errors: [message],
        warnings: [],
        samplePreview: "",
      });
      setGradingMsg(message);
    } finally {
      setSmokeGradingBusy(false);
    }
  }, [gradingCfg]);

  const runAllSmoke = useCallback(async () => {
    await runAiSmoke();
    await runTurnitinSmoke();
    await runGradingSmoke();
  }, [runAiSmoke, runGradingSmoke, runTurnitinSmoke]);

  const saveTurnitinConfig = useCallback(async () => {
    if (!canWriteSensitive || !turnitinCfg) return;
    setTurnitinSaving(true);
    setTurnitinMsg("");
    try {
      const res = await fetch("/api/admin/turnitin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: !!turnitinCfg.enabled,
          qaOnly: !!turnitinCfg.qaOnly,
          autoSendOnExtract: !!turnitinCfg.autoSendOnExtract,
          autoDetectAiWritingOnGrade: !!turnitinCfg.autoDetectAiWritingOnGrade,
          baseUrl: turnitinCfg.baseUrl,
          ownerUserId: turnitinCfg.ownerUserId,
          viewerUserId: turnitinCfg.viewerUserId,
          locale: turnitinCfg.locale,
          integrationName: turnitinCfg.integrationName,
          integrationVersion: turnitinCfg.integrationVersion,
          apiKey: turnitinApiKeyDraft,
          clearApiKey: turnitinClearApiKey,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; config?: TurnitinConfigPayload };
      if (!res.ok || !json?.ok || !json?.config) throw new Error(json?.error || "Failed to save Turnitin config.");
      setTurnitinCfg(json.config);
      setTurnitinApiKeyDraft("");
      setTurnitinClearApiKey(false);
      setTurnitinMsg("Turnitin settings saved.");
    } catch (e) {
      setTurnitinMsg(e instanceof Error ? e.message : "Failed to save Turnitin config.");
    } finally {
      setTurnitinSaving(false);
    }
  }, [canWriteSensitive, turnitinCfg, turnitinApiKeyDraft, turnitinClearApiKey]);

  const copyAuditEvent = useCallback(async (evt: SettingsAuditEvent) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(evt, null, 2));
      setCopiedAuditEventId(evt.id);
      window.setTimeout(() => setCopiedAuditEventId(null), 1200);
    } catch {
      // no-op
    }
  }, []);

  const saveAll = useCallback(async () => {
    if (!canWriteSensitive) return;
    if (!anyDirty) return;
    setBatchSaving(true);
    setBatchMsg("");
    try {
      const payload: Record<string, unknown> = {};
      if (dirtyAi) payload.ai = { model, autoCleanupApproved };
      if (dirtyGrading && gradingCfg) payload.grading = gradingCfg;
      if (dirtyApp && appCfg) {
        payload.app = {
          activeAuditUserId: appCfg?.activeAuditUserId || null,
          automationPolicy: appCfg?.automationPolicy || null,
        };
      }

      const res = await fetch("/api/admin/settings/batch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; rollback?: { ok?: boolean } };
      if (!res.ok || !json?.ok) {
        const rollbackMsg = json?.rollback && json.rollback.ok === false ? " Rollback required manual follow-up." : "";
        throw new Error((json?.error || "Batch save failed.") + rollbackMsg);
      }

      if (faviconFile) {
        await uploadFavicon();
      }

      setBatchMsg("All changed settings were saved atomically.");
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Batch save failed.";
      setBatchMsg(message);
    } finally {
      setBatchSaving(false);
    }
  }, [
    anyDirty,
    appCfg,
    autoCleanupApproved,
    canWriteSensitive,
    dirtyAi,
    dirtyApp,
    dirtyGrading,
    faviconFile,
    gradingCfg,
    load,
    model,
    uploadFavicon,
  ]);

  return (
    <div className="mx-auto grid w-full max-w-[1400px] min-w-0 gap-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_0%_0%,#f1f5f9_0%,#ffffff_46%)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-slate-100/80 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-900">
              <TinyIcon name="settings" />
              System Configuration
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Settings Workspace</h1>
            <p className="mt-1 text-sm text-slate-600">AI, grading defaults, and app operations in one clean control panel.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              disabled={loading}
            >
              <TinyIcon name="refresh" className="h-3.5 w-3.5" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              <TinyIcon name="status" className="mr-1 h-3 w-3" />
              {loading ? "Loading..." : "Ready"}
            </span>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-2 text-xs">
          {showAi ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                <span className="text-slate-500">AI connection</span>
                <span className="text-slate-900">{aiConnectionLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                <span className="text-slate-500">Token usage</span>
                <span className="text-slate-900">{effectiveUsageTotal}</span>
              </span>
            </>
          ) : null}
          {showGrading ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
              <span className="text-slate-500">Grading profile</span>
              <span className="text-slate-900">{gradingProfileLabel}</span>
            </span>
          ) : null}
          {showApp ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                <span className="text-slate-500">Active assessor</span>
                <span className="text-slate-900">{activeAuditLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                <span className="text-slate-500">Active users</span>
                <span className="text-slate-900">{activeUsersCount}</span>
              </span>
            </>
          ) : null}
        </div>
      </section>

      <section className="sticky top-2 z-20 rounded-3xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_20px_rgba(15,23,42,0.05)] backdrop-blur">
        <nav aria-label="Settings sections" className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/settings/ai"
            onClick={onGuardedLinkClick}
            aria-current={currentSectionFromPath === "#ai-usage" ? "location" : undefined}
            className={
              "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition-colors " +
              (currentSectionFromPath === "#ai-usage"
                ? "border-slate-400 bg-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")
            }
          >
            AI {dirtyAi ? "•" : ""}
          </Link>
          <Link
            href="/admin/settings/app"
            onClick={onGuardedLinkClick}
            aria-current={currentSectionFromPath === "#app-settings" ? "location" : undefined}
            className={
              "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition-colors " +
              (currentSectionFromPath === "#app-settings"
                ? "border-slate-400 bg-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")
            }
          >
            App {dirtyApp ? "•" : ""}
          </Link>
          <Link
            href="/admin/settings/grading"
            onClick={onGuardedLinkClick}
            aria-current={currentSectionFromPath === "#grading-defaults" ? "location" : undefined}
            className={
              "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition-colors " +
              (currentSectionFromPath === "#grading-defaults"
                ? "border-slate-400 bg-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")
            }
          >
            Grading {dirtyGrading ? "•" : ""}
          </Link>
          <Link
              href="/admin/users"
              onClick={onGuardedLinkClick}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              Users
            </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
              Role: {activeAuditRole}
            </span>
            {showAi ? (
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                AI: {sectionStatusForAi}
              </span>
            ) : null}
            {showGrading ? (
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                Schema: {gradingSchemaStatus}
              </span>
            ) : null}
            {isAll ? (
              <button
                onClick={saveAll}
                disabled={!canWriteSensitive || !anyDirty || busyAny}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {batchSaving ? "Saving..." : "Save all"}
              </button>
            ) : null}
          </div>
        </nav>
        {!canWriteSensitive ? (
          <p className="mt-2 text-xs text-amber-700">
            Read-only mode. Active audit role must be ADMIN/OWNER/SUPERADMIN to change settings.
          </p>
        ) : null}
        {batchMsg ? (
          <p className="mt-2 text-xs text-slate-700">{batchMsg}</p>
        ) : null}
      </section>

      {isAll ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">AI section</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{dirtyAi ? "Unsaved changes" : "In sync"}</div>
            <p className="mt-1 text-xs text-zinc-600">Model, cleanup approval, and endpoint health checks.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Grading section</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{dirtyGrading ? "Unsaved changes" : "In sync"}</div>
            <p className="mt-1 text-xs text-zinc-600">Tone, strictness, feedback template, and page-note defaults.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">App section</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{dirtyApp ? "Unsaved changes" : "In sync"}</div>
            <p className="mt-1 text-xs text-zinc-600">Active audit actor, automation policy, and branding identity.</p>
          </article>
        </section>
      ) : null}

      {showAi ? (
      <>
      <section id="ai-usage" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 scroll-mt-20">
        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-900">
              <TinyIcon name="settings" className="h-3.5 w-3.5" />
            </span>
            OpenAI key
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{data?.configured ? "Configured" : "Not configured"}</div>
          <p className="mt-1 text-sm text-zinc-700">{data?.message || "Environment key loaded."}</p>
          <p className="mt-1 text-xs text-zinc-500">Using {data?.keyType === "admin" ? "admin key" : "standard key"}</p>
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-900">
              <TinyIcon name="ai" className="h-3.5 w-3.5" />
            </span>
            API connection
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">
            {data?.connection?.reachable ? "Connected" : data?.connection ? "Connection issue" : "Checking"}
          </div>
          <p className="mt-1 text-sm text-zinc-700">
            {data?.connection ? `${data.connection.message} (status ${data.connection.status})` : "Probing OpenAI API."}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-900">
              <TinyIcon name="grading" className="h-3.5 w-3.5" />
            </span>
            Token usage
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{effectiveUsageTotal}</div>
          <p className="mt-1 text-sm text-zinc-700">{windowLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">{usageSource}</p>
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-950">
              <TinyIcon name="cost" className="h-3.5 w-3.5" />
            </span>
            Spend / cost
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{costTotal}</div>
          <p className="mt-1 text-sm text-zinc-700">{windowLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {data?.costs && data.costs.available ? "OpenAI org metrics" : localEstimatedCost > 0 ? "Local telemetry estimate" : "No cost data"}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-900">
              <TinyIcon name="local" className="h-3.5 w-3.5" />
            </span>
            Llama / Local AI
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-900">{localAiLabel}</div>
          <p className="mt-1 text-sm text-zinc-700">
            {localAi
              ? `${localAi.message} (status ${localAi.status || 0})`
              : "Only available in development diagnostics."}
          </p>
          <p className="mt-1 text-xs text-zinc-500 break-all">
            {localAi ? `${localAi.baseUrl} · text: ${localAi.textModel} · vision: ${localAi.visionModel}` : "No local endpoint data"}
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Agent model</h2>
            <p className="mt-1 text-sm text-zinc-600">Select which OpenAI model the agent should use.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={runAiSmoke}
              disabled={smokeAiBusy}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
            >
              {smokeAiBusy ? "Testing..." : "Test config"}
            </button>
            <button
              onClick={revertAiDraft}
              disabled={!canWriteSensitive || !dirtyAi}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              Revert
            </button>
            <button
              onClick={resetAiToDefaults}
              disabled={!canWriteSensitive || !defaults?.ai}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              Reset defaults
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!canWriteSensitive}
            className="h-10 min-w-[220px] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            {(allowedModels.length ? allowedModels : ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o", "gpt-5-mini"]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={saveModel}
            disabled={!canWriteSensitive || savingModel || !model}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          >
            {savingModel ? "Saving..." : "Save model"}
          </button>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={autoCleanupApproved}
            onChange={(e) => setAutoCleanupApproved(e.target.checked)}
            disabled={!canWriteSensitive}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Approve automatic OpenAI cleanup for warning tasks
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Current: {data?.model || model || "unknown"} ({data?.modelSource || "env"})
        </p>
        {smokeAiResult ? (
          <div
            className={
              "mt-2 rounded-lg border px-3 py-2 text-xs " +
              (smokeAiResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900")
            }
          >
            <div className="font-semibold">{smokeAiResult.ok ? "AI smoke check passed" : "AI smoke check failed"}</div>
            <div className="mt-1">{smokeAiResult.message}</div>
            <div className="mt-1 text-[11px] opacity-80">
              status {smokeAiResult.status || 0} · key {smokeAiResult.keyType || "none"} · checked{" "}
              {smokeCheckedAt ? new Date(smokeCheckedAt).toLocaleString() : "now"}
            </div>
          </div>
        ) : null}
        {modelMessage ? <p className="mt-1 text-xs text-zinc-600">{modelMessage}</p> : null}
      </section>

      {data?.hints?.needsAdminKeyForOrgMetrics ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-950">Permission note</h2>
          <p className="mt-2 text-sm text-amber-900">
            This key can reach OpenAI, but org-level usage/cost endpoints returned 403. Use an organization admin key for billing metrics.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-zinc-900">Usage breakdown</h2>
        {loading ? <p className="mt-2 text-sm text-zinc-600">Loading usage...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        {!loading && !error && data?.usage?.available ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Requests: {formatNumber(data.usage.requests)}</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Input tokens: {formatNumber(data.usage.inputTokens)}</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Output tokens: {formatNumber(data.usage.outputTokens)}</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Total tokens: {formatNumber(data.usage.totalTokens)}</div>
          </div>
        ) : null}
        {!loading && !error && !(data?.usage && data.usage.available) && data?.localUsage?.available ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Requests: {formatNumber(data.localUsage.totals.requests)}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Input tokens: {formatNumber(data.localUsage.totals.inputTokens)}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Output tokens: {formatNumber(data.localUsage.totals.outputTokens)}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Total tokens: {formatNumber(data.localUsage.totals.totalTokens)}
            </div>
          </div>
        ) : null}
        {!loading && !error && !(data?.usage && data.usage.available) ? (
          <p className="mt-2 text-xs text-zinc-500">Showing local telemetry because org usage scope is unavailable.</p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-zinc-900">Historical usage</h2>
        {!loading && data?.localUsage?.available && data.localUsage.days.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-600">
                  <th className="px-2 py-1 font-semibold">Date</th>
                  <th className="px-2 py-1 font-semibold">Requests</th>
                  <th className="px-2 py-1 font-semibold">Input</th>
                  <th className="px-2 py-1 font-semibold">Output</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...data.localUsage.days].reverse().slice(0, 30).map((day) => (
                  <tr key={day.date} className="border-t border-zinc-200 text-zinc-700">
                    <td className="px-2 py-1">{day.date}</td>
                    <td className="px-2 py-1">{formatNumber(day.requests)}</td>
                    <td className="px-2 py-1">{formatNumber(day.inputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(day.outputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(day.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">
            No local historical entries yet. History populates after OpenAI-backed operations run in this app.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-zinc-900">Recent OpenAI logs</h2>
        {!loading && data?.localUsage?.available && (data.localUsage.recentEvents || []).length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-600">
                  <th className="px-2 py-1 font-semibold">Time</th>
                  <th className="px-2 py-1 font-semibold">Operation</th>
                  <th className="px-2 py-1 font-semibold">Model</th>
                  <th className="px-2 py-1 font-semibold">Input</th>
                  <th className="px-2 py-1 font-semibold">Output</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                  <th className="px-2 py-1 font-semibold">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {(data.localUsage.recentEvents || []).slice(0, 25).map((evt, i) => (
                  <tr key={`${evt.ts}-${evt.op}-${i}`} className="border-t border-zinc-200 text-zinc-700">
                    <td className="px-2 py-1">{new Date(evt.ts * 1000).toLocaleString()}</td>
                    <td className="px-2 py-1">{evt.op}</td>
                    <td className="px-2 py-1">{evt.model}</td>
                    <td className="px-2 py-1">{formatNumber(evt.inputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(evt.outputTokens)}</td>
                    <td className="px-2 py-1">{formatNumber(evt.totalTokens)}</td>
                    <td className="px-2 py-1">{evt.estimatedCostUsd ? formatMoney(evt.estimatedCostUsd, "usd") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">No local OpenAI logs yet.</p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-zinc-900">Endpoint diagnostics</h2>
        <div className="mt-3 grid gap-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <div className="font-medium text-zinc-900">Usage endpoint</div>
            <div className="text-zinc-700">{endpointStatusText(data?.usage)}</div>
            {endpointMessage(data?.usage) ? <div className="text-zinc-600">{endpointMessage(data?.usage)}</div> : null}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <div className="font-medium text-zinc-900">Cost endpoint</div>
            <div className="text-zinc-700">{endpointStatusText(data?.costs)}</div>
            {endpointMessage(data?.costs) ? <div className="text-zinc-600">{endpointMessage(data?.costs)}</div> : null}
          </div>
        </div>
      </section>

      {data?.generatedAt ? <p className="text-xs text-zinc-500">Last updated: {new Date(data.generatedAt).toLocaleString()}</p> : null}
      </>
      ) : null}

      {showGrading ? (
      <>
      <section id="grading-defaults" className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)] scroll-mt-20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Grading defaults</h2>
            <p className="mt-1 text-sm text-zinc-600">Controls default tone/strictness/rubric behavior when tutors run grading.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={runGradingSmoke}
              disabled={smokeGradingBusy}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
            >
              {smokeGradingBusy ? "Testing..." : "Test config"}
            </button>
            <button
              onClick={revertGradingDraft}
              disabled={!canWriteSensitive || !dirtyGrading || !baseGradingCfg}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              Revert
            </button>
            <button
              onClick={resetGradingToDefaults}
              disabled={!canWriteSensitive || !defaults?.grading}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              Reset defaults
            </button>
          </div>
        </div>
        {gradingCfg ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-700">
              Tone
              <select
                value={gradingCfg.tone}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, tone: e.target.value as any } : v))}
                disabled={!canWriteSensitive}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="supportive">Supportive</option>
                <option value="professional">Professional</option>
                <option value="strict">Strict</option>
              </select>
            </label>
            <label className="text-sm text-zinc-700">
              Strictness
              <select
                value={gradingCfg.strictness}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, strictness: e.target.value as any } : v))}
                disabled={!canWriteSensitive}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="lenient">Lenient</option>
                <option value="balanced">Balanced</option>
                <option value="strict">Strict</option>
              </select>
            </label>
            <label className="text-sm text-zinc-700">
              Feedback bullets
              <input
                type="number"
                min={3}
                max={12}
                value={gradingCfg.maxFeedbackBullets}
                onChange={(e) =>
                  setGradingCfg((v) => (v ? { ...v, maxFeedbackBullets: Math.max(3, Math.min(12, Number(e.target.value || 6))) } : v))
                }
                disabled={!canWriteSensitive}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={gradingCfg.useRubricIfAvailable}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, useRubricIfAvailable: e.target.checked } : v))}
                disabled={!canWriteSensitive}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Use rubric when attached to brief
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={gradingCfg.studentSafeMarkedPdf}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, studentSafeMarkedPdf: e.target.checked } : v))}
                disabled={!canWriteSensitive}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Student-safe marked PDF (hide internal grading metadata)
            </label>
            <label className="md:col-span-2 text-sm text-zinc-700">
              Feedback template
              <div className="mt-1 grid gap-2 md:grid-cols-2">
                <label className="text-xs text-zinc-600">
                  Template scope
                  <select
                    value={gradingCfg.feedbackTemplateScope || "active-user"}
                    onChange={(e) =>
                      setGradingCfg((v) =>
                        v
                          ? {
                              ...v,
                              feedbackTemplateScope: e.target.value === "default" ? "default" : "active-user",
                            }
                          : v
                      )
                    }
                    disabled={!canWriteSensitive}
                    className="mt-1 h-9 w-full rounded-xl border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900"
                  >
                    <option value="active-user">Current active user template</option>
                    <option value="default">Global default template</option>
                  </select>
                </label>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600">
                  {gradingCfg.feedbackTemplateScope === "default" ? (
                    <span>
                      Saving as global fallback template (used when no user-specific template exists).
                    </span>
                  ) : (
                    <span>
                      Saving for active user:{" "}
                      <span className="font-semibold text-zinc-800">
                        {appCfg?.activeAuditUser?.fullName || "system"}
                      </span>
                      .
                    </span>
                  )}
                  <div className="mt-1">
                    Personal templates saved: {gradingCfg.feedbackTemplateByUserCount || 0}
                  </div>
                </div>
              </div>
              <textarea
                value={gradingCfg.feedbackTemplate || ""}
                onChange={(e) => setGradingCfg((v) => (v ? { ...v, feedbackTemplate: e.target.value } : v))}
                disabled={!canWriteSensitive}
                rows={9}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Placeholders: {(gradingCfg.feedbackTemplateAllTokens || FEEDBACK_TEMPLATE_ALL_TOKENS).join(", ")}.
                Required: {(gradingCfg.feedbackTemplateRequiredTokens || FEEDBACK_TEMPLATE_REQUIRED_TOKENS).join(" and ")}.
              </div>
            </label>
            <div className="md:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-sm font-semibold text-zinc-900">Small page feedback notes</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={gradingCfg.pageNotesEnabled}
                    onChange={(e) => setGradingCfg((v) => (v ? { ...v, pageNotesEnabled: e.target.checked } : v))}
                    disabled={!canWriteSensitive}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Enable page notes in marked PDF
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={gradingCfg.pageNotesIncludeCriterionCode}
                    onChange={(e) =>
                      setGradingCfg((v) => (v ? { ...v, pageNotesIncludeCriterionCode: e.target.checked } : v))
                    }
                    disabled={!canWriteSensitive}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Include criterion code in note text
                </label>
                <label className="text-sm text-zinc-700">
                  Note tone
                  <select
                    value={gradingCfg.pageNotesTone}
                    onChange={(e) => setGradingCfg((v) => (v ? { ...v, pageNotesTone: e.target.value as any } : v))}
                    disabled={!canWriteSensitive}
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    <option value="supportive">Supportive</option>
                    <option value="professional">Professional</option>
                    <option value="strict">Strict</option>
                  </select>
                </label>
                <label className="text-sm text-zinc-700">
                  Max pages with notes
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={gradingCfg.pageNotesMaxPages}
                    onChange={(e) =>
                      setGradingCfg((v) =>
                        v ? { ...v, pageNotesMaxPages: Math.max(1, Math.min(20, Number(e.target.value || 6))) } : v
                      )
                    }
                    disabled={!canWriteSensitive}
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  />
                </label>
                <label className="text-sm text-zinc-700">
                  Max notes per page
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={gradingCfg.pageNotesMaxLinesPerPage}
                    onChange={(e) =>
                      setGradingCfg((v) =>
                        v
                          ? { ...v, pageNotesMaxLinesPerPage: Math.max(1, Math.min(8, Number(e.target.value || 3))) }
                          : v
                      )
                    }
                    disabled={!canWriteSensitive}
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  />
                </label>
              </div>
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Tone preview</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700">
                    <div className="font-semibold uppercase tracking-wide text-zinc-600">
                      Feedback tone: {gradingCfg.tone}
                    </div>
                    <ul className="mt-1 list-disc pl-4">
                      {TONE_PREVIEW[gradingCfg.tone].map((line, i) => (
                        <li key={`feedback-tone-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700">
                    <div className="font-semibold uppercase tracking-wide text-zinc-600">
                      Page-note tone: {gradingCfg.pageNotesTone}
                    </div>
                    <ul className="mt-1 list-disc pl-4">
                      {TONE_PREVIEW[gradingCfg.pageNotesTone].map((line, i) => (
                        <li key={`page-note-tone-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={saveGradingConfig}
                  disabled={!canWriteSensitive || gradingSaving}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {gradingSaving ? "Saving..." : "Save grading defaults"}
                </button>
              </div>
              {smokeGradingResult ? (
                <div
                  className={
                    "mt-2 rounded-lg border px-3 py-2 text-xs " +
                    (smokeGradingResult.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-rose-200 bg-rose-50 text-rose-900")
                  }
                >
                  <div className="font-semibold">
                    {smokeGradingResult.ok ? "Grading smoke check passed" : "Grading smoke check found issues"}
                  </div>
                  {smokeGradingResult.errors.length ? (
                    <div className="mt-1">
                      Errors: {smokeGradingResult.errors.join(" | ")}
                    </div>
                  ) : null}
                  {smokeGradingResult.warnings.length ? (
                    <div className="mt-1">
                      Warnings: {smokeGradingResult.warnings.join(" | ")}
                    </div>
                  ) : null}
                  {smokeGradingResult.samplePreview ? (
                    <div className="mt-1 rounded border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700">
                      Preview: {smokeGradingResult.samplePreview}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[11px] opacity-80">
                    checked {smokeCheckedAt ? new Date(smokeCheckedAt).toLocaleString() : "now"}
                  </div>
                </div>
              ) : null}
              {gradingMsg ? <p className="mt-2 text-xs text-zinc-600">{gradingMsg}</p> : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">Loading grading settings…</p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-zinc-900">What this affects</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          <li>Tutor-facing tone and strictness defaults on submission grading runs.</li>
          <li>Whether rubric hints are included when a rubric is attached to the locked brief.</li>
          <li>Maximum number of feedback bullets saved into audit output and marked PDF overlay.</li>
          <li>Feedback template used to build feedback text and assessor/date signature blocks.</li>
          <li>Small page-note overlays (enabled, tone, page limits, and criterion-code flag).</li>
          <li>Student-safe marked PDF mode to hide internal metadata from learner-visible exports.</li>
        </ul>
      </section>
      </>
      ) : null}

      {showApp ? (
      <>
      <section id="app-settings" className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)] scroll-mt-20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">App operations & audit ownership</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Controls who is recorded as the audit actor for system actions, plus automation safety rules and branding.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={revertAppDraft}
              disabled={!canWriteSensitive || !dirtyApp}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              Revert
            </button>
            <button
              onClick={resetAppToDefaults}
              disabled={!canWriteSensitive || !defaults?.app}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              Reset defaults
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="text-sm text-zinc-700">
            Audit actor for system actions
            <select
              value={appCfg?.activeAuditUserId || ""}
              onChange={(e) =>
                setAppCfg((v) =>
                  v
                    ? { ...v, activeAuditUserId: e.target.value || null }
                    : v
                )
              }
              disabled={!canWriteSensitive}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            >
              <option value="">System (no active user)</option>
              {appUsers
                .filter((u) => u.isActive)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} {u.role ? `(${u.role})` : ""}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={saveAppConfig}
              disabled={!canWriteSensitive || appSaving || !appCfg}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              {appSaving ? "Saving..." : "Save app settings"}
            </button>
            <Link
              href="/admin/users"
              onClick={onGuardedLinkClick}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Manage users
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-sm font-semibold text-zinc-900">Automation guardrails</div>
          <p className="mt-1 text-xs text-zinc-600">
            These rules control automated grading behavior. Manual grading remains available even when automation is disabled.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!appCfg?.automationPolicy?.enabled}
                onChange={(e) =>
                  setAppCfg((v) =>
                    v
                      ? {
                          ...v,
                          automationPolicy: {
                            enabled: e.target.checked,
                            providerMode: v.automationPolicy?.providerMode || "hybrid",
                            allowBatchGrading: v.automationPolicy?.allowBatchGrading ?? true,
                            requireOperationReason: v.automationPolicy?.requireOperationReason ?? false,
                          },
                        }
                      : v
                  )
                }
                disabled={!canWriteSensitive}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Enable automation queue
            </label>
            <label className="text-sm text-zinc-700">
              Model provider mode
              <select
                value={appCfg?.automationPolicy?.providerMode || "hybrid"}
                onChange={(e) =>
                  setAppCfg((v) =>
                    v
                      ? {
                          ...v,
                          automationPolicy: {
                            enabled: v.automationPolicy?.enabled ?? true,
                            providerMode: e.target.value as "openai" | "local" | "hybrid",
                            allowBatchGrading: v.automationPolicy?.allowBatchGrading ?? true,
                            requireOperationReason: v.automationPolicy?.requireOperationReason ?? false,
                          },
                        }
                      : v
                  )
                }
                disabled={automationControlDisabled}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="hybrid">Hybrid (recommended)</option>
                <option value="openai">OpenAI only</option>
                <option value="local">Local Llama only</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!appCfg?.automationPolicy?.allowBatchGrading}
                onChange={(e) =>
                  setAppCfg((v) =>
                    v
                      ? {
                          ...v,
                          automationPolicy: {
                            enabled: v.automationPolicy?.enabled ?? true,
                            providerMode: v.automationPolicy?.providerMode || "hybrid",
                            allowBatchGrading: e.target.checked,
                            requireOperationReason: v.automationPolicy?.requireOperationReason ?? false,
                          },
                        }
                      : v
                  )
                }
                disabled={automationControlDisabled}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Allow automated batch grading jobs
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!appCfg?.automationPolicy?.requireOperationReason}
                onChange={(e) =>
                  setAppCfg((v) =>
                    v
                      ? {
                          ...v,
                          automationPolicy: {
                            enabled: v.automationPolicy?.enabled ?? true,
                            providerMode: v.automationPolicy?.providerMode || "hybrid",
                            allowBatchGrading: v.automationPolicy?.allowBatchGrading ?? true,
                            requireOperationReason: e.target.checked,
                          },
                        }
                      : v
                  )
                }
                disabled={automationControlDisabled}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Require an operation reason on batch runs
            </label>
          </div>
          {!automationEnabled ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Automation pipeline is disabled. Provider/batch/reason controls are paused until it is re-enabled.
            </div>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">
            Policy source: {appCfg?.automationPolicySource || "default"}.
          </p>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          Audit actor is used when actions run without an explicit logged-in operator.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Need to add or edit users? Use the <span className="font-medium text-zinc-700">Manage users</span> button.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Turnitin (QA)</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Configure Turnitin credentials and behavior for QA submission checks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={runTurnitinSmoke}
              disabled={smokeTurnitinBusy}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-60"
            >
              {smokeTurnitinBusy ? "Testing..." : "Test Turnitin"}
            </button>
            <button
              onClick={saveTurnitinConfig}
              disabled={!canWriteSensitive || !turnitinCfg || turnitinSaving}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              {turnitinSaving ? "Saving..." : "Save Turnitin"}
            </button>
          </div>
        </div>

        {turnitinCfg ? (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!turnitinCfg.enabled}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, enabled: e.target.checked } : v))}
                  disabled={!canWriteSensitive}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Enable Turnitin integration
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!turnitinCfg.qaOnly}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, qaOnly: e.target.checked } : v))}
                  disabled={!canWriteSensitive}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Restrict to QA environments
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!turnitinCfg.autoSendOnExtract}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, autoSendOnExtract: e.target.checked } : v))}
                  disabled={!canWriteSensitive}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Auto-send after extraction
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!turnitinCfg.autoDetectAiWritingOnGrade}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, autoDetectAiWritingOnGrade: e.target.checked } : v))}
                  disabled={!canWriteSensitive}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Auto-refresh AI writing score after grading
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-700">
                Base URL
                <input
                  value={turnitinCfg.baseUrl}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, baseUrl: e.target.value } : v))}
                  disabled={!canWriteSensitive}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  placeholder="https://unicourse201.turnitin.com"
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700">
                Owner user id (EULA account)
                <input
                  value={turnitinCfg.ownerUserId}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, ownerUserId: e.target.value } : v))}
                  disabled={!canWriteSensitive}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  placeholder="rodrigo@unicourse.org"
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700">
                Viewer user id
                <input
                  value={turnitinCfg.viewerUserId}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, viewerUserId: e.target.value } : v))}
                  disabled={!canWriteSensitive}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  placeholder="rodrigo@unicourse.org"
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700">
                Locale
                <input
                  value={turnitinCfg.locale}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, locale: e.target.value } : v))}
                  disabled={!canWriteSensitive}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  placeholder="en-US"
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700">
                Integration name
                <input
                  value={turnitinCfg.integrationName}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, integrationName: e.target.value } : v))}
                  disabled={!canWriteSensitive}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  placeholder="assessor-ai"
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700">
                Integration version
                <input
                  value={turnitinCfg.integrationVersion}
                  onChange={(e) => setTurnitinCfg((v) => (v ? { ...v, integrationVersion: e.target.value } : v))}
                  disabled={!canWriteSensitive}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  placeholder="1.0.0"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-700">
                API key (leave blank to keep current key)
                <input
                  type="password"
                  value={turnitinApiKeyDraft}
                  onChange={(e) => setTurnitinApiKeyDraft(e.target.value)}
                  disabled={!canWriteSensitive}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  placeholder={turnitinCfg.hasApiKey ? `Stored: ${turnitinCfg.apiKeyPreview}` : "Enter Turnitin API key"}
                />
              </label>
              <label className="inline-flex items-center gap-2 self-end text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={turnitinClearApiKey}
                  onChange={(e) => setTurnitinClearApiKey(e.target.checked)}
                  disabled={!canWriteSensitive}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Clear stored API key on save
              </label>
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              Key source: <span className="font-semibold text-zinc-700">{turnitinCfg.apiKeySource || "missing"}</span>{" "}
              · updated {turnitinCfg.updatedAt ? new Date(turnitinCfg.updatedAt).toLocaleString() : "—"}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Turnitin settings are unavailable.</p>
        )}

        {smokeTurnitinResult ? (
          <div
            className={
              "mt-3 rounded-lg border px-3 py-2 text-xs " +
              (smokeTurnitinResult.connected
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900")
            }
          >
            <div className="font-semibold">{smokeTurnitinResult.connected ? "Turnitin smoke check passed" : "Turnitin smoke check failed"}</div>
            <div className="mt-1">{smokeTurnitinResult.message}</div>
            <div className="mt-1 text-[11px] opacity-80">
              status {smokeTurnitinResult.status || 0} · key {smokeTurnitinResult.keySource || "none"} · base{" "}
              {smokeTurnitinResult.baseUrl || "n/a"} · checked{" "}
              {smokeTurnitinResult.checkedAt ? new Date(smokeTurnitinResult.checkedAt).toLocaleString() : "now"}
            </div>
          </div>
        ) : null}
        {turnitinMsg ? <p className="mt-2 text-xs text-zinc-600">{turnitinMsg}</p> : null}
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-zinc-900">Branding: favicon</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Upload an icon used by browser tabs (`/favicon.ico`). Supported: ICO/PNG/SVG (max 2MB).
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".ico,image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml"
            disabled={!canWriteSensitive}
            onChange={(e) => setFaviconFile(e.target.files?.[0] || null)}
            className="block text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border file:border-zinc-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-900 hover:file:bg-zinc-50"
          />
          <button
            onClick={uploadFavicon}
            disabled={!canWriteSensitive || !faviconFile || faviconBusy}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          >
            {faviconBusy ? "Uploading..." : "Upload favicon"}
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          Last updated: {appCfg?.faviconUpdatedAt ? new Date(appCfg.faviconUpdatedAt).toLocaleString() : "Never"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Preview:
          <Image src="/favicon.ico" alt="Current favicon" width={16} height={16} className="ml-2 inline-block align-middle" />
        </p>
        {appMsg ? <p className="mt-2 text-xs text-zinc-600">{appMsg}</p> : null}
      </section>
      </>
      ) : null}

      {isAll && anyDirty ? (
        <section className="sticky bottom-2 z-20 rounded-3xl border border-amber-300 bg-amber-50/95 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-amber-900">
              <span className="font-semibold">Unsaved changes:</span>{" "}
              {[dirtyAi ? "AI" : null, dirtyGrading ? "Grading" : null, dirtyApp ? "App" : null].filter(Boolean).join(", ")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runAllSmoke}
                disabled={busyAny}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
              >
                Test all
              </button>
              <button
                type="button"
                onClick={() => {
                  revertAiDraft();
                  revertGradingDraft();
                  revertAppDraft();
                }}
                disabled={busyAny}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
              >
                Revert all
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={!canWriteSensitive || busyAny}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300 bg-amber-100 px-3 text-xs font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-60"
              >
                {batchSaving ? "Saving..." : "Save all atomically"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showApp ? (
      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-zinc-900">Settings audit trail</h2>
        <p className="mt-1 text-sm text-zinc-600">Recent changes to AI model, grading, app identity, and branding settings.</p>
        {settingsAudit.length ? (
          <div className="mt-3 space-y-2">
            {settingsAudit.map((evt) => (
              <div key={evt.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-zinc-900">
                    {new Date(evt.ts).toLocaleString()} · {evt.action} · {evt.target}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyAuditEvent(evt)}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    {copiedAuditEventId === evt.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="mt-1">
                  Actor: {evt.actor} ({evt.role})
                </div>
                {evt.changes ? (
                  <div className="mt-2 grid gap-1">
                    {summarizeAuditChanges(evt.changes).map((row, idx) => (
                      <div key={`${evt.id}-change-${idx}`} className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] text-zinc-700">
                        <span className="font-semibold text-zinc-800">{row.label}:</span>{" "}
                        {"from" in row ? (
                          <>
                            <span className="rounded bg-zinc-100 px-1">{String(row.from ?? "null")}</span>{" "}
                            {"->"}{" "}
                            <span className="rounded bg-zinc-100 px-1">{String(row.to ?? "null")}</span>
                          </>
                        ) : (
                          <span className="rounded bg-zinc-100 px-1">{String(row.value ?? "null")}</span>
                        )}
                      </div>
                    ))}
                    <details className="rounded-md border border-zinc-200 bg-white p-2">
                      <summary className="cursor-pointer text-[11px] font-semibold text-zinc-700">Raw payload</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-zinc-600">
                        {JSON.stringify(evt.changes, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">No settings changes logged yet.</p>
        )}
      </section>
      ) : null}
    </div>
  );
}

export default function AdminSettingsPageRoute() {
  return <AdminSettingsPage scope="ai" />;
}
