/**
 * content.js - Chamber Protocol Content Script
 * 
 * Injected into Facebook pages. Performs DOM monitoring, appends the backup buttons,
 * scrapes historical post data, and relays intercepted GraphQL events to background.js.
 */

const CHAMBER_DEV_ERROR_ENDPOINT = "https://studio.milkcat.org/chamber-api/dev-errors";
if (globalThis.ChamberI18n?.init) {
  globalThis.ChamberI18n.init().catch(() => {});
}
const t = (key, variables) => globalThis.ChamberI18n?.t?.(key, variables) || key;

function reportChamberError(error, context = "content") {
  fetch(CHAMBER_DEV_ERROR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: context,
      message: String(error?.message || error || "Unknown error").slice(0, 2000),
      stack: String(error?.stack || "").slice(0, 6000),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest().version
    }),
    keepalive: true
  }).catch(() => {});
}

function webAuthnBase64UrlToBuffer(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
}

function webAuthnBufferToBase64Url(value) {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createNativePasskey(optionsJSON) {
  if (!navigator.credentials?.create) throw new Error(t("passkey.unsupported"));
  const publicKey = {
    ...optionsJSON,
    challenge: webAuthnBase64UrlToBuffer(optionsJSON.challenge),
    user: { ...optionsJSON.user, id: webAuthnBase64UrlToBuffer(optionsJSON.user.id) },
    excludeCredentials: optionsJSON.excludeCredentials?.map((credential) => ({
      ...credential,
      id: webAuthnBase64UrlToBuffer(credential.id)
    }))
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException(t("passkey.createTimeout"), "AbortError")), 60_000);
  try {
    const credential = await navigator.credentials.create({ publicKey, signal: controller.signal });
    if (!credential) throw new Error(t("passkey.createIncomplete"));
    const response = credential.response;
    const result = {
      id: credential.id,
      rawId: webAuthnBufferToBase64Url(credential.rawId),
      response: {
        attestationObject: webAuthnBufferToBase64Url(response.attestationObject),
        clientDataJSON: webAuthnBufferToBase64Url(response.clientDataJSON),
        transports: typeof response.getTransports === "function" ? response.getTransports() : []
      },
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment || undefined
    };
    if (typeof response.getPublicKeyAlgorithm === "function") {
      try { result.response.publicKeyAlgorithm = response.getPublicKeyAlgorithm(); } catch (_) {}
    }
    if (typeof response.getPublicKey === "function") {
      try {
        const publicKeyBytes = response.getPublicKey();
        if (publicKeyBytes) result.response.publicKey = webAuthnBufferToBase64Url(publicKeyBytes);
      } catch (_) {}
    }
    if (typeof response.getAuthenticatorData === "function") {
      try { result.response.authenticatorData = webAuthnBufferToBase64Url(response.getAuthenticatorData()); } catch (_) {}
    }
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authenticateNativePasskey(optionsJSON) {
  if (!navigator.credentials?.get) throw new Error(t("passkey.unsupported"));
  const publicKey = {
    ...optionsJSON,
    challenge: webAuthnBase64UrlToBuffer(optionsJSON.challenge),
    allowCredentials: optionsJSON.allowCredentials?.map((credential) => ({
      ...credential,
      id: webAuthnBase64UrlToBuffer(credential.id)
    }))
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException(t("passkey.verifyTimeout"), "AbortError")), 60_000);
  try {
    const credential = await navigator.credentials.get({ publicKey, signal: controller.signal });
    if (!credential) throw new Error(t("passkey.verifyIncomplete"));
    const response = credential.response;
    return {
      id: credential.id,
      rawId: webAuthnBufferToBase64Url(credential.rawId),
      response: {
        authenticatorData: webAuthnBufferToBase64Url(response.authenticatorData),
        clientDataJSON: webAuthnBufferToBase64Url(response.clientDataJSON),
        signature: webAuthnBufferToBase64Url(response.signature),
        userHandle: response.userHandle ? webAuthnBufferToBase64Url(response.userHandle) : undefined
      },
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment || undefined
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

window.addEventListener("error", (event) => {
  const source = String(event.filename || "");
  if (source.startsWith("chrome-extension://") || source.includes("extension")) {
    reportChamberError(event.error || event.message, "content:error");
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const source = String(event.reason?.stack || event.reason?.fileName || "");
  if (source.includes("chrome-extension://") || source.includes("extension")) {
    reportChamberError(event.reason, "content:unhandledrejection");
  }
});

// 1. Inject inject.js into the page's main context
function injectNetworkHook() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject.js");
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.error("[Chamber] Injection of GraphQL hook failed:", err);
  }
}
injectNetworkHook();
// Global variables for active user context from inject.js
let currentFbUserId = null;
let currentFbAccountId = null;
let lastDomDiagnosticAt = 0;

// Helper to extract currently logged-in Facebook User ID
function getFacebookUserId() {
  try {
    const match = document.cookie.match(/c_user=(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {
    console.debug("[Chamber] Failed to read c_user cookie:", e);
  }
  return null;
}

// Track and isolate active Facebook User ID in storage for wallet mapping
const initialFbUserId = getFacebookUserId();
if (initialFbUserId) {
  chrome.storage.local.set({ lastFbUserId: initialFbUserId });
}

// Check if the post belongs to the current user/page to prevent stealing
function isOwnPost(article) {
  try {
    const authorLinkEl = article.querySelector('h2 a[role="link"]') || 
                         article.querySelector('h2 a') || 
                         article.querySelector('a[role="link"]');
    if (!authorLinkEl) return false;

    const authorLinks = Array.from(article.querySelectorAll('a[role="link"], a[href]'));
    const authorHref = authorLinkEl.href || "";
    
    // Resolve active user/page ID
    const cUser = getFacebookUserId();
    const activeId = currentFbAccountId || currentFbUserId || cUser;

    if (!activeId) {
      // If we cannot resolve identity, fallback to true to avoid blocking backups
      return true; 
    }

    // 1. Direct ID match in URL
    if (authorHref.includes(activeId) || authorLinks.some((link) => (link.href || "").includes(activeId))) {
      return true;
    }

    // 2. Data hovercard ID match
    const hovercard = authorLinkEl.getAttribute('data-hovercard') || "";
    if (hovercard.includes(activeId)) {
      return true;
    }

    // 3. Current URL matching (timeline owner check)
    const currentUrl = window.location.href;
    if (currentUrl.includes("/profile.php?id=" + activeId) || currentUrl.includes("/" + activeId)) {
      return true;
    }

    // On a vanity profile URL (for example /idiotforg), Facebook often omits
    // the numeric author ID from article links. Treat posts on a profile page
    // as belonging to that profile; feed pages remain author-link guarded.
    const profilePath = window.location.pathname.split("/").filter(Boolean)[0] || "";
    const nonProfilePaths = new Set([
      "home", "watch", "groups", "marketplace", "notifications", "messages",
      "reels", "search", "gaming", "events", "friends", "story.php"
    ]);
    if (profilePath && !nonProfilePaths.has(profilePath) && !window.location.pathname.startsWith("/profile.php")) {
      return true;
    }

    return false;
  } catch (err) {
    console.debug("[Chamber] isOwnPost validation failed:", err);
    return true; // Fallback to avoid breaking
  }
}

// 2. Listen to postMessages from inject.js or Echo portal
window.addEventListener("message", (event) => {
  // Guard clause for safety and origin validation
  if (event.source !== window) return;

  // Handle Echo Portal requests for active wallet info
  if (event.data && event.data.source === "echo-portal" && event.data.type === "GET_EXTENSION_WALLET") {
    if (location.origin !== "https://studio.milkcat.org") return;
    chrome.runtime.sendMessage({
      action: "GET_ACTIVE_WALLET_INFO"
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Chamber] Background unreachable for wallet query:", chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success && response.walletAddress) {
        window.postMessage({
          source: "chamber-extension",
          type: "EXTENSION_WALLET_RESPONSE",
          requestId: event.data.requestId || "",
          walletAddress: response.walletAddress,
          identityAlias: response.identityAlias || "",
          identityDisplayName: response.identityDisplayName || response.identityAlias || "",
          sharingPublicKey: response.sharingPublicKey || null,
          sharingKeyId: response.sharingKeyId || "",
          accessCapability: response.accessCapability || ""
        }, "https://studio.milkcat.org");
      }
    });
    return;
  }

  // Handle Echo Portal requests for available profiles
  if (event.data && event.data.source === "echo-portal" && event.data.type === "GET_EXTENSION_PROFILES") {
    if (location.origin !== "https://studio.milkcat.org") return;
    chrome.runtime.sendMessage({
      action: "GET_AVAILABLE_PROFILES"
    }, (response) => {
      if (chrome.runtime.lastError) return;
      window.postMessage({
        source: "chamber-extension",
        type: "EXTENSION_PROFILES_RESPONSE",
        requestId: event.data.requestId || "",
        profiles: response?.profiles || [],
        activeProfileId: response?.activeProfileId || ""
      }, "https://studio.milkcat.org");
    });
    return;
  }

  if (event.data && event.data.source === "echo-portal" && event.data.type === "DECRYPT_ECHO_CONTENT") {
    if (location.origin !== "https://studio.milkcat.org") return;
    chrome.runtime.sendMessage({
      action: "DECRYPT_OWNER_DATA",
      ciphertext: event.data.ciphertext || "",
      iv: event.data.iv || "",
      mode: event.data.mode || "text",
      ownerKeyEnvelope: event.data.ownerKeyEnvelope || null,
      recipientKeyEnvelope: event.data.recipientKeyEnvelope || null
    }, (response) => {
      if (chrome.runtime.lastError) return;
      window.postMessage({
        source: "chamber-extension",
        type: "DECRYPT_ECHO_CONTENT_RESPONSE",
        requestId: event.data.requestId || "",
        success: Boolean(response?.success),
        plaintext: response?.plaintext || "",
        data: response?.data || "",
        error: response?.error || ""
      }, "https://studio.milkcat.org");
    });
    return;
  }

  if (event.data && event.data.source === "echo-portal" && event.data.type === "CREATE_ECHO_READING_GRANT") {
    if (location.origin !== "https://studio.milkcat.org") return;
    chrome.runtime.sendMessage({
      action: "CREATE_RECIPIENT_GRANT",
      ownerKeyEnvelope: event.data.ownerKeyEnvelope || null,
      recipientPublicKey: event.data.recipientPublicKey || null,
      recipientKeyId: event.data.recipientKeyId || ""
    }, (response) => {
      if (chrome.runtime.lastError) return;
      window.postMessage({
        source: "chamber-extension",
        type: "CREATE_ECHO_READING_GRANT_RESPONSE",
        requestId: event.data.requestId || "",
        success: Boolean(response?.success),
        recipientKeyEnvelope: response?.recipientKeyEnvelope || null,
        error: response?.error || ""
      }, "https://studio.milkcat.org");
    });
    return;
  }

  const nativePasskeyActions = {
    NATIVE_PASSKEY_REGISTER: createNativePasskey,
    NATIVE_PASSKEY_AUTHENTICATE: authenticateNativePasskey
  };
  if (event.data && event.data.source === "echo-portal" && nativePasskeyActions[event.data.type]) {
    if (location.origin !== "https://studio.milkcat.org") return;
    const responseType = `${event.data.type}_RESPONSE`;
    nativePasskeyActions[event.data.type](event.data.optionsJSON || {})
      .then((credential) => {
        window.postMessage({
          source: "chamber-extension",
          type: responseType,
          requestId: event.data.requestId || "",
          success: true,
          credential
        }, "https://studio.milkcat.org");
      })
      .catch((error) => {
        reportChamberError(error, `content:${event.data.type.toLowerCase()}`);
        window.postMessage({
          source: "chamber-extension",
          type: responseType,
          requestId: event.data.requestId || "",
          success: false,
          error: error?.name === "AbortError" ? t("passkey.canceled") : String(error?.message || error)
        }, "https://studio.milkcat.org");
      });
    return;
  }

  const recoveryActions = {
    PREPARE_RECOVERY_VAULT: "PREPARE_RECOVERY_VAULT_RESPONSE",
    FINALIZE_RECOVERY_VAULT: "FINALIZE_RECOVERY_VAULT_RESPONSE",
    CONFIRM_RECOVERY_VAULT: "CONFIRM_RECOVERY_VAULT_RESPONSE",
    RESTORE_RECOVERY_VAULT: "RESTORE_RECOVERY_VAULT_RESPONSE",
    GET_RECOVERY_VAULT_STATUS: "GET_RECOVERY_VAULT_STATUS_RESPONSE",
    RESTORE_RECOVERY_AB: "RESTORE_RECOVERY_AB_RESPONSE"
  };
  if (event.data && event.data.source === "echo-portal" && recoveryActions[event.data.type]) {
    if (location.origin !== "https://studio.milkcat.org") return;
    chrome.runtime.sendMessage({
      action: event.data.type,
      setId: event.data.setId || "",
      accountId: event.data.accountId || "",
      shareB: event.data.shareB || null,
      recoveryCodeC: event.data.recoveryCodeC || ""
    }, (response) => {
      window.postMessage({
        source: "chamber-extension",
        type: recoveryActions[event.data.type],
        requestId: event.data.requestId || "",
        ...(response || { success: false, error: chrome.runtime.lastError?.message || t("extension.noResponse") })
      }, "https://studio.milkcat.org");
    });
    return;
  }

  if (event.data && event.data.source === "chamber-graphql-interceptor") {
    // Check message type for user context
    if (event.data.type === "FB_USER_CONTEXT") {
      currentFbUserId = event.data.data.userId;
      currentFbAccountId = event.data.data.accountId;
      // Keep personal Facebook USER_ID stable for storage/mapping. ACCOUNT_ID
      // can differ between page/account contexts and would split one mapping
      // into multiple storage namespaces.
      const activeId = currentFbUserId || currentFbAccountId;
      if (activeId) {
        chrome.storage.local.set({
          lastFbUserId: activeId,
          lastFbAccountId: currentFbAccountId || ""
        });
      }
      console.log("[Chamber] Active FB user context loaded:", currentFbUserId, currentFbAccountId);
      return;
    }

    console.log("[Chamber] Content script received intercepted draft post:", event.data.data);
    const payload = event.data.data || {};
    payload.fbUserId = getFacebookUserId(); // Scrape and attach user ID
    
    // Forward directly to the background script
    chrome.runtime.sendMessage({
      action: "BACKUP_POST_DRAFT",
      payload: payload
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Chamber] Extension background script unreachable:", chrome.runtime.lastError.message);
      } else {
        console.log("[Chamber] Background script ACK auto-sync backup:", response);
      }
    });
  }
});

// 3. Inject CSS styles for the [🔒 備份至 Web3] Button
const styleTag = document.createElement("style");
styleTag.textContent = `
  .chamber-backup-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    margin-left: 10px;
    margin-top: 5px;
    margin-bottom: 5px;
    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2), 0 2px 4px -1px rgba(99, 102, 241, 0.1);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .chamber-backup-btn:hover {
    background: linear-gradient(135deg, #4f46e5, #4338ca);
    transform: translateY(-1px);
    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
  }
  .chamber-backup-btn:active {
    transform: translateY(0);
  }
  .chamber-btn-container {
    display: flex;
    align-items: center;
    margin: 5px 16px;
  }
  .chamber-action-slot {
    display: inline-flex;
    align-items: center;
    margin: 0 4px;
  }
  .chamber-action-slot .chamber-backup-btn {
    margin: 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: transparent;
    color: #65676b;
    box-shadow: none;
    white-space: nowrap;
    font-size: 13px;
  }
  .chamber-action-slot .chamber-backup-btn:hover {
    background: #f0f2f5;
    color: #1877f2;
    transform: none;
    box-shadow: none;
  }
`;
document.head.appendChild(styleTag);

// 4. Inject manual backup button on historic posts
function getFacebookPostData(postEl) {
  // Try to locate text content using common Facebook article structures
  // - Message block: div[data-ad-preview="message"], div[data-testid="post_message"]
  // - Fallbacks: div[dir="auto"] inside posts
  let textContent = "";
  const msgEl = postEl.querySelector('div[data-ad-preview="message"]') ||
                postEl.querySelector('div[data-testid="post_message"]') ||
                postEl.querySelector('div[data-ad-comet-preview="message"]') ||
                Array.from(postEl.querySelectorAll('div[dir="auto"]')).find((el) => {
                  const owner = el.closest('div[role="article"]');
                  return owner === postEl;
                });
  if (msgEl) {
    textContent = msgEl.innerText || msgEl.textContent || "";
  }

  // Find images containing fbcdn urls or standard image blocks
  let primaryFbCdn = "";
  const imgEl = Array.from(postEl.querySelectorAll('img[src*="fbcdn.net"]')).find((el) => {
    return el.closest('div[role="article"]') === postEl;
  });
  if (imgEl) {
    primaryFbCdn = imgEl.src;
  }

  // Find video elements if available
  let videoEl = postEl.querySelector('video');
  if (videoEl && videoEl.src) {
    primaryFbCdn = videoEl.src; // Using video source url
  }

  // Try to find the post permalink
  let postUrl = "";
  const linkEl = postEl.querySelector('a[href*="/posts/"]') || 
                 postEl.querySelector('a[href*="/permalink.php"]') || 
                 postEl.querySelector('a[href*="/permalink/"]') || 
                 postEl.querySelector('a[href*="story_fbid="]') ||
                 postEl.querySelector('a[href*="/photos/"]') ||
                 postEl.querySelector('a[href*="/videos/"]');
  if (linkEl && linkEl.href) {
    // Clean up query parameters if possible to keep it neat
    try {
      const parsedUrl = new URL(linkEl.href);
      // Keep only key post identificators if relevant
      postUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;
    } catch {
      postUrl = linkEl.href;
    }
  }

  // Generate metadata
  const timestamp = Math.floor(Date.now() / 1000); // Scraped timestamp

  return {
    textContent,
    media: {
      primary_fb_cdn: primaryFbCdn,
      fallback_backup: ""
    },
    timestamp,
    sourceUrl: postUrl || ""
  };
}

function findPostActionRow(article) {
  const candidates = [];
  const actionButtons = Array.from(article.querySelectorAll('[role="button"], button'));
  actionButtons.forEach((button) => {
    let node = button.parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const text = (node.innerText || node.textContent || "").trim();
      const hasLike = /讚|Like/i.test(text);
      const hasComment = /留言|評論|Comment/i.test(text);
      const hasShare = /分享|Share/i.test(text);
      if (hasLike && hasComment && hasShare) {
        candidates.push({ node, depth });
      }
    }
  });
  candidates.sort((a, b) => a.depth - b.depth);
  return candidates[0]?.node || null;
}

function handleBackupClick(btn, postEl) {
  const data = getFacebookPostData(postEl);
  if (!data.textContent && !data.media.primary_fb_cdn) {
    alert(t("legacy.noPost"));
    return;
  }

  data.fbUserId = getFacebookUserId(); // Scrape and attach user ID

  btn.innerText = t("legacy.backingUp");
  btn.disabled = true;
  btn.style.background = "#9ca3af";

  chrome.runtime.sendMessage({
    action: "BACKUP_HISTORIC_POST",
    payload: data
  }, (response) => {
    if (chrome.runtime.lastError) {
      alert(t("legacy.backgroundUnavailable"));
      btn.innerText = t("legacy.backup");
      btn.disabled = false;
      btn.style.background = "linear-gradient(135deg, #6366f1, #4f46e5)";
    } else if (response && response.success) {
      btn.innerText = t("legacy.backedUp");
      btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
      const echoUrl = response.echoUrl || "";
      if (echoUrl && btn.parentElement && !btn.parentElement.querySelector(".chamber-echo-link")) {
        const link = document.createElement("a");
        link.className = "chamber-echo-link";
        link.href = echoUrl.startsWith("http") ? echoUrl : `https://studio.milkcat.org${echoUrl}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = t("legacy.viewEcho");
        link.style.cssText = "display:block;margin-top:4px;color:#93c5fd;font-size:11px;text-decoration:underline;";
        btn.parentElement.appendChild(link);
      }
      console.log("[Chamber] Historic post successfully processed:", response.txId);
    } else {
      alert(t("legacy.failed", { error: response ? response.error : t("legacy.unknownError") }));
      btn.innerText = t("legacy.backup");
      btn.disabled = false;
      btn.style.background = "linear-gradient(135deg, #6366f1, #4f46e5)";
    }
  });
}

function processDOM() {
  // Inline controls are intentionally disabled in v0.2.0. Historical backup
  // is controlled from the Chamber side panel, outside Facebook's DOM.
  return;

  // Scan for typical Facebook timeline articles / posts containers
  const articles = document.querySelectorAll('div[role="article"]');
  let ownCount = 0;
  let injectedCount = 0;
  articles.forEach((article) => {
    // Check if we already injected a button for this article to prevent duplication
    if (article.dataset.chamberInjected) return;
    // Nested role=article nodes are Facebook comments/replies, not posts.
    if (article.parentElement?.closest('div[role="article"]')) return;

    // 1. Exclude obvious comment/reply blocks while keeping post cards broad enough
    const hasPostContent = article.querySelector('div[data-ad-preview="message"], div[data-testid="post_message"], div[data-ad-comet-preview="message"], img, video');
    if (!hasPostContent) return;

    const heading = article.querySelector('div[data-testid="UserContentHeader"]') ||
                    article.querySelector('h2') ||
                    article.querySelector('h3') ||
                    article.querySelector('a[role="link"]');

    // 2. Exclude other users' posts to prevent abuse/stealing
    if (!isOwnPost(article)) return;
    ownCount++;

    article.dataset.chamberInjected = "true";
    injectedCount++;

    const container = document.createElement("div");
    const actionRow = findPostActionRow(article);
    container.className = actionRow ? "chamber-action-slot" : "chamber-btn-container";

    const btn = document.createElement("button");
    btn.className = "chamber-backup-btn";
    btn.innerHTML = `
      <svg style="margin-right: 4px;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      ${t("legacy.backup").replace(/^🔒\s*/, "")}
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleBackupClick(btn, article);
    });

    container.appendChild(btn);
    if (actionRow) {
      actionRow.appendChild(container);
    } else if (heading?.parentNode) {
      heading.parentNode.insertBefore(container, heading.nextSibling || null);
    } else {
      article.insertBefore(container, article.firstChild || null);
    }
  });

  if (articles.length > 0 && injectedCount === 0 && Date.now() - lastDomDiagnosticAt > 5000) {
    lastDomDiagnosticAt = Date.now();
    reportChamberError({
      message: "No historic backup button injected",
      stack: JSON.stringify({
        articleCount: articles.length,
        ownCount,
        userId: getFacebookUserId(),
        url: window.location.href
      })
    }, "content:dom-scan");
  }
}

function getCurrentPostForSidePanel() {
  const candidates = Array.from(document.querySelectorAll('div[role="article"]'))
    .filter((article) => !article.parentElement?.closest('div[role="article"]'))
    .filter((article) => {
      const rect = article.getBoundingClientRect();
      const hasContent = article.querySelector('div[data-ad-preview="message"], div[data-testid="post_message"], div[data-ad-comet-preview="message"], img, video');
      return Boolean(hasContent) && rect.bottom > 0 && rect.top < window.innerHeight;
    });

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const aCenter = (aRect.top + aRect.bottom) / 2;
    const bCenter = (bRect.top + bRect.bottom) / 2;
    return Math.abs(aCenter - window.innerHeight / 2) - Math.abs(bCenter - window.innerHeight / 2);
  });

  const data = getFacebookPostData(candidates[0]);
  if (!data.textContent && !data.media.primary_fb_cdn) return null;
  data.fbUserId = getFacebookUserId();
  return data;
}

