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
const fs = require("fs/promises");
const path = require("path");
const {
  getRegistry,
  resolveIdentity,
  registerIdentity,
  findActorBinding,
  transferIdentity,
  checkAliasAvailability,
  normalizeAlias,
  normalizePlatform,
  normalizeActorType,
  platformSlug,
  stableContentKey,
} = require("./identity-registry");
const {
  createAccessRequest,
  listOwnerRequests,
  decideAccessRequest,
  findGrant,
  registerOwnerCapabilityHash,
  verifyOwnerCapability,
} = require("./access-store");
const {
  beginRegistration,
  finishRegistration,
  cancelRegistration,
  beginAuthentication,
  finishAuthentication,
  rotateVaultRecord,
} = require("./recovery-vault");
const { createPairingSession, claimPairingSession, getPairingSessionStatus } = require("./pairing");

const app = express();
const PORT = 3011;
const PATH_PREFIX = "/chamber-api"; // Nginx proxy path

app.use(
  cors({
    origin: [
      /https:\/\/(www\.)?facebook\.com/,
      "https://studio.milkcat.org",
      "http://localhost:3010",
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
    ],
    methods: ["POST", "GET", "OPTIONS"],
  })
);
app.use(express.json({ limit: "12mb" }));

// Mount router on /chamber-api prefix (Nginx does NOT strip prefix)
const router = express.Router();

const DEV_ERROR_LOG_PATH = process.env.CHAMBER_DEV_ERROR_LOG_PATH ||
  "/home/ubuntu/agent-data/projects/metashield-protocol/memory/dev-errors.ndjson";
const BACKUP_RECEIPT_LOG_PATH = process.env.CHAMBER_BACKUP_RECEIPT_LOG_PATH ||
  "/home/ubuntu/agent-data/projects/metashield-protocol/memory/backup-receipts.ndjson";

// Development diagnostics. Kept in the AgentOS data layer, not the code repo.
router.post("/dev-errors", async (req, res) => {
  try {
    const event = req.body || {};
    const record = {
      source: String(event.source || "unknown").slice(0, 120),
      message: String(event.message || "Unknown error").slice(0, 2000),
      stack: String(event.stack || "").slice(0, 6000),
      url: String(event.url || "").slice(0, 1000),
      extensionVersion: String(event.extensionVersion || "").slice(0, 40),
      timestamp: event.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      details: event.details && typeof event.details === "object" ? event.details : {},
    };
    await fs.mkdir(path.dirname(DEV_ERROR_LOG_PATH), { recursive: true });
    await fs.appendFile(DEV_ERROR_LOG_PATH, JSON.stringify(record) + "\n", "utf8");
    return res.status(202).json({ success: true });
  } catch (err) {
    console.error("❌ Failed to record development error:", err);
    return res.status(500).json({ error: "Failed to record development error" });
  }
});

// ── Config ──
const PROTOCOL_VERSION = "0.2.0";
const APP_NAME = "Chamber";
const PRIVATE_KEY = process.env.CHAMBER_WALLET_PRIVATE_KEY;
const WALLET_ADDRESS = process.env.CHAMBER_WALLET_ADDRESS;

if (!PRIVATE_KEY || !WALLET_ADDRESS) {
  console.error("❌ Missing CHAMBER_WALLET_PRIVATE_KEY or CHAMBER_WALLET_ADDRESS in .env");
  process.exit(1);
}

// ── Lazy-load Irys to avoid startup crash if not installed yet ──
const irysInstances = new Map();
const MAINNET_ENABLED = process.env.CHAMBER_MAINNET_ENABLED === "true";
const MAINNET_RPC_URL = process.env.CHAMBER_MAINNET_RPC_URL || "https://rpc.ankr.com/eth";

async function getIrys(network) {
  if (network === "mainnet" && !MAINNET_ENABLED) {
    throw new Error("正式網尚未由伺服器啟用；目前請保持 Debug 測試網模式");
  }
  if (irysInstances.has(network)) return irysInstances.get(network);
  const { default: Irys } = await import("@irys/sdk");
  const irys = new Irys({
    network,
    token: "ethereum",
    key: PRIVATE_KEY,
    config: {
      providerUrl: network === "mainnet" ? MAINNET_RPC_URL : "https://rpc.ankr.com/eth_sepolia",
    },
  });
  irysInstances.set(network, irys);
  console.log(`✅ Irys SDK initialized (${network}). Wallet:`, WALLET_ADDRESS);
  return irys;
}

