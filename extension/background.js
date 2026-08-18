/**
 * background.js - Chamber Protocol Extension Background Service Worker
 * 
 * Handles local wallet configurations, cryptographic symmetric encryption (AES-GCM),
 * browser cache loading of media, off-chain backup uploads (Imgur/R2), and Irys Arweave publishing.
 */

// Schema Constant
const PROTOCOL_VERSION = "0.2.0";
const APP_NAME = "Chamber";
importScripts("i18n.js", "mvp-validation.js", "secret-sharing.js");
ChamberI18n.init(null).catch(() => {});
const t = (key, variables) => ChamberI18n.t(key, variables);

function validationMessage(validation, payload) {
  if (validation?.code === "SOURCE_URL_REQUIRED") {
    const platform = String(payload?.platform || "facebook").toLowerCase() === "threads" ? "Threads" : "Facebook";
    return t("validation.SOURCE_URL_REQUIRED_PLATFORM", { platform });
  }
  const key = validation?.code === "AUTHOR_NOT_CONFIRMED" && payload?.isOwnAuthor === false
    ? "validation.NOT_OWNER"
    : `validation.${validation?.code || "CONTENT_REQUIRED"}`;
  return t(key);
}

if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn("[Chamber] Side panel behavior unavailable:", err);
  });
}

// Chamber Protocol API Server (on the same VM as the web-feed)
const CHAMBER_API_BASE = "https://studio.milkcat.org/chamber-api";

function reportBackgroundError(error, context) {
  fetch(`${CHAMBER_API_BASE}/dev-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: context,
      message: String(error?.message || error || "Unknown error").slice(0, 2000),
      stack: String(error?.stack || "").slice(0, 6000),
      timestamp: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest().version
    })
  }).catch(() => {});
}

self.addEventListener("error", (event) => {
  reportBackgroundError(event.error || event.message, "background:error");
});

self.addEventListener("unhandledrejection", (event) => {
  reportBackgroundError(event.reason, "background:unhandledrejection");
});

// Poll for pending reading requests and display badge / notification
async function checkPendingReadingRequests() {
  try {
    const allData = await chrome.storage.local.get(null);
    const keys = new Set();
    for (const [k, v] of Object.entries(allData)) {
      if ((k.endsWith("identityAlias") || k.endsWith("nativeWalletAddress")) && typeof v === "string" && v.trim()) {
        keys.add(v.trim());
      }
    }
    const profiles = allData.chamberProfiles || [];
    for (const p of profiles) {
      if (p.alias) keys.add(p.alias.trim());
      if (p.walletAddress) keys.add(p.walletAddress.trim());
    }

    if (keys.size === 0) return;

    const requestMap = new Map();
    for (const queryKey of keys) {
      try {
        const res = await fetch(`${CHAMBER_API_BASE}/access/requests?ownerIdentityKey=${encodeURIComponent(queryKey)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.requests)) {
            for (const r of data.requests) {
              requestMap.set(r.id, r);
            }
          }
        }
      } catch (_) {}
    }

    const allRequests = Array.from(requestMap.values());
    const pendingCount = allRequests.filter((r) => r.status === "pending").length;

    if (pendingCount > 0) {
      chrome.action.setBadgeText({ text: String(pendingCount) });
      chrome.action.setBadgeBackgroundColor({ color: "#e11d48" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }

    if (pendingCount > 0 && chrome.notifications) {
      const lastNotified = await chrome.storage.local.get(["lastNotifiedRequestCount"]);
      if (lastNotified.lastNotifiedRequestCount !== pendingCount) {
        await chrome.storage.local.set({ lastNotifiedRequestCount: pendingCount });
        chrome.notifications.create("reading_request_alert", {
          type: "basic",
          iconUrl: "icons/icon-128.png",
          title: "🔔 [Chamber] 收到新的文章閱讀申請",
          message: `有 ${pendingCount} 位讀者向您申請解鎖閱讀加密文章，點擊前往 Echo 審核授權。`,
          priority: 2,
        });
      }
    }
  } catch (_) {}
}

setInterval(checkPendingReadingRequests, 15_000);
setTimeout(checkPendingReadingRequests, 2000);

if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === "reading_request_alert") {
      chrome.tabs.create({ url: "https://studio.milkcat.org/echo/all?requests=true" });
    }
  });
}

