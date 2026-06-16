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
const PROTOCOL_VERSION = "2026-v1";
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

// ── POST /backup — main upload endpoint ──
router.post("/backup", async (req, res) => {
  try {
    const { fbUserId, content, platform, mediaUrls, privacy, timestamp, isDebug, sourceUrl } = req.body;
    const isDebugMode = isDebug === true || isDebug === "true";

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "content is required" });
    }

    // Hash FB user ID for on-chain storage (privacy protection)
    const fbUserIdHash = fbUserId ? hashFbUserId(fbUserId) : "anonymous";

    // Build Arweave payload
    const payload = {
      protocol_version: PROTOCOL_VERSION,
      app_name: APP_NAME,
      fb_user_id_hash: fbUserIdHash,
      author_wallet: "CUSTODIAL", // custodial mode — user hasn't bound a wallet yet
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
      echoUrl: `https://studio.milkcat.org/echo/${fbUserIdHash}/all`,
      fbUserIdHash,
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