// ── Hash FB user ID for privacy ──
function hashFbUserId(fbUserId) {
  return crypto
    .createHmac("sha256", process.env.CHAMBER_HASH_SECRET || "chamber-protocol-v1")
    .update(String(fbUserId))
    .digest("hex")
    .substring(0, 32);
}

function isValidFacebookPostUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return false;
    if (url.searchParams.has("comment_id") || url.searchParams.has("reply_comment_id")) return false;
    const route = url.pathname.replace(/\/+$/, "").toLowerCase();
    const videoId = url.searchParams.get("v") || "";
    return route.includes("/posts/") || route.includes("/permalink") ||
      route.includes("/photos/") || route.includes("/media/set") ||
      route.includes("/videos/") || route.includes("/reel/") ||
      /^\/share\/(?:v|r|p)\/[^/]+/i.test(route) ||
      (route === "/watch" && url.searchParams.has("v")) ||
      (route === "/video.php" && url.searchParams.has("v")) ||
      url.searchParams.has("story_fbid") || url.searchParams.has("fbid") ||
      url.searchParams.has("set") || /^[0-9]{6,}$/.test(videoId);
  } catch (_) {
    return false;
  }
}

function isValidThreadsPostUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (!["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(host)) return false;
    return /^\/@[^/]+\/post\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function canonicalSourceIdentity(value) {
  try {
    const url = new URL(String(value || ""));
    const params = ["story_fbid", "fbid", "set", "v"]
      .filter((key) => url.searchParams.has(key))
      .map((key) => `${key}=${url.searchParams.get(key)}`)
      .join("&");
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "").toLowerCase()}${params ? `?${params}` : ""}`;
  } catch (_) {
    return String(value || "");
  }
}

// ── Health check ──
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Chamber Protocol Backup API",
    version: PROTOCOL_VERSION,
    defaultNetwork: "devnet",
    mainnetEnabled: MAINNET_ENABLED,
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

router.get("/identity/by-actor", async (req, res) => {
  try {
    const actorId = String(req.query.actorId || "").trim();
    const platform = normalizePlatform(req.query.platform || "facebook");
    if (!actorId) {
      return res.status(400).json({ error: "actorId is required" });
    }

    const store = await getRegistry();
    const slug = platformSlug(platform);
    for (const root of Object.values(store.identities || {})) {
      const binding = root.platform_bindings?.[slug];
      if (binding && String(binding.actor_id) === actorId) {
        return res.json({
          success: true,
          alias: root.alias,
          displayName: binding.display_name || root.display_name,
          platform,
          actorType: binding.actor_type,
          actorId: binding.actor_id,
          currentWallet: binding.wallet_address || root.current_wallet || null,
          canonicalUrl: `https://studio.milkcat.org${root.canonical_url_base}/${slug}`,
        });
      }
    }
    return res.status(404).json({ error: "identity not found" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to find identity" });
  }
});

router.get("/identity/binding", async (req, res) => {
  try {
    const actorId = String(req.query.actorId || "").trim();
    if (!actorId) return res.status(400).json({ error: "actorId is required" });
    const binding = await findActorBinding(await getRegistry(), {
      platform: req.query.platform || "facebook",
      actorType: req.query.actorType || "personal",
      actorId,
    });
    return res.json({ success: true, bound: Boolean(binding), binding: binding ? {
      alias: binding.alias,
      platform: binding.platform,
      actorType: binding.actorType,
      actorId: binding.actorId,
      walletAddress: binding.binding.wallet_address || null,
    } : null });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to inspect binding" });
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
    return res.status(["IDENTITY_ALREADY_BOUND", "OWNERSHIP_TRANSFER_REQUIRED"].includes(err.code) ? 409 : 400).json({
      error: err.message || "Failed to register identity",
      code: err.code || "IDENTITY_REGISTER_FAILED",
      boundAlias: err.boundAlias || null,
    });
  }
});