function listVisiblePostsForSidePanel() {
  return Array.from(document.querySelectorAll('div[role="article"]'))
    .filter((article) => !article.parentElement?.closest('div[role="article"]'))
    .filter((article) => {
      const rect = article.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight &&
        article.querySelector('div[data-ad-preview="message"], div[data-testid="post_message"], div[data-ad-comet-preview="message"], img, video');
    })
    .map((article) => getFacebookPostData(article))
    .filter((post) => post.textContent || post.media.primary_fb_cdn)
    .slice(0, 10);
}

// 5. Initialize MutationObserver to watch for dynamically loaded feed articles
const observer = new MutationObserver((mutations) => {
  processDOM();
});

// Start observing the page body
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Run initial DOM parse
setTimeout(processDOM, 3000);

// 6. Listen to messages from popup.js for composer auto-fill automation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_CURRENT_POST") {
    const payload = getCurrentPostForSidePanel();
    sendResponse(payload
      ? { success: true, payload }
      : { success: false, error: t("facebook.outerPostMissing") });
    return false;
  }
  if (request.action === "LIST_VISIBLE_POSTS") {
    sendResponse({ success: true, posts: listVisiblePostsForSidePanel() });
    return false;
  }
  if (request.action === "OPEN_FB_COMPOSER_AND_FILL") {
    handleOpenComposerAndFill(request.payload.text, request.payload.imageUrl);
    sendResponse({ success: true });
    return true;
  }
});

