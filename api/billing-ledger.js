/**
 * Chamber Protocol - Financial & Billing Ledger Engine
 * Implements:
 * 1. 50/30/20 Protocol Revenue Split (Founder 50%, Fuel 30%, Growth 20%)
 * 2. Tiered Affiliate Referral (Pro 15%, Free 7% based on actual paid net amount)
 * 3. 100% Inflow Sponsorship Products (Can of Meat $5, Genesis Patron $20)
 * 4. Genesis License Keys & Direct Pro Upgrades
 */

const fs = require("fs/promises");
const path = require("path");

const LEDGER_STORE_PATH = process.env.CHAMBER_BILLING_STORE_PATH ||
  "/home/ubuntu/agent-data/projects/metashield-protocol/memory/billing-ledger.json";

// Standard Genesis Activation Keys
const GENESIS_KEYS = new Set([
  "CHAMBER-GENESIS-2026",
  "CHAMBER-VIP-LEOPARD",
  "CHAMBER-PATRON-10USD",
  "LEOPARD-CAT-PRO-EARLY",
  "CHAMBER-FOUNDER-PASS",
]);

async function ensureLedger() {
  await fs.mkdir(path.dirname(LEDGER_STORE_PATH), { recursive: true });
  try {
    await fs.access(LEDGER_STORE_PATH);
  } catch {
    const initialData = {
      version: 1,
      treasury: {
        founderPool: 0.0, // 50%
        fuelPool: 10.0,    // Initial $10 starting balance!
        growthPool: 0.0,  // 20% + 100% sponsorships
        totalGrossRevenue: 0.0,
        totalNetRevenue: 0.0,
      },
      accounts: {},
      transactions: [],
      sponsorships: [],
    };
    await fs.writeFile(LEDGER_STORE_PATH, JSON.stringify(initialData, null, 2), "utf8");
  }
}