router.post("/identity/transfer", async (req, res) => {
  try {
    const identity = await transferIdentity(req.body || {});
    return res.json({ success: true, identity });
  } catch (err) {
    return res.status(err.code === "OWNERSHIP_TRANSFER_NOT_READY" ? 501 : 400).json({
      error: err.message || "Failed to transfer identity",
      code: err.code || "IDENTITY_TRANSFER_FAILED",
    });
  }
});

// ── Private Echo reading requests ──
// Request routing lives off-chain to avoid publishing rejected requests and
// the owner's social graph. Only an approved encrypted key envelope is kept.
router.post("/access/requests", async (req, res) => {
  try {
    const request = await createAccessRequest(req.body || {});
    return res.status(request.status === "pending" ? 202 : 200).json({ success: true, request });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to create reading request", code: error.code || "ACCESS_REQUEST_FAILED" });
  }
});

router.get("/access/requests", async (req, res) => {
  try {
    const ownerIdentityKey = String(req.query.ownerIdentityKey || "").trim();
    if (!ownerIdentityKey) return res.status(400).json({ error: "ownerIdentityKey is required" });
    await verifyOwnerCapability(ownerIdentityKey, String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
    const requests = await listOwnerRequests(ownerIdentityKey);
    return res.json({ success: true, requests });
  } catch (error) {
    return res.status(/authorization/i.test(error.message || "") ? 401 : 500).json({ error: error.message || "Failed to list reading requests" });
  }
});

router.post("/access/requests/:id/decision", async (req, res) => {
  try {
    const ownerIdentityKey = String(req.body?.ownerIdentityKey || "").trim();
    await verifyOwnerCapability(ownerIdentityKey, String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
    const request = await decideAccessRequest(req.params.id, ownerIdentityKey, req.body?.decision, req.body?.recipientKeyEnvelope || null);
    return res.json({ success: true, request });
  } catch (error) {
    return res.status(/not found/i.test(error.message || "") ? 404 : 400).json({ error: error.message || "Failed to update reading request" });
  }
});

router.get("/access/grants", async (req, res) => {
  try {
    const postTxId = String(req.query.postTxId || "").trim();
    const requesterKeyId = String(req.query.requesterKeyId || "").trim();
    if (!postTxId || !requesterKeyId) return res.status(400).json({ error: "postTxId and requesterKeyId are required" });
    const grant = await findGrant(postTxId, requesterKeyId);
    if (!grant) return res.status(404).json({ error: "reading grant not found" });
    return res.json({ success: true, grant: { requestId: grant.id, postTxId: grant.postTxId, recipientKeyEnvelope: grant.recipientKeyEnvelope, decidedAt: grant.decidedAt } });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to resolve reading grant" });
  }
});

// ── Recovery Vault ──
// Share B is encrypted at rest and protected by a WebAuthn passkey. The
// offline code C contains only share C plus the opaque Vault account ID.
router.post("/recovery/passkey/register/options", async (req, res) => {
  try {
    const registration = await beginRegistration(req.body?.shareB);
    console.info(`[Recovery] Passkey registration options issued (${registration.accountId.slice(-8)})`);
    return res.status(201).json({ success: true, registration });
  } catch (error) {
    console.error("[Recovery] Passkey registration options failed:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to begin passkey registration" });
  }
});

router.post("/recovery/passkey/register/verify", async (req, res) => {
  try {
    const registration = await finishRegistration(req.body?.accountId, req.body?.setupToken, req.body?.response);
    console.info(`[Recovery] Passkey registration verified (${registration.accountId.slice(-8)})`);
    return res.json({ success: true, registration });
  } catch (error) {
    console.error("[Recovery] Passkey registration verify failed:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to verify passkey registration" });
  }
});

router.post("/recovery/passkey/register/cancel", async (req, res) => {
  try {
    return res.json({ success: true, registration: await cancelRegistration(req.body?.accountId, req.body?.setupToken) });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to cancel passkey registration" });
  }
});

router.post("/recovery/passkey/authenticate/options", async (req, res) => {
  try {
    return res.json({ success: true, authentication: await beginAuthentication(req.body?.accountId) });
  } catch (error) {
    return res.status(404).json({ error: error.message || "Failed to begin passkey authentication" });
  }
});