function isCommentOrCoverElement(el) {
  if (!el) return true;
  const text = [
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('title'),
    el.getAttribute('data-tooltip-content'),
    el.className,
    el.innerText || el.textContent
  ].filter(Boolean).join(" ").toLowerCase();

  return /封面|cover|大頭貼|avatar|profile picture|相片編輯|edit cover|更新相片|更新封面|留言|回覆|comment|reply|留個言吧|輸入留言|search|搜尋|通知|notification|選單|menu/i.test(text);
}

function findComposerButton() {
  const composerRegex = /在想些什麼|你在想些什麼|What's on your mind|What is on your mind|Create a post|建立貼文|建立公開貼文|建立貼文…|撰寫貼文|寫些什麼|發佈貼文|開始發文|Share what's on your mind|分享你的想法|分享近況|Write something/i;

  // 1. Search inside explicit feed/profile composer pagelets
  const composerPagelets = document.querySelectorAll('div[data-pagelet="ProfileComposer"], div[data-pagelet="FeedComposer"], div[data-pagelet*="Composer"]');
  for (const pagelet of composerPagelets) {
    const candidates = pagelet.querySelectorAll('div[role="button"], div[role="textbox"], span, a, button');
    for (const c of candidates) {
      const label = (c.getAttribute('aria-label') || c.getAttribute('placeholder') || c.innerText || c.textContent || '').trim();
      if (composerRegex.test(label) && !isCommentOrCoverElement(c)) {
        if (c.offsetWidth > 0 || c.offsetHeight > 0) {
          return c.closest('div[role="button"]') || c;
        }
      }
    }
    // If pagelet itself has a primary clickable role="button" that is NOT cover/comment
    const primaryBtn = pagelet.querySelector('div[role="button"]');
    if (primaryBtn && !isCommentOrCoverElement(primaryBtn) && (primaryBtn.offsetWidth > 0 || primaryBtn.offsetHeight > 0)) {
      return primaryBtn;
    }
  }

  // 2. Search inside main area with strict label matching
  const main = document.querySelector('div[role="main"]') || document;
  const elements = main.querySelectorAll('[aria-label], [placeholder], span, p');
  for (const el of elements) {
    const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.textContent || '').trim();
    if (label && composerRegex.test(label) && !isCommentOrCoverElement(el)) {
      const btn = el.closest('div[role="button"]') || el.closest('button') || el;
      if (btn && !isCommentOrCoverElement(btn) && (btn.offsetWidth > 0 || btn.offsetHeight > 0)) {
        return btn;
      }
    }
  }

  return null;
}