async function readLedger() {
  await ensureLedger();
  try {
    const raw = await fs.readFile(LEDGER_STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[BillingLedger] Read error:", err);
    return {
      version: 1,
      treasury: { founderPool: 0, fuelPool: 10, growthPool: 0, totalGrossRevenue: 0, totalNetRevenue: 0 },
      accounts: {},
      transactions: [],
      sponsorships: [],
    };
  }
}

async function writeLedger(ledger) {
  await fs.mkdir(path.dirname(LEDGER_STORE_PATH), { recursive: true });
  await fs.writeFile(LEDGER_STORE_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

function normalizeAlias(alias) {
  if (!alias) return "";
  return String(alias).trim().toLowerCase().replace(/^@/, "");
}

/**
 * Ensures an account entry exists in the ledger
 */
function getOrCreateAccount(ledger, alias) {
  const norm = normalizeAlias(alias);
  if (!norm) return null;
  if (!ledger.accounts[norm]) {
    ledger.accounts[norm] = {
      alias: norm,
      isPro: false,
      tier: "free_genesis",
      proExpiresAt: null,
      referrerAlias: null,
      referralsCount: 0,
      commissionsEarned: 0.0,
      commissionsUnpaid: 0.0,
      sponsorshipTotal: 0.0,
      badges: [],
      createdAt: new Date().toISOString(),
    };
  }
  return ledger.accounts[norm];
}

/**
 * Checks if an account currently has active Pro status
 */
async function checkIsPro(alias) {
  const norm = normalizeAlias(alias);
  if (!norm) return false;
  const ledger = await readLedger();
  const acc = ledger.accounts[norm];
  if (!acc || !acc.isPro) return false;
  if (!acc.proExpiresAt) return true; // Lifetime Pro
  return new Date(acc.proExpiresAt).getTime() > Date.now();
}

/**
 * Gets billing and referral status for an alias
 */
async function getAccountBillingStatus(alias) {
  const norm = normalizeAlias(alias);
  const ledger = await readLedger();
  const acc = norm ? ledger.accounts[norm] || {
    alias: norm,
    isPro: false,
    tier: "free_genesis",
    proExpiresAt: null,
    referrerAlias: null,
    referralsCount: 0,
    commissionsEarned: 0.0,
    commissionsUnpaid: 0.0,
    sponsorshipTotal: 0.0,
    badges: [],
  } : null;

  const isPro = acc ? (acc.isPro && (!acc.proExpiresAt || new Date(acc.proExpiresAt).getTime() > Date.now())) : false;

  return {
    alias: norm,
    isPro,
    tier: isPro ? (acc.tier || "pro") : "free_genesis",
    proExpiresAt: acc?.proExpiresAt || null,
    referrerAlias: acc?.referrerAlias || null,
    referralsCount: acc?.referralsCount || 0,
    commissionsEarned: Number((acc?.commissionsEarned || 0).toFixed(2)),
    commissionsUnpaid: Number((acc?.commissionsUnpaid || 0).toFixed(2)),
    sponsorshipTotal: Number((acc?.sponsorshipTotal || 0).toFixed(2)),
    badges: acc?.badges || [],
    referralCommissionRate: isPro ? 0.15 : 0.07, // 15% for Pro, 7% for Free
    referralLink: norm ? `https://studio.milkcat.org/echo/${norm}/all?ref=${norm}` : null,
    treasuryStats: {
      fuelPoolDays: Math.floor((ledger.treasury.fuelPool || 10) * 180), // Rough days calculation
      growthPoolAvailable: Number((ledger.treasury.growthPool || 0).toFixed(2)),
    },
  };
}

/**
 * Binds a referrer to an account if not already bound
 */
async function bindReferrer(alias, referrerAlias) {
  const user = normalizeAlias(alias);
  const ref = normalizeAlias(referrerAlias);
  if (!user || !ref || user === ref) return false;

  const ledger = await readLedger();
  const acc = getOrCreateAccount(ledger, user);
  if (acc.referrerAlias) return false; // Already bound

  acc.referrerAlias = ref;
  const refAcc = getOrCreateAccount(ledger, ref);
  refAcc.referralsCount = (refAcc.referralsCount || 0) + 1;

  await writeLedger(ledger);
  return true;
}

/**
 * Processes a Pro subscription payment using the 50/30/20 split and Tiered Affiliate Commission
 */
async function processProPayment({ alias, grossAmount = 2.99, durationDays = 30, plan = "pro_monthly", referrerAlias = null, paymentMethod = "stripe" }) {
  const norm = normalizeAlias(alias);
  if (!norm) throw new Error("Alias is required");

  const ledger = await readLedger();
  const acc = getOrCreateAccount(ledger, norm);

  // Bind referrer if provided and not yet bound
  if (referrerAlias && !acc.referrerAlias && normalizeAlias(referrerAlias) !== norm) {
    acc.referrerAlias = normalizeAlias(referrerAlias);
    const refAcc = getOrCreateAccount(ledger, acc.referrerAlias);
    refAcc.referralsCount = (refAcc.referralsCount || 0) + 1;
  }

  // Calculate Net Revenue after gateway fee (~2.9% + $0.30)
  const gatewayFee = Number((grossAmount * 0.029 + 0.30).toFixed(2));
  const netAmount = Math.max(0, Number((grossAmount - gatewayFee).toFixed(2)));

  // 50 / 30 / 20 Macro Allocation
  const founderAmount = Number((netAmount * 0.50).toFixed(2));
  const fuelAmount = Number((netAmount * 0.30).toFixed(2));
  let growthAmount = Number((netAmount * 0.20).toFixed(2));

  // Affiliate Commission Calculation (Paid strictly from the 20% Growth Pool)
  let affiliateCommission = 0.0;
  let activeReferrer = acc.referrerAlias;

  if (activeReferrer && ledger.accounts[activeReferrer]) {
    const refAcc = ledger.accounts[activeReferrer];
    const isRefPro = refAcc.isPro && (!refAcc.proExpiresAt || new Date(refAcc.proExpiresAt).getTime() > Date.now());
    const rate = isRefPro ? 0.15 : 0.07; // 15% if referrer is Pro, 7% if Free
    affiliateCommission = Number((netAmount * rate).toFixed(2));

    refAcc.commissionsEarned = Number(((refAcc.commissionsEarned || 0) + affiliateCommission).toFixed(2));
    refAcc.commissionsUnpaid = Number(((refAcc.commissionsUnpaid || 0) + affiliateCommission).toFixed(2));
  }

  // The remaining growth pool stays in the treasury
  const netGrowthPoolInflow = Math.max(0, Number((growthAmount - affiliateCommission).toFixed(2)));

  // Update Treasury Pools
  ledger.treasury.founderPool = Number(((ledger.treasury.founderPool || 0) + founderAmount).toFixed(2));
  ledger.treasury.fuelPool = Number(((ledger.treasury.fuelPool || 0) + fuelAmount).toFixed(2));
  ledger.treasury.growthPool = Number(((ledger.treasury.growthPool || 0) + netGrowthPoolInflow).toFixed(2));
  ledger.treasury.totalGrossRevenue = Number(((ledger.treasury.totalGrossRevenue || 0) + grossAmount).toFixed(2));
  ledger.treasury.totalNetRevenue = Number(((ledger.treasury.totalNetRevenue || 0) + netAmount).toFixed(2));

  // Update Account Pro Expiry
  const currentExpiry = acc.proExpiresAt && new Date(acc.proExpiresAt).getTime() > Date.now()
    ? new Date(acc.proExpiresAt).getTime()
    : Date.now();
  const newExpiry = new Date(currentExpiry + durationDays * 24 * 60 * 60 * 1000).toISOString();

  acc.isPro = true;
  acc.tier = "pro";
  acc.proExpiresAt = newExpiry;
  if (!acc.badges.includes("pro_creator")) {
    acc.badges.push("pro_creator");
  }

  // Record Transaction
  const tx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "subscription",
    alias: norm,
    grossAmount,
    gatewayFee,
    netAmount,
    splits: {
      founderAmount,
      fuelAmount,
      growthAmount,
      affiliateCommission,
      netGrowthPoolInflow,
    },
    referrerAlias: activeReferrer || null,
    plan,
    paymentMethod,
    timestamp: new Date().toISOString(),
  };
  ledger.transactions.unshift(tx);

  await writeLedger(ledger);
  return { success: true, isPro: true, proExpiresAt: newExpiry, tx };
}

/**
 * Applies a Genesis License Key to unlock Pro for free / early bird
 */
async function applyGenesisLicense({ alias, licenseKey }) {
  const norm = normalizeAlias(alias);
  if (!norm) throw new Error("Alias is required");
  const key = String(licenseKey || "").trim().toUpperCase();

  if (!GENESIS_KEYS.has(key)) {
    throw new Error("無效或已過期的創世激活碼 (Invalid Genesis Key)");
  }

  const ledger = await readLedger();
  const acc = getOrCreateAccount(ledger, norm);

  // Grant 90 days Pro
  const currentExpiry = acc.proExpiresAt && new Date(acc.proExpiresAt).getTime() > Date.now()
    ? new Date(acc.proExpiresAt).getTime()
    : Date.now();
  const newExpiry = new Date(currentExpiry + 90 * 24 * 60 * 60 * 1000).toISOString();

  acc.isPro = true;
  acc.tier = "pro";
  acc.proExpiresAt = newExpiry;
  if (!acc.badges.includes("genesis_creator")) {
    acc.badges.push("genesis_creator");
  }
  if (!acc.badges.includes("pro_creator")) {
    acc.badges.push("pro_creator");
  }

  ledger.transactions.unshift({
    id: `tx_genesis_${Date.now()}`,
    type: "genesis_key",
    alias: norm,
    licenseKey: key,
    durationDays: 90,
    timestamp: new Date().toISOString(),
  });

  await writeLedger(ledger);
  return { success: true, isPro: true, proExpiresAt: newExpiry, message: "🎉 創世激活碼兌換成功！已解鎖 90 天 Chamber Pro 尊榮特權與石虎神獸！" };
}

/**
 * Processes a 100% Inflow Sponsorship Product
 * (e.g. $5 Leopard Cat Food Can, $20 Genesis Patron)
 */
async function processSponsorship({ alias, itemType = "can_5", amount = 5.0, message = "", paymentMethod = "stripe" }) {
  const norm = normalizeAlias(alias);
  const ledger = await readLedger();
  const acc = norm ? getOrCreateAccount(ledger, norm) : null;

  const grossAmount = Number(amount);
  const gatewayFee = Number((grossAmount * 0.029 + 0.30).toFixed(2));
  const netAmount = Math.max(0, Number((grossAmount - gatewayFee).toFixed(2)));

  // 100% of Net Revenue flows directly into Growth Pool!
  ledger.treasury.growthPool = Number(((ledger.treasury.growthPool || 0) + netAmount).toFixed(2));
  ledger.treasury.totalGrossRevenue = Number(((ledger.treasury.totalGrossRevenue || 0) + grossAmount).toFixed(2));
  ledger.treasury.totalNetRevenue = Number(((ledger.treasury.totalNetRevenue || 0) + netAmount).toFixed(2));

  // Badges and stats
  if (acc) {
    acc.sponsorshipTotal = Number(((acc.sponsorshipTotal || 0) + grossAmount).toFixed(2));
    if (grossAmount >= 20 && !acc.badges.includes("genesis_patron")) {
      acc.badges.push("genesis_patron"); // 🏆 創世守護者
    } else if (grossAmount >= 5 && !acc.badges.includes("cat_feeder")) {
      acc.badges.push("cat_feeder"); // 🐾 榮譽鏟屎官
    }
  }

  const record = {
    id: `sp_${Date.now()}`,
    alias: norm || "anonymous",
    itemType,
    grossAmount,
    netAmount,
    message,
    paymentMethod,
    timestamp: new Date().toISOString(),
  };
  ledger.sponsorships.unshift(record);

  await writeLedger(ledger);
  return { success: true, netAmount, sponsorship: record };
}

/**
 * Payout or redeem affiliate commission
 */
async function claimAffiliateCommission({ alias, redeemAsPro = false, payoutAddress = "" }) {
  const norm = normalizeAlias(alias);
  if (!norm) throw new Error("Alias is required");

  const ledger = await readLedger();
  const acc = getOrCreateAccount(ledger, norm);
  const unpaid = acc.commissionsUnpaid || 0;

  if (unpaid <= 0) {
    throw new Error("目前沒有可提領的分潤餘額");
  }

  if (redeemAsPro) {
    // 1:1 redeem for Pro subscription ($2.99 / 30 days = ~$0.10/day)
    const daysGranted = Math.floor((unpaid / 2.99) * 30);
    if (daysGranted < 1) {
      throw new Error("分潤餘額不足以兌換 1 天 Pro (需至少 $0.10)");
    }
    const currentExpiry = acc.proExpiresAt && new Date(acc.proExpiresAt).getTime() > Date.now()
      ? new Date(acc.proExpiresAt).getTime()
      : Date.now();
    const newExpiry = new Date(currentExpiry + daysGranted * 24 * 60 * 60 * 1000).toISOString();

    acc.isPro = true;
    acc.tier = "pro";
    acc.proExpiresAt = newExpiry;
    acc.commissionsUnpaid = 0.0;

    await writeLedger(ledger);
    return { success: true, redeemedDays: daysGranted, proExpiresAt: newExpiry, message: `🎉 成功使用 $${unpaid.toFixed(2)} 分潤兌換 ${daysGranted} 天 Chamber Pro！` };
  }

  // Cash withdrawal requires minimum $10 threshold
  if (unpaid < 10.0) {
    throw new Error(`提領門檻為 $10.00 美元（目前累積: $${unpaid.toFixed(2)}）。您也可以選擇直接 1:1 折抵 Pro 訂閱天數。`);
  }

  acc.commissionsUnpaid = 0.0;
  ledger.transactions.unshift({
    id: `payout_${Date.now()}`,
    type: "affiliate_payout",
    alias: norm,
    amount: unpaid,
    payoutAddress,
    timestamp: new Date().toISOString(),
  });

  await writeLedger(ledger);
  return { success: true, payoutAmount: unpaid, message: `✅ 已送出 $${unpaid.toFixed(2)} 美元提領申請至 ${payoutAddress}，預計 1-2 個工作天入帳。` };
}

/**
 * Public dashboard of the Growth & Sponsorship Pool
 */
async function getGrowthPoolStats() {
  const ledger = await readLedger();
  return {
    growthPoolBalance: Number((ledger.treasury.growthPool || 0).toFixed(2)),
    fuelPoolBalance: Number((ledger.treasury.fuelPool || 10).toFixed(2)),
    recentSponsors: (ledger.sponsorships || []).slice(0, 10).map(s => ({
      alias: s.alias,
      itemType: s.itemType,
      amount: s.grossAmount,
      message: s.message,
      timestamp: s.timestamp,
    })),
  };
}

module.exports = {
  checkIsPro,
  getAccountBillingStatus,
  bindReferrer,
  processProPayment,
  applyGenesisLicense,
  processSponsorship,
  claimAffiliateCommission,
  getGrowthPoolStats,
};