router.post("/recovery/passkey/authenticate/verify", async (req, res) => {
  try {
    return res.json({ success: true, authentication: await finishAuthentication(req.body?.accountId, req.body?.response) });
  } catch (error) {
    return res.status(401).json({ error: error.message || "Failed to verify passkey authentication" });
  }
});

router.post("/recovery/vault/rotate", async (req, res) => {
  try {
    return res.json({ success: true, vault: await rotateVaultRecord(req.body?.accountId, req.body?.sessionToken, req.body?.shareB) });
  } catch (error) {
    return res.status(/session/i.test(error.message || "") ? 401 : 400).json({ error: error.message || "Failed to rotate Recovery Vault record" });
  }
});

// ── Mobile QR Pairing Ephemeral Session Store ──
router.post("/recovery/pair/create", async (req, res) => {
  try {
    const session = createPairingSession(req.body || {});
    console.info(`[Pairing] Created QR pairing session (${session.pairingId})`);
    return res.status(201).json({ success: true, session });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to create pairing session" });
  }
});

router.post("/recovery/pair/claim", async (req, res) => {
  try {
    const payload = claimPairingSession(req.body?.pairingId, req.body?.deviceModel);
    console.info(`[Pairing] Claimed QR pairing session (${req.body?.pairingId}) for device: ${payload.deviceModel}`);
    return res.json({ success: true, payload });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to claim pairing session" });
  }
});

router.get("/recovery/pair/status", (req, res) => {
  const pairingId = req.query.pairingId;
  if (!pairingId) return res.status(400).json({ error: "Missing pairingId" });
  const status = getPairingSessionStatus(pairingId);
  return res.json({ success: true, status });
});

