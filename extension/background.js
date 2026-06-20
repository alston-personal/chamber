/**
 * background.js - Chamber Protocol Extension Background Service Worker
 * 
 * Handles local wallet configurations, cryptographic symmetric encryption (AES-GCM),
 * browser cache loading of media, off-chain backup uploads (Imgur/R2), and Irys Arweave publishing.
 */

// Schema Constant
const PROTOCOL_VERSION = "0.1.4";
const APP_NAME = "Chamber";

// Chamber Protocol API Server (on the same VM as the web-feed)
const CHAMBER_API_BASE = "https://studio.milkcat.org/chamber-api";

// Retrieve config from chrome storage and resolve the active wallet / key tier
async function getExtensionConfig(fbUserId) {
  const userId = fbUserId || "default";
  const prefix = `user_${userId}_`;
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [prefix + "nativeWalletAddress", prefix + "nativeWalletPrivateKey", prefix + "customWalletAddress", prefix + "customWalletPrivateKey", "imgurClientId"],
      (data) => {
        const activeWallet = data[prefix + "customWalletAddress"] || data[prefix + "nativeWalletAddress"] || null;
        const activeKey = data[prefix + "customWalletPrivateKey"] || data[prefix + "nativeWalletPrivateKey"] || null;
        
        resolve({
          boundWalletAddress: activeWallet,
          walletPrivateKey: activeKey,
          imgurClientId: data.imgurClientId || "mock_imgur_id",
        });
      }
    );
  });
}

// AES-GCM Client-side Encryption Helper
async function encryptContent(text, privateKeyHex) {
  try {
    const enc = new TextEncoder();
    // Convert hex private key to a crypto key
    const rawKey = enc.encode(privateKeyHex.slice(0, 32)); // Use a 256-bit slice for key derivation
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      cryptoKey,
      enc.encode(text)
    );

    // Convert to hex or base64 representation
    const encryptedArray = new Uint8Array(encryptedBuffer);
    let encryptedStr = "";
    encryptedArray.forEach(b => encryptedStr += b.toString(16).padStart(2, "0"));
    
    let ivStr = "";
    iv.forEach(b => ivStr += b.toString(16).padStart(2, "0"));

    return {
      ciphertext: encryptedStr,
      iv: ivStr,
      encrypted: true
    };
  } catch (err) {
    console.error("[Chamber] Encryption failed:", err);
    throw new Error("Encryption failed: " + err.message);
  }
}

// Media Fallback Gateway - Fetch image from cache and upload to Imgur/R2
async function uploadToFallbackStorage(fbCdnUrl, config) {
  if (!fbCdnUrl) return "";
  try {
    console.log(`[Chamber] Fetching media from cache: ${fbCdnUrl}`);
    // Fetch with force-cache to hit local memory/disk cache without using fresh data usage
    const response = await fetch(fbCdnUrl, { cache: "force-cache" });
    const blob = await response.blob();

    console.log(`[Chamber] Media Blob extracted. Size: ${blob.size} bytes. Initiating fallback upload...`);
    
    // Imgur API Upload Implementation
    if (config.imgurClientId && config.imgurClientId !== "mock_imgur_id") {
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
      // Mock Cloudflare R2 Upload Flow for MVP / Testing
      console.log("[Chamber] Mocking Cloudflare R2 upload gateway...");
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate delay
      const mockBackupUrl = `https://r2-backup.chamber.network/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      console.log(`[Chamber] Fallback upload succeeded (Mock R2): ${mockBackupUrl}`);
      return mockBackupUrl;
    }
  } catch (err) {
    console.error("[Chamber] Media fallback upload failed:", err);
    return ""; // Return empty fallback URL if failed
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
  const fbUserId = postData.fbUserId || postData.fb_user_id || null;
  const config = await getExtensionConfig(fbUserId);
  console.log(`[Chamber] Processing backup task (Historic: ${isHistoric})`);
  const userId = fbUserId || "default";
  const prefix = `user_${userId}_`;
  const mappingData = await new Promise((resolve) => {
    chrome.storage.local.get(
      [
        prefix + "identityAlias",
        prefix + "identityPlatform",
        prefix + "identityDisplayName",
        prefix + "identityActorType",
        prefix + "identityActorId",
      ],
      resolve
    );
  });

  // 1. Perform off-chain media fallback upload (image to Imgur/R2)
  let fallbackUrls = [];
  const mediaUrls = postData.mediaUrls || [];
  for (const url of mediaUrls.slice(0, 5)) {
    if (url && url.startsWith("http")) {
      const fallback = await uploadToFallbackStorage(url, config);
      if (fallback) fallbackUrls.push(fallback);
    }
  }

  // 2. Build API payload (custodial mode — server handles wallet signing)
  const apiPayload = {
    fbUserId: fbUserId,
    content: postData.textContent || postData.content || "",
    platform: mappingData[prefix + "identityPlatform"] || postData.platform || "facebook",
    mediaUrls: fallbackUrls.length > 0 ? fallbackUrls : mediaUrls,
    privacy: postData.privacy || "PUBLIC",
    timestamp: postData.timestamp || Math.floor(Date.now() / 1000),
    // If user has bound a wallet, include it for the binding claim
    boundWallet: config.boundWalletAddress || null,
    sourceUrl: postData.sourceUrl || null,
    identityAlias: mappingData[prefix + "identityAlias"] || null,
    identityDisplayName: mappingData[prefix + "identityDisplayName"] || null,
    identityActorType: mappingData[prefix + "identityActorType"] || "personal",
    identityActorId: mappingData[prefix + "identityActorId"] || fbUserId || "default",
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
  };
}

// Listen to requests from content.js or popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
