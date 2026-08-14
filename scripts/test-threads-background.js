const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const extensionDir = path.resolve(__dirname, "../extension");
const storage = {
  lastFbUserId: "owner-1",
  activeChamberProfileId: "profile-1",
  chamberProfiles: [{
    id: "profile-1",
    name: "Threads Tester",
    alias: "threadstest",
    walletAddress: "0x1111111111111111111111111111111111111111",
    ownerUserId: "owner-1"
  }],
  "user_owner-1_nativeWalletAddress": "0x1111111111111111111111111111111111111111",
  "user_owner-1_nativeWalletPrivateKey": "1".repeat(64),
  "user_owner-1_identityAlias": "threadstest",
  "user_owner-1_identityPlatform": "threads",
  "user_owner-1_identityDisplayName": "Threads Tester",
  "user_owner-1_identityActorType": "personal",
  "user_owner-1_identityActorId": "threads-user-1",
  "user_owner-1_isDebugMode": true
};
let listener = null;
let backupRequest = null;
let mediaRequest = null;

const select = (keys) => {
  if (keys == null) return { ...storage };
  if (typeof keys === "string") return { [keys]: storage[keys] };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, storage[key] ?? fallback]));
};

const context = vm.createContext({
  console,
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  Blob,
  FormData,
  URL,
  URLSearchParams,
  Response,
  Headers,
  Request,
  setTimeout,
  clearTimeout,
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  self: {
    crypto: webcrypto,
    addEventListener: () => {}
  },
  chrome: {
    sidePanel: { setPanelBehavior: async () => {} },
    runtime: {
      getManifest: () => ({ version: "0.7.2" }),
      onMessage: { addListener: (value) => { listener = value; } }
    },
    storage: {
      local: {
        get: (keys, callback) => {
          const value = select(keys);
          if (callback) { callback(value); return; }
          return Promise.resolve(value);
        },
        set: (values, callback) => {
          Object.assign(storage, values);
          callback?.();
          return Promise.resolve();
        }
      },
      onChanged: { addListener: () => {} }
    }
  },
  fetch: async (url, options = {}) => {
    const target = String(url);
    if (target === "https://cdninstagram.example/poster.jpg") {
      return new Response(new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/jpeg" }), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" }
      });
    }
    if (target.endsWith("/chamber-api/media")) {
      mediaRequest = JSON.parse(options.body);
      return new Response(JSON.stringify({
        success: true,
        txId: "threads-media-tx",
        url: "https://devnet.irys.xyz/threads-media-tx",
        network: "devnet"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target.endsWith("/chamber-api/backup")) {
      backupRequest = JSON.parse(options.body);
      return new Response(JSON.stringify({
        success: true,
        requestId: "threads-request",
        txId: "threads-post-tx",
        arweaveUrl: "https://devnet.irys.xyz/threads-post-tx",
        echoUrl: "https://studio.milkcat.org/echo/threadstest/threads?post=threads-post-tx",
        fbUserIdHash: "owner-hash",
        network: "devnet"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target.endsWith("/dev-errors")) {
      return new Response(JSON.stringify({ success: true }), { status: 202, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }
});
context.globalThis = context;
context.importScripts = (...files) => {
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(extensionDir, file), "utf8"), context, { filename: file });
  }
};

vm.runInContext(fs.readFileSync(path.join(extensionDir, "background.js"), "utf8"), context, { filename: "background.js" });
assert.equal(typeof listener, "function", "background message listener must register");

const selectedPost = {
  platform: "threads",
  fbUserId: "owner-1",
  identityActorId: "threads-user-1",
  identityActorType: "personal",
  identityDisplayName: "@threadstest",
  textContent: "Threads private backup body",
  sourceUrl: "https://www.threads.com/@threadstest/post/Example_123",
  authorName: "@threadstest",
  authorUrl: "https://www.threads.com/@threadstest",
  publishedAt: 1786660000,
  timestamp: 1786660000,
  isOwnAuthor: true,
  contentExpanded: true,
  mediaUrls: ["https://cdninstagram.example/poster.jpg"],
  media: {
    primary_fb_cdn: "https://cdninstagram.example/poster.jpg",
    album: false,
    albumComplete: true,
    albumLoadedCount: 1,
    albumExpectedCount: 1,
    videoDetected: false
  }
};

new Promise((resolve, reject) => {
  const keepOpen = listener(
    { action: "BACKUP_HISTORIC_POST", payload: selectedPost },
    {},
    (result) => result?.success ? resolve(result) : reject(new Error(result?.error || "backup failed"))
  );
  assert.equal(keepOpen, true, "async response channel must stay open");
}).then(async (result) => {
  assert.equal(result.txId, "threads-post-tx");
  assert.equal(result.echoUrl, "https://studio.milkcat.org/echo/threadstest/threads?post=threads-post-tx");
  assert.equal(backupRequest.platform, "threads");
  assert.equal(backupRequest.sourceUrl, selectedPost.sourceUrl);
  assert.equal(backupRequest.identityAlias, "threadstest");
  assert.equal(backupRequest.identityActorId, "threads-user-1");
  assert.equal(backupRequest.timestamp, selectedPost.publishedAt);
  assert.equal(backupRequest.publishedAt, selectedPost.publishedAt);
  assert.equal(backupRequest.network, "devnet");
  assert.equal(backupRequest.isDebug, false);
  assert.equal(backupRequest.isEncrypted, true);
  assert.equal(backupRequest.encryptionVersion, "post-key-v2");
  assert.ok(backupRequest.keyEnvelope?.wrapped_key);
  assert.ok(backupRequest.accessCapabilityHash);
  assert.doesNotMatch(backupRequest.content, /Threads private backup body/);
  const encryptedContent = JSON.parse(backupRequest.content);
  assert.ok(encryptedContent.ciphertext && encryptedContent.iv);
  assert.equal(backupRequest.mediaUrls[0], "https://devnet.irys.xyz/threads-media-tx");
  assert.equal(backupRequest.mediaItems[0].encrypted, true);
  assert.equal(mediaRequest.isEncrypted, true);
  assert.doesNotMatch(mediaRequest.data, /AQIDBA/);
  assert.equal(storage["user_owner-1_lastEchoUrl"], result.echoUrl);
  const recovery = await new Promise((resolve, reject) => {
    listener({ action: "PREPARE_RECOVERY_VAULT" }, {}, (response) => response?.success
      ? resolve(response)
      : reject(new Error(response?.error || "recovery preparation failed")));
  });
  assert.equal(recovery.shareB.ownerUserId, "owner-1");
  assert.equal(recovery.shareB.facebookUserId, "owner-1", "0.6.x recovery compatibility field remains readable");
  assert.equal(recovery.shareB.identityAlias, "threadstest");
  assert.equal(recovery.shareB.share.x, 2);
  assert.equal(storage["user_owner-1_recoveryPendingLocalShare"].share.x, 1);
  console.log("Threads background pipeline passed: local post/media encryption, identity, receipt, Echo route, recovery share.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