// ── POST /backup — main upload endpoint ──
router.post("/backup", async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const { extensionVersion, fbUserId, content, platform, mediaUrls, mediaItems, mediaMeta, isEncrypted, encryptionVersion, keyEnvelope, accessCapabilityHash, privacy, timestamp, publishedAt, authorName, authorUrl, isDebug, network: requestedNetwork, sourceUrl, boundWallet, identityAlias, identityActorType, identityActorId, identityDisplayName } = req.body;
    const isDebugMode = isDebug === true || isDebug === "true";
    const network = requestedNetwork === "mainnet" ? "mainnet" : "devnet";
    if (network === "mainnet" && !MAINNET_ENABLED) {
      return res.status(503).json({
        error: "正式網尚未由伺服器啟用；目前請保持 Debug 測試網模式",
        network,
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "content is required" });
    }

    const requestedPlatform = normalizePlatform(platform || "facebook");
    if (requestedPlatform === "facebook" && !isValidFacebookPostUrl(sourceUrl)) {
      return res.status(400).json({ error: "Facebook sourceUrl must be a valid post permalink", code: "SOURCE_URL_REQUIRED" });
    }
    if (requestedPlatform === "threads" && !isValidThreadsPostUrl(sourceUrl)) {
      return res.status(400).json({ error: "Threads sourceUrl must be a valid post permalink", code: "SOURCE_URL_REQUIRED" });
    }

    // Hash FB user ID for on-chain storage (privacy protection)
    const fbUserIdHash = fbUserId ? hashFbUserId(fbUserId) : "anonymous";
    const normalizedAlias = identityAlias ? normalizeAlias(identityAlias) : "";
    const normalizedPlatform = normalizePlatform(platform || "facebook");
    const normalizedActorType = normalizeActorType(identityActorType || "personal");
    const logicalSourceId = crypto.createHash("sha256").update(canonicalSourceIdentity(sourceUrl)).digest("hex").slice(0, 32);
    const videoDetected = mediaMeta?.videoDetected === true;
    const videoBackupStatus = videoDetected
      ? (mediaMeta?.videoFullBackupComplete === true
          ? "complete"
          : mediaMeta?.videoFileAttempted === true
            ? "file_attempted"
            : ((mediaUrls || []).length ? "poster_only" : "link_only"))
      : null;
    let identityContentKey = normalizedAlias
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

    if (encryptionVersion === "post-key-v2") {
      await registerOwnerCapabilityHash(identityContentKey, accessCapabilityHash);
    }

    if (normalizedAlias && boundWallet) {
      const registeredIdentity = await registerIdentity({
        alias: normalizedAlias,
        platform: normalizedPlatform,
        actorType: normalizedActorType,
        actorId: identityActorId || fbUserId || "default",
        displayName: identityDisplayName || normalizedAlias,
        walletAddress: boundWallet,
        fbUserIdHash,
        proof: req.body.identityProof || "",
      });
      // Keep backup tags aligned with the key returned by identity resolve.
      // Otherwise the upload succeeds but Echo queries a different key.
      identityContentKey = registeredIdentity.content_key || identityContentKey;
    }

    // Build Arweave payload
    const payload = {
      protocol_version: PROTOCOL_VERSION,
      extension_version: extensionVersion || null,
      app_name: APP_NAME,
      fb_user_id_hash: fbUserIdHash,
      identity_alias: normalizedAlias || null,
      identity_key: identityContentKey,
      author_wallet: boundWallet || "CUSTODIAL", // store active wallet address (custodial or custom)
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      published_at: publishedAt || timestamp || null,
      source_author: authorName ? { name: authorName, url: authorUrl || null } : null,
      platform: platform || "facebook",
      content: content.substring(0, 50000), // 50KB text cap
      is_encrypted: isEncrypted === true,
      encryption_version: encryptionVersion || (isEncrypted === true ? "local-extension-v1" : null),
      key_envelope: keyEnvelope || null,
      media: {
        urls: (mediaUrls || []), // Keep every captured media reference; payload size is validated below.
        items: Array.isArray(mediaItems) ? mediaItems : [],
        primary_fb_cdn: (mediaUrls || [])[0] || "",
        fallback_backup: (mediaUrls || [])[0] || "",
        album: mediaMeta?.album === true,
        album_complete: mediaMeta?.albumComplete !== false,
        album_loaded_count: Number(mediaMeta?.albumLoadedCount || (mediaUrls || []).length),
        album_expected_count: mediaMeta?.albumExpectedCount ? Number(mediaMeta.albumExpectedCount) : null,
        album_source_url: mediaMeta?.albumSourceUrl || sourceUrl || null,
        video: videoDetected,
        video_source_type: mediaMeta?.videoSourceType || null,
        video_backup_status: videoBackupStatus,
        video_source_url: videoDetected ? (sourceUrl || null) : null,
      },
      privacy: privacy || "PUBLIC",
      is_debug: isDebugMode,
      source_url: sourceUrl || null,
      logical_source_id: logicalSourceId,
      network,
      backup_timestamp: Math.floor(Date.now() / 1000),
    };

    const jsonStr = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(jsonStr, "utf8");

    console.log(`📦 Backup request ${requestId}: ${sizeBytes} bytes, fb_hash=${fbUserIdHash}, media=${payload.media.urls.length}, published_at=${payload.published_at || "unknown"}`);

    // Irys Turbo: free for <100KB
    let txId;
    if (sizeBytes < 100 * 1024) {
      const irys = await getIrys(network);
      const tags = [
        { name: "Content-Type", value: "application/json" },
        { name: "App-Name", value: APP_NAME },
        { name: "Protocol-Version", value: PROTOCOL_VERSION },
        { name: "FB-User-Hash", value: fbUserIdHash },
        { name: "Platform", value: platform || "facebook" },
        { name: "Unix-Time", value: String(payload.timestamp) },
        { name: "Is-Debug", value: String(isDebugMode) },
        { name: "Irys-Network", value: network },
        { name: "Backup-Time", value: String(payload.backup_timestamp) },
        { name: "Logical-Source-ID", value: logicalSourceId },
      ];
      if (videoDetected) {
        tags.push({ name: "Media-Kind", value: "video" });
        tags.push({ name: "Video-Backup-Status", value: videoBackupStatus || "link_only" });
      }
      if (boundWallet) {
        tags.push({ name: "Author-Wallet", value: boundWallet });
      }
      if (normalizedAlias) {
        tags.push({ name: "Identity-Alias", value: normalizedAlias });
        tags.push({ name: "Identity-Key", value: identityContentKey });
      }

      const receipt = await irys.upload(jsonStr, { tags });
      txId = receipt.id;
      console.log(`✅ Uploaded to Arweave. request=${requestId} TxID: ${txId}`);
    } else {
      return res.status(413).json({ error: "Content too large (>100KB)" });
    }

    const echoQuery = new URLSearchParams({ post: txId });
    if (network === "mainnet") echoQuery.set("network", "mainnet");
    const echoUrl = `${canonicalUrl}?${echoQuery.toString()}`;
    const response = {
      success: true,
      requestId,
      txId,
      arweaveUrl: network === "mainnet" ? `https://arweave.net/${txId}` : `https://devnet.irys.xyz/${txId}`,
      echoUrl,
      network,
      fbUserIdHash,
      identityAlias: normalizedAlias || null,
      identityKey: identityContentKey,
      canonicalUrl,
      sizeBytes,
    };
    await fs.mkdir(path.dirname(BACKUP_RECEIPT_LOG_PATH), { recursive: true });
    await fs.appendFile(BACKUP_RECEIPT_LOG_PATH, JSON.stringify({
      requestId,
      txId,
      extensionVersion: extensionVersion || null,
      protocolVersion: PROTOCOL_VERSION,
      network,
      fbUserIdHash,
      identityKey: identityContentKey,
      echoUrl,
      sourceUrl: sourceUrl || null,
      contentLength: content.length,
      mediaCount: payload.media.urls.length,
      timestamp: payload.timestamp,
      publishedAt: payload.published_at,
      backupTimestamp: payload.backup_timestamp,
      createdAt: new Date().toISOString()
    }) + "\n", "utf8");
    return res.json(response);
  } catch (err) {
    console.error(`❌ Backup failed request=${requestId}:`, err);
    return res.status(500).json({ error: err.message || "Upload failed", requestId });
  }
});