function getActiveComposerDialog() {
  const dialogs = document.querySelectorAll('div[role="dialog"]');
  for (const dialog of dialogs) {
    const label = [
      dialog.getAttribute('aria-label'),
      dialog.innerText || ""
    ].join(" ");
    if (/建立貼文|Create post|Create a post|在想些什麼|發佈|Post/i.test(label) && !/編輯封面|封面相片|大頭貼/i.test(label)) {
      return dialog;
    }
    if (dialog.querySelector('div[role="textbox"]') && !isCommentOrCoverElement(dialog)) {
      return dialog;
    }
  }
  return null;
}

function getActiveComposerTextbox() {
  const dialog = getActiveComposerDialog();
  if (dialog) {
    const box = dialog.querySelector('div[role="textbox"]');
    if (box && !isCommentOrCoverElement(box)) return box;
  }
  return null;
}

function findPhotoBtn(container) {
  const scope = container || getActiveComposerDialog();
  if (!scope) return null;
  const buttons = scope.querySelectorAll('div[role="button"], button, [aria-label], i');
  for (const btn of buttons) {
    const label = [
      btn.getAttribute('aria-label'),
      btn.getAttribute('title'),
      btn.getAttribute('data-tooltip-content'),
      btn.innerText || ""
    ].filter(Boolean).join(" ");
    if (/相片|照片|影片|Photo|Video/i.test(label) && !/封面|cover|大頭貼|avatar/i.test(label)) {
      return btn.closest('div[role="button"]') || btn;
    }
  }
  return null;
}