// Retrieve config from chrome storage and resolve the active wallet / key tier
async function getExtensionConfig(fbUserId) {
  const userId = fbUserId || "default";
  const prefix = `user_${userId}_`;
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [prefix + "nativeWalletAddress", prefix + "nativeWalletPrivateKey", prefix + "customWalletAddress", prefix + "customWalletPrivateKey", prefix + "isDebugMode", "imgurClientId"],
      async (data) => {
        let activeWallet = data[prefix + "customWalletAddress"] || data[prefix + "nativeWalletAddress"] || null;
        let activeKey = data[prefix + "customWalletPrivateKey"] || data[prefix + "nativeWalletPrivateKey"] || null;
        
        // Auto-generate custodial wallet on the fly if not present
        if (!activeWallet) {
          const arrAddr = new Uint8Array(20);
          self.crypto.getRandomValues(arrAddr);
          activeWallet = "0x" + Array.from(arrAddr).map(b => b.toString(16).padStart(2, "0")).join("");

          const arrPriv = new Uint8Array(32);
          self.crypto.getRandomValues(arrPriv);
          activeKey = Array.from(arrPriv).map(b => b.toString(16).padStart(2, "0")).join("");

          const update = {};
          update[prefix + "nativeWalletAddress"] = activeWallet;
          update[prefix + "nativeWalletPrivateKey"] = activeKey;
          chrome.storage.local.set(update);
          console.log(`[Chamber] Generated native wallet in background: ${activeWallet}`);
        }

        const accessCapability = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`chamber-owner-access-v1:${activeKey}`))));
        const accessCapabilityHash = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessCapability))));
        resolve({
          boundWalletAddress: activeWallet,
          walletPrivateKey: activeKey,
          accessCapability,
          accessCapabilityHash,
          isDebugMode: data[prefix + "isDebugMode"] !== false,
          imgurClientId: data.imgurClientId || "mock_imgur_id",
        });
      }
    );
  });
}

// AES-GCM owner encryption. The owner secret never leaves the extension
// service worker; Echo must ask the extension to decrypt.
async function deriveOwnerKey(ownerSecret) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(ownerSecret || "")));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function importPostKey(postKeyBytes, usages = ["encrypt", "decrypt"]) {
  return crypto.subtle.importKey("raw", postKeyBytes, { name: "AES-GCM" }, false, usages);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptBytes(bytes, ownerSecret, contentType = "application/octet-stream") {
  const key = await deriveOwnerKey(ownerSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return { data: bytesToBase64(ciphertext), iv: bytesToBase64(iv), contentType, encrypted: true, algorithm: "AES-GCM", key_version: "local-extension-v1" };
}

async function encryptBytesWithPostKey(bytes, postKeyBytes, contentType = "application/octet-stream") {
  const key = await importPostKey(postKeyBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return { data: bytesToBase64(ciphertext), iv: bytesToBase64(iv), contentType, encrypted: true, algorithm: "AES-GCM", key_version: "post-key-v2" };
}

async function encryptContentWithPostKey(text, postKeyBytes) {
  const encrypted = await encryptBytesWithPostKey(new TextEncoder().encode(text), postKeyBytes, "text/plain;charset=utf-8");
  return { ciphertext: encrypted.data, iv: encrypted.iv, encrypted: true, algorithm: encrypted.algorithm, key_version: encrypted.key_version };
}

async function createOwnerEnvelope(postKeyBytes, ownerSecret) {
  const ownerKey = await deriveOwnerKey(ownerSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, ownerKey, postKeyBytes));
  return {
    version: "chamber-owner-envelope-v1",
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    wrapped_key: bytesToBase64(wrapped)
  };
}

async function unwrapOwnerEnvelope(envelope, ownerSecret) {
  if (envelope?.version !== "chamber-owner-envelope-v1") throw new Error("Unsupported owner key envelope");
  const ownerKey = await deriveOwnerKey(ownerSecret);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    ownerKey,
    base64ToBytes(envelope.wrapped_key)
  ));
}

async function sharingKeyId(publicKey) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(publicKey))));
  return bytesToHex(digest).slice(0, 32);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateSharingIdentity(userId) {
  const prefix = `user_${userId || "default"}_`;
  const keys = [prefix + "sharingPublicKey", prefix + "sharingPrivateKey", prefix + "sharingKeyId"];
  const stored = await chrome.storage.local.get(keys);
  if (stored[keys[0]] && stored[keys[1]] && stored[keys[2]]) {
    return { publicKey: stored[keys[0]], privateKey: stored[keys[1]], keyId: stored[keys[2]] };
  }
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const keyId = await sharingKeyId(publicKey);
  await chrome.storage.local.set({ [keys[0]]: publicKey, [keys[1]]: privateKey, [keys[2]]: keyId });
  return { publicKey, privateKey, keyId };
}

async function deriveRecipientWrappingKey(privateJwk, publicJwk) {
  const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const publicKey = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256));
  const digest = await crypto.subtle.digest("SHA-256", shared);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function createRecipientEnvelope(postKeyBytes, recipientPublicKey, recipientKeyId) {
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPrivate = await crypto.subtle.exportKey("jwk", ephemeral.privateKey);
  const ephemeralPublic = await crypto.subtle.exportKey("jwk", ephemeral.publicKey);
  const wrappingKey = await deriveRecipientWrappingKey(ephemeralPrivate, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, postKeyBytes));
  return {
    version: "chamber-recipient-envelope-v1",
    algorithm: "ECDH-P256+AES-GCM",
    recipient_key_id: recipientKeyId,
    ephemeral_public_key: ephemeralPublic,
    iv: bytesToBase64(iv),
    wrapped_key: bytesToBase64(wrapped)
  };
}

