/**
 * Chamber Protocol - Backup API Server
 * Port 3011
 *
 * Acts as a custodian: receives post data from the Chrome extension,
 * uploads to Arweave via Irys Turbo (free for <100KB), returns real TxID.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const {
  getRegistry,
  resolveIdentity,
  registerIdentity,
  transferIdentity,
  checkAliasAvailability,
  normalizeAlias,
  normalizePlatform,
  normalizeActorType,
  platformSlug,
  stableContentKey,
} = require("./identity-registry");

const app = express();
const PORT = 3011;
const PATH_PREFIX = "/chamber-api"; // Nginx proxy path

app.use(
  cors({
    origin: [
      /https:\/\/(www\.)?facebook\.com/,
      "https://studio.milkcat.org",
      "http://localhost:3010",
    ],
    methods: ["POST", "GET", "OPTIONS"],
  })
);
app.use(express.json({ limit: "200kb" }));

// Mount router on /chamber-api prefix (Nginx does NOT strip prefix)
const router = express.Router();

// ── Config ──
const PROTOCOL_VERSION = "0.1.4";
const APP_NAME = "Chamber";
const PRIVATE_KEY = process.env.CHAMBER_WALLET_PRIVATE_KEY;
const WALLET_ADDRESS = process.env.CHAMBER_WALLET_ADDRESS;

if (!PRIVATE_KEY || !WALLET_ADDRESS) {
  console.error("❌ Missing CHAMBER_WALLET_PRIVATE_KEY or CHAMBER_WALLET_ADDRESS in .env");
  process.exit(1);
}

// ── Lazy-load Irys to avoid startup crash if not installed yet ──
let irysInstance = null;
async function getIrys() {
  if (irysInstance) return irysInstance;
  const { default: Irys } = await import("@irys/sdk");
  irysInstance = new Irys({
    network: "devnet",
    token: "ethereum",
    key: PRIVATE_KEY,
    config: {
      providerUrl: "https://rpc.ankr.com/eth_sepolia",
    },
  });
  console.log("✅ Irys SDK initialized (devnet). Wallet:", WALLET_ADDRESS);
  return irysInstance;
}

// ── Hash FB user ID for privacy ──
function hashFbUserId(fbUserId) {
  return crypto
    .createHmac("sha256", process.env.CHAMBER_HASH_SECRET || "chamber-protocol-v1")
    .update(String(fbUserId))
    .digest("hex")
    .substring(0, 32);
}

// ── Health check ──
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Chamber Protocol Backup API",
    version: PROTOCOL_VERSION,
    wallet: WALLET_ADDRESS,
  });
});

// ── Identity registry and alias mapping endpoints ──
router.get("/identity", async (req, res) => {
  try {
    const store = await getRegistry();
    res.json({ success: true, updatedAt: store.updatedAt, identities: store.identities, aliases: store.aliases });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to read registry" });
  }
});

router.get("/identity/resolve", async (req, res) => {
  try {
    const alias = normalizeAlias(req.query.alias || req.query.id);
    if (!alias) {
      return res.status(400).json({ error: "alias is required" });
    }
    const platform = req.query.platform ? normalizePlatform(req.query.platform) : "";
    const identity = await resolveIdentity({ alias, platform: platform || undefined });
    if (!identity) {
      return res.status(404).json({ error: "identity not found" });
    }
    return res.json({
      success: true,
      alias: identity.alias,
      platform: identity.platform,
      platformSlug: identity.platform_slug,
      actorType: identity.actor_type,
      actorId: identity.actor_id,
      displayName: identity.display_name,
      currentWallet: identity.current_wallet,
      contentKey: identity.content_key,
      canonicalUrl: identity.canonical_url,
      bindingStatus: identity.binding_status,
      bindingVersion: identity.binding_version,
      bindingHistory: identity.binding_history || [],
      transferHistory: identity.transfer_history || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to resolve identity" });
  }
});

router.get("/identity/check", async (req, res) => {
  try {
    const alias = normalizeAlias(req.query.alias || req.query.id);
    if (!alias) {
      return res.status(400).json({ error: "alias is required" });
    }
    const result = await checkAliasAvailability({
      alias,
      walletAddress: req.query.walletAddress || req.query.wallet || "",
    });
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to check alias" });
  }
});

router.post("/identity/register", async (req, res) => {
  try {
    const identity = await registerIdentity(req.body || {});
    return res.json({ success: true, identity });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to register identity" });
  }
});

router.post("/identity/transfer", async (req, res) => {
  try {
    const identity = await transferIdentity(req.body || {});
    return res.json({ success: true, identity });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to transfer identity" });
  }
});

// ── POST /backup — main upload endpoint ──
router.post("/backup", async (req, res) => {
  try {
    const { fbUserId, content, platform, mediaUrls, privacy, timestamp, isDebug, sourceUrl, boundWallet, identityAlias, identityActorType, identityActorId, identityDisplayName } = req.body;
    const isDebugMode = isDebug === true || isDebug === "true";

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "content is required" });
    }

    // Hash FB user ID for on-chain storage (privacy protection)
    const fbUserIdHash = fbUserId ? hashFbUserId(fbUserId) : "anonymous";
    const normalizedAlias = identityAlias ? normalizeAlias(identityAlias) : "";
    const normalizedPlatform = normalizePlatform(platform || "facebook");
    const normalizedActorType = normalizeActorType(identityActorType || "personal");
    const identityContentKey = normalizedAlias
      ? stableContentKey({
          identityAlias: normalizedAlias,
          fbUserIdHash,
          platform: normalizedPlatform,
          actorType: normalizedActorType,
          actorId: identityActorId || fbUserId || "default",
        })
      : fbUserIdHash;
    const canonicalUrl = normalizedAlias
      ? `https://studio.milkcat.org/echo/${normalizedAlias}/${platformSlug(normalizedPlatform)}`
      : `https://studio.milkcat.org/echo/${fbUserIdHash}/all`;

    if (normalizedAlias && boundWallet) {
      await registerIdentity({
        alias: normalizedAlias,
        platform: normalizedPlatform,
        actorType: normalizedActorType,
        actorId: identityActorId || fbUserId || "default",
        displayName: identityDisplayName || normalizedAlias,
        walletAddress: boundWallet,
        fbUserIdHash,
        proof: req.body.identityProof || "",
      });
    }

    // Build Arweave payload
    const payload = {
      protocol_version: PROTOCOL_VERSION,
      app_name: APP_NAME,
      fb_user_id_hash: fbUserIdHash,
      identity_alias: normalizedAlias || null,
      identity_key: identityContentKey,
      author_wallet: boundWallet || "CUSTODIAL", // store active wallet address (custodial or custom)
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      platform: platform || "facebook",
      content: content.substring(0, 50000), // 50KB text cap
      media: {
        urls: (mediaUrls || []).slice(0, 10), // max 10 media refs
      },
      privacy: privacy || "PUBLIC",
      is_debug: isDebugMode,
      source_url: sourceUrl || null,
    };

    const jsonStr = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(jsonStr, "utf8");

    console.log(`📦 Backup request: ${sizeBytes} bytes, fb_hash=${fbUserIdHash}`);

    // Irys Turbo: free for <100KB
    let txId;
    if (sizeBytes < 100 * 1024) {
      const irys = await getIrys();
      const tags = [
        { name: "Content-Type", value: "application/json" },
        { name: "App-Name", value: APP_NAME },
        { name: "Protocol-Version", value: PROTOCOL_VERSION },
        { name: "FB-User-Hash", value: fbUserIdHash },
        { name: "Platform", value: platform || "facebook" },
        { name: "Unix-Time", value: String(payload.timestamp) },
        { name: "Is-Debug", value: String(isDebugMode) },
      ];
      if (boundWallet) {
        tags.push({ name: "Author-Wallet", value: boundWallet });
      }
      if (normalizedAlias) {
        tags.push({ name: "Identity-Alias", value: normalizedAlias });
        tags.push({ name: "Identity-Key", value: identityContentKey });
      }

      const receipt = await irys.upload(jsonStr, { tags });
      txId = receipt.id;
      console.log(`✅ Uploaded to Arweave. TxID: ${txId}`);
    } else {
      return res.status(413).json({ error: "Content too large (>100KB)" });
    }

    return res.json({
      success: true,
      txId,
      arweaveUrl: `https://devnet.irys.xyz/${txId}`,
      echoUrl: canonicalUrl,
      fbUserIdHash,
      identityAlias: normalizedAlias || null,
      identityKey: identityContentKey,
      canonicalUrl,
      sizeBytes,
    });
  } catch (err) {
    console.error("❌ Backup failed:", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

router.get("/posts/:fbUserIdHash", async (req, res) => {
  try {
    const { fbUserIdHash } = req.params;
    const { platform, limit = 20, debug } = req.query;
    const showDebug = debug === "true";

    const gqlQuery = {
      query: `{
        transactions(
          tags: [
            { name: "App-Name", values: ["${APP_NAME}"] }
            { name: "FB-User-Hash", values: ["${fbUserIdHash}"] }
            ${platform ? `{ name: "Platform", values: ["${platform}"] }` : ""}
          ]
          first: ${Math.min(Number(limit), 50)}
          order: DESC
        ) {
          edges {
            node {
              id
              tags { name value }
            }
          }
        }
      }`,
    };

    const response = await fetch("https://devnet.irys.xyz/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gqlQuery),
    });

    const data = await response.json();
    const edges = data?.data?.transactions?.edges || [];

    let postsList = edges.map((e) => {
      const tagsMap = Object.fromEntries(e.node.tags.map((t) => [t.name, t.value]));
      return {
        txId: e.node.id,
        arweaveUrl: `https://devnet.irys.xyz/${e.node.id}`,
        tags: tagsMap,
        blockTime: e.node.block?.timestamp ? Number(e.node.block.timestamp) : (tagsMap["Unix-Time"] ? Number(tagsMap["Unix-Time"]) : null),
      };
    });

    // In-memory filter out debug posts unless showDebug is toggled
    postsList = postsList.filter(p => showDebug || p.tags["Is-Debug"] !== "true");

    return res.json({
      success: true,
      fbUserIdHash,
      count: postsList.length,
      posts: postsList,
    });
  } catch (err) {
    console.error("❌ Posts query failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Mount router and start ──
app.use(PATH_PREFIX, router);
// Also handle direct local access without prefix
app.use("/", router);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Chamber Backup API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Backup: POST http://localhost:${PORT}/backup`);
});