function findFileInput(container) {
  const scope = container || getActiveComposerDialog();
  if (scope) {
    const input = scope.querySelector('input[type="file"][accept*="image"]') || scope.querySelector('input[type="file"]');
    if (input) return input;
  }
  return null;
}

function waitForFileInput(container, timeoutMs = 4000) {
  const existing = findFileInput(container);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      const input = findFileInput(container);
      if (input || Date.now() - startedAt >= timeoutMs) {
        resolve(input || null);
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

function triggerUpload(fileInput, blob) {
  try {
    const file = new File([blob], "chamber-reborn-card.png", { type: "image/png" });
    const container = new DataTransfer();
    container.items.add(file);
    fileInput.files = container.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log("[Chamber] Reborn card image auto-uploaded successfully.");
  } catch (err) {
    console.error("[Chamber] Auto-upload file trigger failed:", err);
  }
}

function activateElement(el) {
  if (!el) return;
  const options = { bubbles: true, cancelable: true, view: window };
  try {
    el.dispatchEvent(new MouseEvent("mousedown", options));
    el.dispatchEvent(new MouseEvent("mouseup", options));
    el.dispatchEvent(new MouseEvent("click", options));
  } catch (err) {
    console.debug("[Chamber] Synthetic mouse events failed, falling back to click():", err);
    el.click();
  }
}

function fillText(textbox, text) {
  if (!textbox) return;
  textbox.focus();

  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textbox);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (selectErr) {
    console.debug("[Chamber] Failed to set selection range:", selectErr);
  }

  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);

  // Convert newlines to HTML blocks so Draft.js/React rich editor preserves layout
  const escapeHtml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const htmlText = text
    .split("\n")
    .map(line => line === "" ? "<br>" : `<div style="margin: 0; line-height: 1.35;">${escapeHtml(line)}</div>`)
    .join("");

  let ok = false;
  try {
    ok = document.execCommand('insertHTML', false, htmlText);
  } catch (_) {}
  if (!ok || !textbox.textContent.trim()) {
    try {
      document.execCommand('insertText', false, text);
    } catch (_) {}
  }

  textbox.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
  textbox.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  console.log("[Chamber] Auto-filled composer textbox with layout preserved.");
}