async function unwrapRecipientEnvelope(envelope, sharingIdentity) {
  if (envelope?.version !== "chamber-recipient-envelope-v1" || envelope.recipient_key_id !== sharingIdentity.keyId) {
    throw new Error("This reading grant belongs to another Chamber key");
  }
  const wrappingKey = await deriveRecipientWrappingKey(sharingIdentity.privateKey, envelope.ephemeral_public_key);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    wrappingKey,
    base64ToBytes(envelope.wrapped_key)
  ));
}

async function recoveryChecksum(userId, address, secret) {
  const bytes = new TextEncoder().encode(`${userId}:${String(address).toLowerCase()}:${String(secret).toLowerCase()}`);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function encryptSharingIdentityForRecovery(identity, ownerSecret) {
  const key = await deriveOwnerKey(ownerSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(identity))
  ));
  return { algorithm: "AES-GCM", iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function restoreSharingIdentityFromRecovery(envelope, ownerSecret, prefix) {
  if (!envelope?.iv || !envelope?.ciphertext) return;
  const key = await deriveOwnerKey(ownerSecret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ciphertext)
  );
  const identity = JSON.parse(new TextDecoder().decode(plaintext));
  if (!identity.publicKey || !identity.privateKey || !identity.keyId) throw new Error(t("crypto.sharingIncomplete"));
  await chrome.storage.local.set({
    [prefix + "sharingPublicKey"]: identity.publicKey,
    [prefix + "sharingPrivateKey"]: identity.privateKey,
    [prefix + "sharingKeyId"]: identity.keyId,
  });
}

function encodeRecoveryCode(setId, share, accountId) {
  const payload = bytesToBase64(new TextEncoder().encode(JSON.stringify({ version: 3, setId, share, accountId })))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `CHAMBER-C1.${payload}`;
}

function decodeRecoveryCode(value) {
  const normalized = String(value || "").trim();
  if (normalized.startsWith("CHAMBER-C1.")) {
    const encoded = normalized.slice("CHAMBER-C1.".length).replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    const parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(padded)));
    if (!parsed.setId || Number(parsed.share?.x) !== 3 || !parsed.share?.data) throw new Error(t("crypto.codeInvalid"));
    return parsed;
  }
  throw new Error(t("crypto.codeInvalid"));
}

async function prepareRecoveryVault(userId) {
  if (!globalThis.ChamberSecretSharing) throw new Error(t("crypto.moduleMissing"));
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId || normalizedUserId === "default") throw new Error(t("crypto.facebookLoginRequired"));
  const prefix = `user_${normalizedUserId}_`;
  const config = await getExtensionConfig(normalizedUserId);
  const storage = await chrome.storage.local.get([prefix + "customWalletAddress", prefix + "customWalletPrivateKey", prefix + "identityAlias"]);
  const usesCustom = storage[prefix + "customWalletAddress"] === config.boundWalletAddress && storage[prefix + "customWalletPrivateKey"] === config.walletPrivateKey;
  const exportedAt = new Date().toISOString();
  const setId = crypto.randomUUID();
  const shares = ChamberSecretSharing.split2of3(config.walletPrivateKey);
  const sharingIdentityEnvelope = await encryptSharingIdentityForRecovery(await getOrCreateSharingIdentity(normalizedUserId), config.walletPrivateKey);
  const base = {
    format: "chamber-recovery-share-v2",
    scheme: "shamir-2-of-3",
    setId,
    createdAt: exportedAt,
    ownerUserId: normalizedUserId,
    // Compatibility field for recovery records created/read by 0.6.x.
    facebookUserId: normalizedUserId,
    ownerAddress: config.boundWalletAddress,
    keyTier: usesCustom ? "custom" : "native",
    identityAlias: storage[prefix + "identityAlias"] || "",
    checksum: await recoveryChecksum(normalizedUserId, config.boundWalletAddress, config.walletPrivateKey),
    sharingIdentityEnvelope,
  };
  await chrome.storage.local.set({
    [prefix + "recoveryPendingLocalShare"]: { ...base, share: shares[0] },
    [prefix + "recoveryPendingShareC"]: shares[2],
    [prefix + "recoveryPendingExportAt"]: exportedAt,
    lastFbUserId: normalizedUserId,
  });
  return {
    shareB: { ...base, share: shares[1] },
    exportedAt,
    setId,
  };
}

async function finalizeRecoveryVault(userId, setId, accountId) {
  const prefix = `user_${userId}_`;
  const data = await chrome.storage.local.get([prefix + "recoveryPendingLocalShare", prefix + "recoveryPendingShareC"]);
  if (data[prefix + "recoveryPendingLocalShare"]?.setId !== setId || Number(data[prefix + "recoveryPendingShareC"]?.x) !== 3) {
    throw new Error(t("crypto.shareVersionChanged"));
  }
  await chrome.storage.local.set({
    [prefix + "recoveryLocalShare"]: data[prefix + "recoveryPendingLocalShare"],
    [prefix + "recoveryVaultAccountId"]: accountId,
  });
  await chrome.storage.local.remove([prefix + "recoveryPendingLocalShare"]);
  return { setId, recoveryCodeC: encodeRecoveryCode(setId, data[prefix + "recoveryPendingShareC"], accountId) };
}