// Upload media as its own immutable Irys transaction, then reference it from
// the post JSON. This avoids storing expiring Facebook CDN URLs in Echo.
router.post("/media", async (req, res) => {
  try {
    const { data, contentType = "application/octet-stream", isEncrypted = false, isDebug, network: requestedNetwork } = req.body || {};
    const network = requestedNetwork === "mainnet" ? "mainnet" : "devnet";
    const isDebugMode = isDebug === true || isDebug === "true";
    if (!data || typeof data !== "string") {
      return res.status(400).json({ error: "media data is required" });
    }
    // Encrypted media is intentionally uploaded as opaque bytes. Its original
    // MIME type is kept in the encrypted media item inside the post payload,
    // while the standalone Irys transaction is tagged as octet-stream.
    const isSupportedPlainMedia = /^image\/(jpeg|png|gif|webp)|^video\//i.test(contentType);
    if (!isSupportedPlainMedia && !(isEncrypted === true || isEncrypted === "true")) {
      return res.status(415).json({ error: "unsupported media type" });
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "media must be between 1 byte and 8MB" });
    }
    const irys = await getIrys(network);
    const receipt = await irys.upload(buffer, {
      tags: [
        { name: "Content-Type", value: isEncrypted ? "application/octet-stream" : contentType },
        { name: "App-Name", value: APP_NAME },
        { name: "Irys-Network", value: network },
        { name: "Is-Debug", value: String(isDebugMode) },
        { name: "Is-Encrypted", value: String(isEncrypted === true || isEncrypted === "true") },
      ],
    });
    const url = network === "mainnet"
      ? `https://arweave.net/${receipt.id}`
      : `https://devnet.irys.xyz/${receipt.id}`;
    console.log(`🖼️ Media uploaded (${network}) tx=${receipt.id} size=${buffer.length}`);
    return res.json({ success: true, txId: receipt.id, url, network, sizeBytes: buffer.length });
  } catch (err) {
    console.error("❌ Media upload failed:", err);
    const insufficientBalance = /not enough balance|\b402\b/i.test(err.message || "");
    return res.status(insufficientBalance ? 402 : 500).json({
      error: insufficientBalance ? "Irys storage balance is insufficient" : (err.message || "Media upload failed"),
      code: insufficientBalance ? "IRYS_INSUFFICIENT_BALANCE" : "MEDIA_UPLOAD_FAILED"
    });
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