function fillTextAndImage(textbox, text, imageUrl) {
  const dialog = getActiveComposerDialog();
  fillText(textbox, text);

  if (!imageUrl) {
    return;
  }

  const restoreText = () => {
    const activeTextbox = getActiveComposerTextbox() || textbox;
    if (activeTextbox) {
      fillText(activeTextbox, text);
    }
  };

  fetch(imageUrl)
    .then(res => res.blob())
    .then(blob => {
      let fileInput = findFileInput(dialog);
      if (!fileInput) {
        const photoBtn = findPhotoBtn(dialog);
        if (photoBtn) {
          console.log("[Chamber] Photo mode not active, switching to photo mode...");
          activateElement(photoBtn);
          waitForFileInput(dialog).then((input) => {
            if (input) {
              triggerUpload(input, blob);
              setTimeout(restoreText, 400);
              setTimeout(restoreText, 900);
              setTimeout(restoreText, 1600);
              return;
            }
            console.warn("[Chamber] Photo file input did not render after click.");
            restoreText();
          });
        } else {
          console.warn("[Chamber] Photo button not found inside composer container.");
          restoreText();
        }
        return;
      }

      triggerUpload(fileInput, blob);
      setTimeout(restoreText, 400);
      setTimeout(restoreText, 900);
      setTimeout(restoreText, 1600);
    })
    .catch(err => {
      console.error("[Chamber] Failed to fetch image blob:", err);
      restoreText();
    });
}

function handleOpenComposerAndFill(text, imageUrl) {
  const textbox = getActiveComposerTextbox();
  if (textbox) {
    fillTextAndImage(textbox, text, imageUrl);
    return;
  }

  const btn = findComposerButton();
  if (btn) {
    console.log("[Chamber] Found composer button, clicking it...");
    activateElement(btn);

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const activeTextbox = getActiveComposerTextbox();
      if (activeTextbox) {
        clearInterval(interval);
        setTimeout(() => {
          fillTextAndImage(activeTextbox, text, imageUrl);
        }, 300);
      } else if (attempts > 30) {
        clearInterval(interval);
        console.warn("[Chamber] Failed to find composer textbox after clicking.");
      }
    }, 100);
  } else {
    console.warn("[Chamber] Could not locate any Facebook post composer button.");
    alert("已將轉世聲明與卡片圖檔複製至剪貼簿！請點擊發文框後按 Ctrl+V 貼上。");
  }
}

globalThis.ChamberFacebookPlatform = {
  openComposerAndFill: handleOpenComposerAndFill
};