async function confirmRecoveryVault(userId, setId) {
  const prefix = `user_${userId}_`;
  const data = await chrome.storage.local.get([prefix + "recoveryLocalShare", prefix + "recoveryPendingExportAt"]);
  if (data[prefix + "recoveryLocalShare"]?.setId !== setId) throw new Error(t("crypto.shareVersionChanged"));
  await chrome.storage.local.set({
    [prefix + "recoveryExportedAt"]: data[prefix + "recoveryPendingExportAt"] || new Date().toISOString(),
    [prefix + "recoveryExportConfirmedVersion"]: "2-of-3-vault-v1",
  });
  await chrome.storage.local.remove([prefix + "recoveryPendingExportAt"]);
  await chrome.storage.local.remove([prefix + "recoveryPendingShareC"]);
  return true;
}

async function restoreFromRecoveryVault(suppliedShareB, recoveryCodeC, currentUserId) {
  const decoded = decodeRecoveryCode(recoveryCodeC);
  let shareB = suppliedShareB;
  const currentPrefix = currentUserId && currentUserId !== "default" ? `user_${currentUserId}_` : "";
  const localData = currentPrefix ? await chrome.storage.local.get([currentPrefix + "recoveryLocalShare"]) : {};
  const localShare = currentPrefix ? localData[currentPrefix + "recoveryLocalShare"] : null;
  let recoveryShares;
  if (localShare?.setId === decoded.setId) {
    shareB = localShare;
    recoveryShares = [localShare.share, decoded.share];
  } else {
    if (shareB?.format !== "chamber-recovery-share-v2" || ![1, 2].includes(Number(shareB?.share?.x))) throw new Error(t("crypto.vaultBInvalid"));
    recoveryShares = [shareB.share, decoded.share];
  }
  if (decoded.setId && decoded.setId !== shareB.setId) throw new Error(t("crypto.shareSetMismatch"));
  const ownerUserId = String(shareB.ownerUserId || shareB.facebookUserId || "");
  if (currentUserId && currentUserId !== "default" && ownerUserId !== String(currentUserId)) {
    throw new Error(t("crypto.accountMismatch"));
  }
  const ownerSecret = ChamberSecretSharing.combine2of3(recoveryShares);
  if (await recoveryChecksum(ownerUserId, shareB.ownerAddress, ownerSecret) !== shareB.checksum) {
    throw new Error(t("crypto.checksumFailed"));
  }
  const prefix = `user_${ownerUserId}_`;
  const update = {
    [prefix + (shareB.keyTier === "custom" ? "customWalletAddress" : "nativeWalletAddress")]: shareB.ownerAddress,
    [prefix + (shareB.keyTier === "custom" ? "customWalletPrivateKey" : "nativeWalletPrivateKey")]: ownerSecret,
    lastFbUserId: ownerUserId,
  };
  if (shareB.identityAlias) update[prefix + "identityAlias"] = shareB.identityAlias;
  await chrome.storage.local.set(update);
  await restoreSharingIdentityFromRecovery(shareB.sharingIdentityEnvelope, ownerSecret, prefix);
  if (!suppliedShareB && localShare?.setId === decoded.setId) {
    return { local: true, setId: decoded.setId, accountId: decoded.accountId || "" };
  }
  // B+C were both exposed during disaster recovery. Prepare a fresh set; Echo
  // replaces B in the same passkey-protected Vault before showing the new C.
  return { ...(await prepareRecoveryVault(ownerUserId)), accountId: decoded.accountId || "" };
}

async function restoreFromLocalAAndVaultB(shareB, currentUserId) {
  if (!currentUserId || currentUserId === "default") throw new Error(t("crypto.facebookAccountRequired"));
  if (shareB?.format !== "chamber-recovery-share-v2" || Number(shareB?.share?.x) !== 2) throw new Error(t("crypto.vaultBInvalid"));
  const prefix = `user_${currentUserId}_`;
  const data = await chrome.storage.local.get([prefix + "recoveryLocalShare", prefix + "recoveryVaultAccountId"]);
  const localShare = data[prefix + "recoveryLocalShare"];
  if (!localShare || Number(localShare.share?.x) !== 1 || localShare.setId !== shareB.setId) throw new Error(t("crypto.localVaultMismatch"));
  const ownerSecret = ChamberSecretSharing.combine2of3([localShare.share, shareB.share]);
  const ownerUserId = String(shareB.ownerUserId || shareB.facebookUserId || "");
  if (await recoveryChecksum(ownerUserId, shareB.ownerAddress, ownerSecret) !== shareB.checksum) throw new Error(t("crypto.localVaultChecksumFailed"));
  const update = {
    [prefix + (shareB.keyTier === "custom" ? "customWalletAddress" : "nativeWalletAddress")]: shareB.ownerAddress,
    [prefix + (shareB.keyTier === "custom" ? "customWalletPrivateKey" : "nativeWalletPrivateKey")]: ownerSecret,
    lastFbUserId: ownerUserId,
  };
  if (shareB.identityAlias) update[prefix + "identityAlias"] = shareB.identityAlias;
  await chrome.storage.local.set(update);
  await restoreSharingIdentityFromRecovery(shareB.sharingIdentityEnvelope, ownerSecret, prefix);
  return { accountId: data[prefix + "recoveryVaultAccountId"] || "", setId: shareB.setId };
}

