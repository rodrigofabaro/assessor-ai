#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] || "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (typeof process.env[key] === "undefined" || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function loadDotEnvChain() {
  const cwd = process.cwd();
  // Keep precedence close to Next.js local behavior for developer sessions.
  const files = [".env", ".env.local"];
  for (const f of files) loadDotEnvFile(path.join(cwd, f));
}

function pickKey() {
  const candidates = [
    ["OPENAI_ADMIN_KEY", process.env.OPENAI_ADMIN_KEY],
    ["OPENAI_ADMIN_API_KEY", process.env.OPENAI_ADMIN_API_KEY],
    ["OPENAI_ADMIN", process.env.OPENAI_ADMIN],
    ["OPENAI_API_KEY", process.env.OPENAI_API_KEY],
  ];
  const found = candidates.find(([, v]) => String(v || "").trim());
  if (!found) return { name: "", key: "" };
  return { name: found[0], key: String(found[1] || "").trim().replace(/^['"]|['"]$/g, "") };
}

function toNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.+-]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function extractCost(payload) {
  let amount = 0;
  let currency = "usd";
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node.amount && typeof node.amount === "object" && !Array.isArray(node.amount)) {
      const v = toNum(node.amount.value);
      if (v) amount += v;
      if (typeof node.amount.currency === "string" && node.amount.currency.trim()) {
        currency = node.amount.currency.toLowerCase();
      }
    }
    amount +=
      toNum(node.amount_value) +
      toNum(node.cost) +
      toNum(node.total_cost) +
      toNum(node.total_amount);
    for (const v of Object.values(node)) visit(v);
  };
  visit(payload);
  return { amount, currency };
}

async function main() {
  loadDotEnvChain();
  const { name, key } = pickKey();
  if (!key) {
    console.error("No OpenAI key found in env (OPENAI_ADMIN_KEY / OPENAI_API_KEY).");
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const start = now - 30 * 24 * 60 * 60;
  const qp = new URLSearchParams({
    start_time: String(start),
    end_time: String(now),
    bucket_width: "1d",
    limit: "30",
  });

  const orgId = String(process.env.OPENAI_ORG_ID || "").trim();
  const call = async (useOrgHeader) => {
    const headers = { Authorization: `Bearer ${key}` };
    if (useOrgHeader && orgId) headers["OpenAI-Organization"] = orgId;
    const res = await fetch(`https://api.openai.com/v1/organization/costs?${qp.toString()}`, {
      method: "GET",
      headers,
    });
    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { res, raw, json };
  };

  console.log(`Key source: ${name}`);
  console.log(`Key fingerprint: ${key.slice(0, 6)}...${key.slice(-4)}`);
  console.log(`Org header: ${orgId ? orgId : "(none)"}`);

  const first = await call(true);
  const firstDerived = extractCost(first.json || {});
  console.log(`\n[with org header] status=${first.res.status}`);
  console.log(`Derived total cost: ${firstDerived.amount} ${firstDerived.currency}`);
  console.log(`Body preview: ${String(first.raw || "").slice(0, 500)}`);

  if (orgId) {
    const second = await call(false);
    const secondDerived = extractCost(second.json || {});
    console.log(`\n[without org header] status=${second.res.status}`);
    console.log(`Derived total cost: ${secondDerived.amount} ${secondDerived.currency}`);
    console.log(`Body preview: ${String(second.raw || "").slice(0, 500)}`);
  }
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
