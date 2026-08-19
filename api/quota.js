/**
 * Chamber Protocol - Monthly Quota Manager
 * Enforces monthly free tier quota (30 posts/month) across all profiles of a user.
 */

const fs = require("fs/promises");
const path = require("path");

const STORE_PATH = process.env.CHAMBER_QUOTA_STORE_PATH ||
  "/home/ubuntu/agent-data/projects/metashield-protocol/memory/quota-usage.json";

const DEFAULT_FREE_QUOTA = 30;

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return nextMonth.toISOString();
}

async function ensureStore() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify({ version: 1, months: {} }, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { version: 1, months: {} };
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

const { checkIsPro } = require("./billing-ledger");

/**
 * Normalizes the quota entity key (fbUserIdHash, actorId, or clientId)
 */
function normalizeKey(key) {
  if (!key) return "anonymous";
  return String(key).trim().toLowerCase();
}

async function getQuota(entityKey, tier = "free_genesis", alias = null) {
  const normKey = normalizeKey(entityKey);
  const month = getCurrentMonth();
  const store = await readStore();
  const monthData = store.months?.[month] || {};
  const used = Number(monthData[normKey] || 0);

  let activeTier = tier;
  if (alias && await checkIsPro(alias)) {
    activeTier = "pro";
  }

  const limit = activeTier === "pro" ? 1000 : DEFAULT_FREE_QUOTA;

  return {
    month,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    tier: activeTier,
    resetsAt: getNextResetDate(),
  };
}

async function checkAndConsumeQuota(entityKey, tier = "free_genesis", alias = null) {
  const normKey = normalizeKey(entityKey);
  const month = getCurrentMonth();
  const store = await readStore();
  store.months = store.months || {};
  store.months[month] = store.months[month] || {};

  let activeTier = tier;
  if (alias && await checkIsPro(alias)) {
    activeTier = "pro";
  }

  const used = Number(store.months[month][normKey] || 0);
  const limit = activeTier === "pro" ? 1000 : DEFAULT_FREE_QUOTA;

  if (used >= limit) {
    const err = new Error(`本月免費上鏈額度（${limit} 篇）已用完，額度將於下個月 1 號自動重置。`);
    err.code = "QUOTA_EXCEEDED";
    err.details = { month, used, limit, remaining: 0, resetsAt: getNextResetDate() };
    throw err;
  }

  store.months[month][normKey] = used + 1;
  await writeStore(store);

  return {
    month,
    used: used + 1,
    limit,
    remaining: Math.max(0, limit - (used + 1)),
    tier,
    resetsAt: getNextResetDate(),
  };
}

module.exports = {
  getQuota,
  checkAndConsumeQuota,
  DEFAULT_FREE_QUOTA,
};