async function recoveryVaultStatus(userId) {
  const prefix = `user_${userId || "default"}_`;
  const data = await chrome.storage.local.get([
    prefix + "recoveryLocalShare",
    prefix + "recoveryVaultAccountId",
    prefix + "recoveryExportConfirmedVersion",
    prefix + "recoveryPendingShareC"
  ]);
  const setId = data[prefix + "recoveryLocalShare"]?.setId || "";
  const accountId = data[prefix + "recoveryVaultAccountId"] || "";
  const pendingShareC = data[prefix + "recoveryPendingShareC"];
  return {
    hasLocalA: Boolean(data[prefix + "recoveryLocalShare"]?.share?.x === 1),
    setId,
    accountId,
    confirmed: data[prefix + "recoveryExportConfirmedVersion"] === "2-of-3-vault-v1",
    pendingRecoveryCodeC: setId && accountId && pendingShareC
      ? encodeRecoveryCode(setId, pendingShareC, accountId)
      : ""
  };
}

async function decryptBytes(data, iv, ownerSecret) {
  const key = await deriveOwnerKey(ownerSecret);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, key, base64ToBytes(data)));
}

async function encryptContent(text, ownerSecret) {
  try {
    const key = await deriveOwnerKey(ownerSecret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
    return { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(iv), encrypted: true, algorithm: "AES-GCM", key_version: "local-extension-v1" };
  } catch (err) {
    console.error("[Chamber] Encryption failed:", err);
    throw new Error("Encryption failed: " + err.message);
  }
}

async function optimizeImageForDevnet(blob, targetBytes = 90 * 1024) {
  if (!blob?.type?.startsWith("image/") || blob.type === "image/gif" || blob.size <= targetBytes) return blob;
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    let best = blob;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return best;
      context.drawImage(bitmap, 0, 0, width, height);
      const quality = Math.max(0.42, 0.88 - attempt * 0.06);
      const candidate = await canvas.convertToBlob({ type: "image/webp", quality });
      if (candidate.size < best.size) best = candidate;
      if (candidate.size <= targetBytes) return candidate;
      scale *= 0.82;
    }
    return best;
  } finally {
    bitmap.close?.();
  }
}

// Media Fallback Gateway - Fetch image from cache and upload to Imgur/R2
async function uploadToFallbackStorage(mediaSourceUrl, config, postKeyBytes = null) {
  if (!mediaSourceUrl) return "";
  try {
    console.log(`[Chamber] Fetching media from cache: ${mediaSourceUrl}`);
    // Fetch with force-cache to hit local memory/disk cache without using fresh data usage
    const response = await fetch(mediaSourceUrl, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Platform media fetch failed (${response.status})`);
    let blob = await response.blob();

    console.log(`[Chamber] Media Blob extracted. Size: ${blob.size} bytes. Initiating fallback upload...`);
    if (config.isDebugMode !== false) {
      const originalSize = blob.size;
      blob = await optimizeImageForDevnet(blob);
      if (blob.size < originalSize) {
        console.log(`[Chamber] Devnet media optimized: ${originalSize} -> ${blob.size} bytes (${blob.type})`);
      }
    }
    
    // Imgur API Upload Implementation
    // Encrypted MVP media must never be sent to an unencrypted third-party
    // image host. Keep this legacy branch disabled while encryption is on.
    if (config.isEncryptionEnabled === false && config.imgurClientId && config.imgurClientId !== "mock_imgur_id") {
      const formData = new FormData();
      formData.append("image", blob);

      const res = await fetch("https://api.imgur.com/3/image", {
        method: "POST",
        headers: {
          Authorization: `Client-ID ${config.imgurClientId}`
        },
        body: formData
      });

      const resData = await res.json();
      if (resData.success && resData.data && resData.data.link) {
        console.log(`[Chamber] Fallback upload succeeded (Imgur): ${resData.data.link}`);
        return resData.data.link;
      } else {
        throw new Error(resData.data?.error || "Imgur rejected the request");
      }
    } else {
      const encrypted = postKeyBytes
        ? await encryptBytesWithPostKey(new Uint8Array(await blob.arrayBuffer()), postKeyBytes, blob.type || "image/jpeg")
        : await encryptBytes(new Uint8Array(await blob.arrayBuffer()), config.walletPrivateKey, blob.type || "image/jpeg");
      const response = await fetch(`${CHAMBER_API_BASE}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: encrypted.data,
          contentType: "application/octet-stream",
          isEncrypted: true,
          network: "devnet",
          isDebug: false
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.url) {
        throw new Error(result.error || `Media API error ${response.status}`);
      }
      console.log(`[Chamber] Fallback upload succeeded (Irys ${result.network}): ${result.url}`);
      return { url: result.url, iv: encrypted.iv, contentType: encrypted.contentType, encrypted: true, algorithm: encrypted.algorithm, key_version: encrypted.key_version };
    }
  } catch (err) {
    console.error("[Chamber] Media fallback upload failed:", err);
    reportBackgroundError(err, "background:media-upload");
    throw err;
  }
}

// Upload to Arweave via Chamber Protocol API Server (custodial)
// The server holds the Arweave wallet and uses Irys Turbo free tier (<100KB)
async function uploadViaChamberAPI(postPayload) {
  console.log("[Chamber] Sending to Chamber API for Arweave upload...");
  try {
    const response = await fetch(`${CHAMBER_API_BASE}/backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error ${response.status}: ${errText}`);
    }

    const result = await response.json();
    console.log(`[Chamber] ✅ Arweave upload success! TxID: ${result.txId}`);
    console.log(`[Chamber] Echo URL: ${result.echoUrl}`);
    return result;
  } catch (err) {
    console.error("[Chamber] ❌ Chamber API upload failed:", err);
    throw err;
  }
}

// Main Controller Flow
async function processBackupTask(postData, isHistoric) {
  // `fbUserId` is retained as a wire/storage compatibility field. For new
  // platforms it carries the Chamber owner storage ID, not a Facebook ID.
  const fbUserId = postData.ownerUserId || postData.fbUserId || postData.fb_user_id || null;
  const userId = fbUserId || "default";
  const prefix = `user_${userId}_`;
  if (isHistoric) {
    const validation = ChamberMvpValidation.validateBackupPayload(postData);
    if (!validation.ok) throw new Error(validationMessage(validation, postData));
  }
  const config = await getExtensionConfig(fbUserId);
  const postKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ownerKeyEnvelope = await createOwnerEnvelope(postKeyBytes, config.walletPrivateKey);
  console.log(`[Chamber] Processing backup task (Historic: ${isHistoric})`);
  const mappingData = await new Promise((resolve) => {
    chrome.storage.local.get(
      [
        prefix + "identityAlias",
        prefix + "identityPlatform",
        prefix + "identityDisplayName",
        prefix + "identityActorType",
        prefix + "identityActorId",
        prefix + "isDebugMode",
      ],
      resolve
    );
  });
  const profileData = await new Promise((resolve) => chrome.storage.local.get(["chamberProfiles", "activeChamberProfileId"], resolve));
  const activeProfile = Array.isArray(profileData.chamberProfiles)
    ? profileData.chamberProfiles.find((profile) => profile.id === profileData.activeChamberProfileId)
    : null;

  // 1. Perform off-chain media fallback upload (image to Imgur/R2)
  let fallbackUrls = [];
  let fallbackItems = [];
  const mediaUrls = postData.mediaUrls || [
    postData.media?.primary_fb_cdn,
    postData.media?.fallback_backup
  ].filter(Boolean);
  const isVideoLinkBackup = postData.media?.videoDetected === true;
  const content = postData.textContent || postData.content ||
    (isVideoLinkBackup ? t("media.platformVideoPost") : (mediaUrls.length > 0 ? t("media.platformImagePost") : ""));
  for (const [mediaIndex, url] of mediaUrls.entries()) {
    if (url && url.startsWith("http")) {
      let fallback;
      try {
        fallback = await uploadToFallbackStorage(url, config, postKeyBytes);
      } catch (error) {
        // A Facebook video poster is optional in the MVP. The durable Reel
        // permalink and encrypted text are still a valid link-only backup.
        if (isVideoLinkBackup) {
          console.warn(`[Chamber] Optional video poster ${mediaIndex + 1}/${mediaUrls.length} skipped: ${error.message || error}`);
          continue;
        }
        const detail = /not enough balance|\b402\b/i.test(error.message || "")
          ? t("media.devnetQuota")
          : (error.message || t("media.uploadFailed"));
        throw new Error(t("media.imageUploadFailed", { current: mediaIndex + 1, total: mediaUrls.length, detail }));
      }
      if (fallback) {
        const item = typeof fallback === "string" ? { url: fallback, encrypted: false } : fallback;
        fallbackUrls.push(item.url);
        fallbackItems.push(item);
        console.log(`[Chamber] Media ${mediaIndex + 1}/${mediaUrls.length} uploaded: ${item.url}`);
      } else {
        console.error(`[Chamber] Media ${mediaIndex + 1}/${mediaUrls.length} returned no backup URL`);
      }
    } else {
      console.error(`[Chamber] Media ${mediaIndex + 1}/${mediaUrls.length} has invalid source URL`);
    }
  }
  if (!isVideoLinkBackup && mediaUrls.length > 0 && fallbackUrls.length !== mediaUrls.length) {
    throw new Error(t("media.noSuccessfulUpload"));
  }

  // 2. Build API payload (custodial mode — server handles wallet signing)
  const apiPayload = {
    extensionVersion: chrome.runtime.getManifest().version,
    fbUserId: fbUserId,
    content: JSON.stringify(await encryptContentWithPostKey(content, postKeyBytes)),
    isEncrypted: true,
    encryptionVersion: "post-key-v2",
    keyEnvelope: ownerKeyEnvelope,
    accessCapabilityHash: config.accessCapabilityHash,
    platform: postData.platform || mappingData[prefix + "identityPlatform"] || "facebook",
    // Never send an inaccessible Facebook playback/poster URL as though it
    // were a completed immutable media upload.
    mediaUrls: fallbackUrls,
    mediaItems: fallbackItems,
    mediaMeta: {
      ...(postData.media || {}),
      videoPosterBackedUp: isVideoLinkBackup ? fallbackUrls.length > 0 : undefined
    },
    privacy: postData.privacy || "PUBLIC",
    timestamp: postData.publishedAt || postData.timestamp || Math.floor(Date.now() / 1000),
    publishedAt: postData.publishedAt || null,
    authorName: postData.authorName || null,
    authorUrl: postData.authorUrl || null,
    // If user has bound a wallet, include it for the binding claim
    boundWallet: activeProfile?.walletAddress || config.boundWalletAddress || null,
    sourceUrl: postData.sourceUrl || null,
    identityAlias: activeProfile ? (activeProfile.alias || null) : (mappingData[prefix + "identityAlias"] || null),
    identityDisplayName: activeProfile ? (activeProfile.name || null) : (mappingData[prefix + "identityDisplayName"] || null),
    identityActorType: postData.identityActorType || mappingData[prefix + "identityActorType"] || "personal",
    identityActorId: postData.identityActorId || mappingData[prefix + "identityActorId"] || fbUserId || "default",
    // The current test release uses devnet without exposing an internal
    // DEBUG label to users. Network selection and diagnostics are separate.
    network: "devnet",
    isDebug: false,
  };

  console.log("[Chamber] Sending payload to Chamber API...");

  // 3. Upload via Chamber API (real Arweave upload, server pays with Irys Turbo free tier)
  const result = await uploadViaChamberAPI(apiPayload);

  // Save timeline URL and hash to local storage for the popup dashboard under prefix
  const update = {
    lastFbUserId: userId
  };
  update[prefix + "lastEchoUrl"] = result.echoUrl;
  update[prefix + "lastFbUserIdHash"] = result.fbUserIdHash;
  chrome.storage.local.set(update);

  return {
    success: true,
    txId: result.txId,
    arweaveUrl: result.arweaveUrl,
    echoUrl: result.echoUrl,
    fbUserIdHash: result.fbUserIdHash,
    network: result.network || null,
    requestId: result.requestId || null,
  };
}

// Listen to requests from content.js or popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_ACTIVE_WALLET_INFO") {
    chrome.storage.local.get(["lastFbUserId"], (meta) => {
      const userId = meta.lastFbUserId || "default";
      const prefix = `user_${userId}_`;
      Promise.all([
        getExtensionConfig(userId),
        getOrCreateSharingIdentity(userId),
        chrome.storage.local.get([prefix + "identityAlias", prefix + "identityDisplayName"]),
      ]).then(([config, sharing, identity]) => {
        sendResponse({
          success: true,
          walletAddress: config.boundWalletAddress,
          identityAlias: identity[prefix + "identityAlias"] || "",
          identityDisplayName: identity[prefix + "identityDisplayName"] || identity[prefix + "identityAlias"] || "",
          sharingPublicKey: sharing.publicKey,
          sharingKeyId: sharing.keyId,
          accessCapability: config.accessCapability
        });
      });
    });
    return true;
  }

  if (request.action === "DECRYPT_OWNER_DATA") {
    chrome.storage.local.get(["lastFbUserId"], (meta) => {
      const userId = meta.lastFbUserId || "default";
      Promise.all([getExtensionConfig(userId), getOrCreateSharingIdentity(userId)]).then(async ([config, sharing]) => {
        let bytes;
        if (request.ownerKeyEnvelope || request.recipientKeyEnvelope) {
          const postKeyBytes = request.recipientKeyEnvelope
            ? await unwrapRecipientEnvelope(request.recipientKeyEnvelope, sharing)
            : await unwrapOwnerEnvelope(request.ownerKeyEnvelope, config.walletPrivateKey);
          const postKey = await importPostKey(postKeyBytes);
          bytes = new Uint8Array(await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToBytes(request.iv) },
            postKey,
            base64ToBytes(request.ciphertext)
          ));
        } else {
          bytes = await decryptBytes(request.ciphertext, request.iv, config.walletPrivateKey);
        }
        sendResponse({ success: true, plaintext: request.mode === "bytes" ? "" : new TextDecoder().decode(bytes), data: request.mode === "bytes" ? bytesToBase64(bytes) : "" });
      }).catch((error) => sendResponse({ success: false, error: error.message || "Owner decryption failed" }));
    });
    return true;
  }

  if (request.action === "CREATE_RECIPIENT_GRANT") {
    chrome.storage.local.get(["lastFbUserId"], (meta) => {
      getExtensionConfig(meta.lastFbUserId || "default").then(async (config) => {
        const postKeyBytes = await unwrapOwnerEnvelope(request.ownerKeyEnvelope, config.walletPrivateKey);
        const envelope = await createRecipientEnvelope(postKeyBytes, request.recipientPublicKey, request.recipientKeyId);
        sendResponse({ success: true, recipientKeyEnvelope: envelope });
      }).catch((error) => sendResponse({ success: false, error: error.message || "Grant creation failed" }));
    });
    return true;
  }

async function resolveActiveUserId() {
  const data = await chrome.storage.local.get(["chamberProfiles", "activeChamberProfileId", "lastFbUserId"]);
  const activeId = data.activeChamberProfileId;
  const profiles = Array.isArray(data.chamberProfiles) ? data.chamberProfiles : [];
  const activeProfile = profiles.find((p) => p.id === activeId) || profiles[0];
  if (activeProfile?.ownerUserId) return activeProfile.ownerUserId;
  if (data.lastFbUserId && data.lastFbUserId !== "default") return data.lastFbUserId;
  return activeProfile?.id || data.lastFbUserId || "default";
}

  if (request.action === "PREPARE_RECOVERY_VAULT") {
    resolveActiveUserId()
      .then((userId) => prepareRecoveryVault(userId))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message || "Recovery Vault setup failed" }));
    return true;
  }

  if (request.action === "CONFIRM_RECOVERY_VAULT") {
    resolveActiveUserId()
      .then((userId) => confirmRecoveryVault(userId, request.setId))
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message || "Recovery Vault confirmation failed" }));
    return true;
  }

  if (request.action === "FINALIZE_RECOVERY_VAULT") {
    resolveActiveUserId()
      .then((userId) => finalizeRecoveryVault(userId, request.setId, request.accountId))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message || "Recovery Vault finalization failed" }));
    return true;
  }

  if (request.action === "RESTORE_RECOVERY_VAULT") {
    resolveActiveUserId()
      .then((userId) => restoreFromRecoveryVault(request.shareB, request.recoveryCodeC, userId))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message || "Recovery Vault restore failed" }));
    return true;
  }

  if (request.action === "GET_RECOVERY_VAULT_STATUS") {
    resolveActiveUserId()
      .then((userId) => recoveryVaultStatus(userId))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message || "Recovery Vault status failed" }));
    return true;
  }

  if (request.action === "RESTORE_RECOVERY_AB") {
    resolveActiveUserId()
      .then((userId) => restoreFromLocalAAndVaultB(request.shareB, userId))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message || "A+B recovery failed" }));
    return true;
  }

  if (request.action === "BACKUP_POST_DRAFT" || request.action === "BACKUP_HISTORIC_POST") {
    processBackupTask(request.payload, request.action === "BACKUP_HISTORIC_POST")
      .then((res) => {
        sendResponse(res);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep response channel open for async processing
  }
});

function migrateDefaultSettingsIfNeeded(userId) {
  if (!userId || userId === "default") return;
  const defaultPrefix = "user_default_";
  const newPrefix = `user_${userId}_`;

  chrome.storage.local.get([defaultPrefix + "identityAlias"], (res) => {
    const defaultAlias = res[defaultPrefix + "identityAlias"];
    if (!defaultAlias) return;

    chrome.storage.local.get([newPrefix + "identityAlias"], (newRes) => {
      if (newRes[newPrefix + "identityAlias"]) return;

      console.log(`[Chamber BG] Migrating settings from default to user_${userId}`);
      const keys = [
        "identityAlias",
        "identityPlatform",
        "nativeWalletAddress",
        "nativeWalletPrivateKey",
        "customWalletAddress",
        "customWalletPrivateKey",
        "isEncryptionEnabled",
        "lastEchoUrl",
        "lastFbUserIdHash"
      ];
      chrome.storage.local.get(keys.map(k => defaultPrefix + k), (defaultData) => {
        const update = {};
        keys.forEach(k => {
          const val = defaultData[defaultPrefix + k];
          if (val !== undefined) {
            update[newPrefix + k] = val;
          }
        });
        chrome.storage.local.set(update, () => {
          const alias = update[newPrefix + "identityAlias"];
          const platform = update[newPrefix + "identityPlatform"] || "facebook";
          const customWallet = update[newPrefix + "customWalletAddress"];
          const nativeWallet = update[newPrefix + "nativeWalletAddress"];
          const wallet = customWallet || nativeWallet || "";

          fetch(`${CHAMBER_API_BASE}/identity/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              alias,
              platform,
              actorType: platform === "facebook" ? "personal" : "account",
              actorId: userId,
              displayName: alias,
              walletAddress: wallet || null,
              proof: ""
            })
          }).then(r => r.json()).then(data => {
            console.log("[Chamber BG] Migrated identity registration response:", data);
          }).catch(err => {
            console.error("[Chamber BG] Migrated identity registration failed:", err);
          });
        });
      });
    });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.lastFbUserId) {
    const newVal = changes.lastFbUserId.newValue;
    if (newVal && newVal !== "default") {
      migrateDefaultSettingsIfNeeded(newVal);
    }
  }
});
