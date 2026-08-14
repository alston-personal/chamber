const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const pageUrlEl = document.getElementById("pageUrl");
const postListEl = document.getElementById("postList");
const selectButton = document.getElementById("selectButton");
const rebornButton = document.getElementById("rebornButton");
const declarationButton = document.getElementById("declarationButton");
const switchAccountButton = document.getElementById("switchAccountButton");
const profileSelect = document.getElementById("profileSelect");
const newProfileButton = document.getElementById("newProfileButton");
const backupView = document.getElementById("backupView");
const settingsView = document.getElementById("settingsView");
const rebornView = document.getElementById("rebornView");
const rebornText = document.getElementById("rebornText");
const rebornGenerate = document.getElementById("rebornGenerate");
const rebornBack = document.getElementById("rebornBack");
const rebornStatus = document.getElementById("rebornStatus");
const settingsAlias = document.getElementById("settingsAlias");
const settingsWallet = document.getElementById("settingsWallet");
const settingsCheck = document.getElementById("settingsCheck");
const settingsAliasStatus = document.getElementById("settingsAliasStatus");
const settingsSave = document.getElementById("settingsSave");
const settingsBack = document.getElementById("settingsBack");
const recoveryExport = document.getElementById("recoveryExport");
const recoveryStatus = document.getElementById("recoveryStatus");
const versionLabel = document.getElementById("versionLabel");
const languageSelect = document.getElementById("languageSelect");
const { t, formatDate } = ChamberI18n;
let selectedRefreshTimer = null;
let pickerTabId = null;

function renderVersion() {
  versionLabel.textContent = t("version.label", { version: chrome.runtime.getManifest().version });
}

function validationMessage(validation, payload) {
  const key = validation?.code === "AUTHOR_NOT_CONFIRMED" && payload?.isOwnAuthor === false
    ? "validation.NOT_OWNER"
    : `validation.${validation?.code || "CONTENT_REQUIRED"}`;
  return t(key);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function activeFacebookIdentity() {
  const tab = await getActiveTab();
  const cookie = tab?.url?.includes("facebook.com")
    ? await chrome.cookies.get({ url: tab.url, name: "c_user" })
    : null;
  if (!cookie?.value) throw new Error(t("error.loginFacebook"));
  return { userId: cookie.value, prefix: `user_${cookie.value}_` };
}

async function ensureNativeOwnerKey(userId) {
  const prefix = `user_${userId}_`;
  const keys = [prefix + "nativeWalletAddress", prefix + "nativeWalletPrivateKey"];
  const data = await chrome.storage.local.get(keys);
  let address = data[keys[0]];
  let secret = data[keys[1]];
  const update = {};
  if (!/^0x[0-9a-f]{40}$/i.test(String(address || ""))) {
    address = `0x${bytesToHex(crypto.getRandomValues(new Uint8Array(20)))}`;
    update[keys[0]] = address;
  }
  if (!/^[0-9a-f]{64}$/i.test(String(secret || ""))) {
    secret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    update[keys[1]] = secret;
  }
  if (Object.keys(update).length) await chrome.storage.local.set(update);
  return { address, secret };
}

async function refreshRecoveryStatus() {
  try {
    const { prefix } = await activeFacebookIdentity();
    const data = await chrome.storage.local.get([prefix + "recoveryExportedAt", prefix + "recoveryLocalShare", prefix + "recoveryExportConfirmedVersion"]);
    recoveryStatus.textContent = data[prefix + "recoveryExportedAt"] && data[prefix + "recoveryLocalShare"] && data[prefix + "recoveryExportConfirmedVersion"] === "2-of-3-vault-v1"
      ? t("recovery.complete", { date: formatDate(data[prefix + "recoveryExportedAt"], { dateStyle: "medium", timeStyle: "short" }) })
      : t("recovery.incomplete");
  } catch (error) {
    recoveryStatus.textContent = error.message;
  }
}

// MVP deliberately exposes one identity only. Profile storage remains for
// forward compatibility, but switching/creating accounts is deferred.
if (newProfileButton) newProfileButton.style.display = "none";

function profileId() {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getActiveProfile() {
  const tab = await getActiveTab();
  const cookie = tab?.url?.includes("facebook.com")
    ? await chrome.cookies.get({ url: tab.url, name: "c_user" })
    : null;
  const userId = cookie?.value || "default";
  const prefix = `user_${userId}_`;
  const data = await chrome.storage.local.get([
    "chamberProfiles", "activeChamberProfileId", prefix + "identityAlias",
    prefix + "customWalletAddress", prefix + "nativeWalletAddress"
  ]);
  let profiles = Array.isArray(data.chamberProfiles) ? data.chamberProfiles : [];
  let activeId = data.activeChamberProfileId;
  if (!profiles.length) {
    const alias = data[prefix + "identityAlias"] || "";
    const wallet = data[prefix + "customWalletAddress"] || data[prefix + "nativeWalletAddress"] || "";
    const first = { id: profileId(), name: alias || t("account.defaultName"), alias, walletAddress: wallet, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    profiles = [first];
    activeId = first.id;
    await chrome.storage.local.set({ chamberProfiles: profiles, activeChamberProfileId: activeId });
  }
  if (!profiles.some((profile) => profile.id === activeId)) {
    activeId = profiles[0].id;
    await chrome.storage.local.set({ activeChamberProfileId: activeId });
  }
  const activeProfile = profiles.find((profile) => profile.id === activeId);
  if (activeProfile && !activeProfile.alias && cookie?.value) {
    try {
      const response = await fetch(`https://studio.milkcat.org/chamber-api/identity/by-actor?platform=facebook&actorId=${encodeURIComponent(cookie.value)}`);
      const identity = response.ok ? await response.json() : null;
      if (identity?.success && identity.alias) {
        activeProfile.alias = identity.alias;
        activeProfile.name = identity.displayName || identity.alias;
        activeProfile.walletAddress = identity.currentWallet || activeProfile.walletAddress || "";
        activeProfile.updatedAt = new Date().toISOString();
        await chrome.storage.local.set({ chamberProfiles: profiles });
      }
    } catch (_) {
      // Mapping restore is best-effort; the profile remains visibly unmapped.
    }
  }
  return { profiles, activeId };
}

async function renderProfiles() {
  if (!profileSelect) return;
  const { profiles, activeId } = await getActiveProfile();
  profileSelect.replaceChildren();
  profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.alias ? `${profile.name} · ${profile.alias}` : `${profile.name} · ${t("account.unmapped")}`;
    profileSelect.appendChild(option);
  });
  profileSelect.value = activeId;
  const active = profiles.find((profile) => profile.id === activeId);
  const mapped = Boolean(active?.alias);
  selectButton.disabled = !mapped;
  rebornButton.disabled = !mapped;
  selectButton.title = mapped ? t("account.selectTitle") : t("account.mappingRequiredTitle");
  if (!mapped) {
    setStatus(t("account.mappingRequired"), true);
  }
}

async function loadSettingsForm() {
  const state = await getActiveProfile();
  const profile = state.profiles.find((item) => item.id === state.activeId);
  const tab = await getActiveTab();
  const cookie = tab?.url?.includes("facebook.com")
    ? await chrome.cookies.get({ url: tab.url, name: "c_user" })
    : null;
  const prefix = `user_${cookie?.value || "default"}_`;
  const data = await chrome.storage.local.get([prefix + "identityAlias", prefix + "customWalletAddress"]);
  settingsAlias.value = profile?.alias || data[prefix + "identityAlias"] || "";
  settingsWallet.value = profile?.walletAddress || data[prefix + "customWalletAddress"] || "";
  await refreshRecoveryStatus();
}

recoveryExport?.addEventListener("click", async () => {
  try {
    const { prefix } = await activeFacebookIdentity();
    const data = await chrome.storage.local.get([prefix + "identityAlias", prefix + "lastEchoUrl"]);
    const alias = data[prefix + "identityAlias"] || "";
    const target = alias
      ? `https://studio.milkcat.org/echo/${encodeURIComponent(alias)}/fb?recovery=true`
      : (data[prefix + "lastEchoUrl"] || "https://studio.milkcat.org/echo");
    await chrome.tabs.create({ url: target });
  } catch (error) {
    recoveryStatus.textContent = t("recovery.openFailed", { error: error.message });
  }
});

function showSettings() {
  backupView.hidden = true;
  rebornView.hidden = true;
  settingsView.hidden = false;
  resultEl.replaceChildren();
  loadSettingsForm().catch((error) => { settingsAliasStatus.textContent = error.message; });
}

function showBackup() {
  settingsView.hidden = true;
  rebornView.hidden = true;
  backupView.hidden = false;
  loadPageInfo().catch(() => {});
}

async function showReborn() {
  const state = await getActiveProfile();
  const profile = state.profiles.find((item) => item.id === state.activeId);
  if (!profile?.alias) {
    showSettings();
    settingsAliasStatus.textContent = t("reborn.mappingRequired");
    return;
  }
  backupView.hidden = true;
  settingsView.hidden = true;
  rebornView.hidden = false;
  if (!rebornText.value.trim()) rebornText.value = ChamberDeclaration.getDefaultText();
  rebornStatus.textContent = t("reborn.identity", { alias: profile.alias });
}

declarationButton?.addEventListener("click", showSettings);
rebornButton?.addEventListener("click", () => showReborn().catch((error) => setStatus(error.message, true)));
settingsBack?.addEventListener("click", showBackup);
rebornBack?.addEventListener("click", showBackup);

rebornGenerate?.addEventListener("click", async () => {
  const text = rebornText.value.trim();
  if (!text) {
    rebornStatus.textContent = t("reborn.empty");
    return;
  }
  rebornGenerate.disabled = true;
  rebornGenerate.textContent = t("reborn.generating");
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url?.includes("facebook.com")) throw new Error(t("reborn.facebookRequired"));
    await activeFacebookIdentity();
    const state = await getActiveProfile();
    const profile = state.profiles.find((item) => item.id === state.activeId);
    if (!profile?.alias) throw new Error(t("reborn.aliasRequired"));
    const timelineUrl = `https://studio.milkcat.org/echo/${encodeURIComponent(profile.alias)}/fb`;
    const card = await ChamberDeclaration.generateCard({ timelineUrl, alias: profile.alias });

    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "image/png": card.blob,
      })]);
    } catch (_) {
      await navigator.clipboard.writeText(text);
    }

    await sendTabMessageWithRecovery(tab.id, {
      action: "OPEN_FB_COMPOSER_AND_FILL",
      payload: { text, imageUrl: card.dataUrl },
    });
    rebornStatus.textContent = t("reborn.success");
  } catch (error) {
    rebornStatus.textContent = t("reborn.failed", { error: error.message });
  } finally {
    rebornGenerate.disabled = false;
    rebornGenerate.textContent = t("reborn.generate");
  }
});
settingsCheck?.addEventListener("click", async () => {
  const alias = settingsAlias.value.trim();
  if (!alias) {
    settingsAliasStatus.textContent = t("alias.required");
    return;
  }
  settingsCheck.disabled = true;
  settingsAliasStatus.textContent = t("alias.checking");
  try {
    const url = new URL("https://studio.milkcat.org/chamber-api/identity/check");
    url.searchParams.set("alias", alias);
    if (settingsWallet.value.trim()) url.searchParams.set("walletAddress", settingsWallet.value.trim());
    const response = await fetch(url);
    const data = await response.json();
    settingsAliasStatus.textContent = data.available || data.ownedByRequester ? t("alias.available") : t("alias.taken");
  } catch (error) {
    settingsAliasStatus.textContent = t("alias.checkFailed", { error: error.message });
  } finally {
    settingsCheck.disabled = false;
  }
});

settingsSave?.addEventListener("click", async () => {
  const alias = settingsAlias.value.trim();
  if (!alias) { settingsAliasStatus.textContent = t("alias.required"); return; }
  settingsSave.disabled = true;
  settingsSave.textContent = t("alias.saving");
  try {
    const tab = await getActiveTab();
    const cookie = tab?.url?.includes("facebook.com")
      ? await chrome.cookies.get({ url: tab.url, name: "c_user" })
      : null;
    if (!cookie?.value) throw new Error(t("alias.facebookRequired"));
    const wallet = settingsWallet.value.trim();
    const checkUrl = new URL("https://studio.milkcat.org/chamber-api/identity/check");
    checkUrl.searchParams.set("alias", alias);
    if (wallet) checkUrl.searchParams.set("walletAddress", wallet);
    const checkResponse = await fetch(checkUrl);
    const check = await checkResponse.json();
    if (!check.success || (!check.available && !check.ownedByRequester)) throw new Error(t("alias.invalid"));
    const registerResponse = await fetch("https://studio.milkcat.org/chamber-api/identity/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias, platform: "facebook", actorType: "personal", actorId: cookie.value, displayName: alias, walletAddress: wallet || null, proof: "" })
    });
    const registered = await registerResponse.json();
    if (!registerResponse.ok || !registered.success) throw new Error(registered.error || t("alias.mappingSaveFailed"));
    const prefix = `user_${cookie.value}_`;
    const state = await getActiveProfile();
    const profile = state.profiles.find((item) => item.id === state.activeId);
    if (profile) {
      profile.name = alias; profile.alias = alias; profile.walletAddress = wallet; profile.updatedAt = new Date().toISOString();
    }
    await chrome.storage.local.set({
      [prefix + "identityAlias"]: alias,
      [prefix + "identityPlatform"]: "facebook",
      [prefix + "customWalletAddress"]: wallet,
      chamberProfiles: state.profiles
    });
    settingsAliasStatus.textContent = t("alias.mapped", { alias });
    await renderProfiles();
    showBackup();
  } catch (error) {
    settingsAliasStatus.textContent = error.message || t("alias.saveFailed");
  } finally {
    settingsSave.disabled = false;
    settingsSave.textContent = t("settings.save");
  }
});

switchAccountButton?.addEventListener("click", async () => {
  await chrome.storage.local.remove(["lastFbUserId", "lastFbAccountId"]);
  const tab = await getActiveTab();
  const cookie = tab?.url?.includes("facebook.com")
    ? await chrome.cookies.get({ url: tab.url, name: "c_user" })
    : null;
  if (cookie?.value) {
    await chrome.storage.local.set({ lastFbUserId: cookie.value });
  }
  resultEl.replaceChildren();
  postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("account.refreshed") }));
  setStatus(cookie?.value
    ? t("account.refreshHelp")
    : t("account.contextCleared"));
  await loadPageInfo();
});
const DEV_ERROR_ENDPOINT = "https://studio.milkcat.org/chamber-api/dev-errors";

function reportSidepanelEvent(source, details = {}) {
  const safeDetails = {
    ...details,
    extensionVersion: chrome.runtime.getManifest().version,
    url: details.url || pageUrlEl.textContent || "",
    timestamp: new Date().toISOString()
  };
  fetch(DEV_ERROR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      message: source,
      extensionVersion: chrome.runtime.getManifest().version,
      url: safeDetails.url,
      timestamp: safeDetails.timestamp,
      details: safeDetails
    }),
    keepalive: true
  }).catch(() => {});
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#fca5a5" : "#cbd5e1";
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function sendTabMessageWithRecovery(tabId, message) {
  try {
    return await sendTabMessage(tabId, message);
  } catch (error) {
    if (!/Receiving end does not exist|Could not establish connection/i.test(error.message)) {
      throw error;
    }
    // chrome://extensions Reload invalidates the old content-script context
    // in already-open tabs. Inject the current script and retry on demand.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return sendTabMessage(tabId, message);
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

async function cancelActivePicker() {
  const tabId = pickerTabId;
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.documentElement.removeAttribute("data-chamber-picker-session");
        document.dispatchEvent(new CustomEvent("chamber:cancel-picker"));
        globalThis.__chamberPickerCancel?.();
        document.querySelectorAll(".chamber-picker-banner").forEach((node) => node.remove());
        document.querySelectorAll(".chamber-picker-target").forEach((node) => node.classList.remove("chamber-picker-target"));
        document.getElementById("chamber-picker-style")?.remove();
        return { cancelled: true };
      }
    });
  } catch (_) {
    // The Facebook tab may have navigated while picker mode was active.
  }
}

document.addEventListener("keydown", (event) => {
  if (!pickerTabId || !(event.key === "Escape" || event.key === "Esc" || event.keyCode === 27)) return;
  event.preventDefault();
  cancelActivePicker();
}, true);

async function loadPageInfo() {
  const tab = await getActiveTab();
  pageUrlEl.textContent = tab?.url || t("page.unavailable");
  await renderProfiles();
}

async function backupPost(payload, button) {
  if (selectedRefreshTimer) { clearInterval(selectedRefreshTimer); selectedRefreshTimer = null; }
  button.disabled = true;
  setStatus(t("backup.inProgress"));
  reportSidepanelEvent("sidepanel:backup-start", {
    sourceUrl: payload.sourceUrl || "",
    contentLength: String(payload.textContent || payload.content || "").length,
    mediaCount: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.length : 0,
    hasPublishedAt: Boolean(payload.publishedAt)
  });
  try {
    const validation = ChamberMvpValidation.validateBackupPayload(payload);
    if (!validation.ok) throw new Error(validationMessage(validation, payload));
    const { userId, prefix } = await activeFacebookIdentity();
    await ensureNativeOwnerKey(userId);
    const profileState = await chrome.storage.local.get(["chamberProfiles", "activeChamberProfileId"]);
    const activeProfile = Array.isArray(profileState.chamberProfiles)
      ? profileState.chamberProfiles.find((profile) => profile.id === profileState.activeChamberProfileId)
      : null;
    if (activeProfile && !activeProfile.alias) {
      throw new Error(t("backup.accountUnmapped", { name: activeProfile.name }));
    }
    const recoveryState = await chrome.storage.local.get([prefix + "recoveryExportedAt", prefix + "recoveryLocalShare", prefix + "recoveryExportConfirmedVersion"]);
    const recoveryMissing = !recoveryState[prefix + "recoveryExportedAt"] || !recoveryState[prefix + "recoveryLocalShare"] || recoveryState[prefix + "recoveryExportConfirmedVersion"] !== "2-of-3-vault-v1";
    const result = await sendMessage({
      action: "BACKUP_HISTORIC_POST",
      payload
    });
    if (!result?.success) throw new Error(result?.error || t("backup.failed"));
    if (!result.txId || !result.arweaveUrl) {
      throw new Error(t("backup.missingTx"));
    }

    setStatus(recoveryMissing
      ? t("backup.successRecoveryPending")
      : t("backup.success"));
    reportSidepanelEvent("sidepanel:backup-success", {
      sourceUrl: payload.sourceUrl || "",
      txId: result.txId,
      arweaveUrl: result.arweaveUrl,
      echoUrl: result.echoUrl || "",
      contentLength: String(payload.textContent || payload.content || "").length,
      mediaCount: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.length : 0
    });
    button.textContent = t("backup.done");
    const focusedEchoUrl = (result.echoUrl || "").startsWith("http") ? result.echoUrl : `https://studio.milkcat.org${result.echoUrl || ""}`;
    const timelineEchoUrl = (() => {
      try {
        const url = new URL(focusedEchoUrl);
        url.searchParams.delete("post");
        return url.href;
      } catch (_) {
        return focusedEchoUrl;
      }
    })();
    const links = document.createElement("div");
    links.className = "result-links";
    const link = document.createElement("a");
    link.href = focusedEchoUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t("backup.viewPost");
    const timelineLink = document.createElement("a");
    timelineLink.href = timelineEchoUrl;
    timelineLink.target = "_blank";
    timelineLink.rel = "noopener noreferrer";
    timelineLink.textContent = t("backup.viewTimeline");
    links.append(link, timelineLink);
    if (recoveryMissing) {
      const recoveryNotice = document.createElement("div");
      recoveryNotice.className = "danger-note";
      recoveryNotice.textContent = t("backup.recoveryNotice");
      const recoveryButton = document.createElement("button");
      recoveryButton.type = "button";
      recoveryButton.className = "secondary-action";
      recoveryButton.textContent = t("backup.openRecovery");
      recoveryButton.addEventListener("click", async () => {
        try {
          const url = new URL(timelineEchoUrl);
          url.searchParams.set("recovery", "true");
          await chrome.tabs.create({ url: url.href });
        } catch (error) {
          recoveryNotice.textContent = t("recovery.openFailed", { error: error.message });
        }
      });
      links.append(recoveryNotice, recoveryButton);
    }
    const tx = document.createElement("div");
    tx.className = "post-meta";
    tx.textContent = t("backup.transactionCreated", { tx: result.txId.slice(0, 12) });
    resultEl.replaceChildren(links, tx);
  } catch (error) {
    reportSidepanelEvent("sidepanel:backup-error", {
      sourceUrl: payload.sourceUrl || "",
      error: error.message || String(error),
      contentLength: String(payload.textContent || payload.content || "").length,
      mediaCount: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.length : 0
    });
    setStatus(error.message || t("backup.failed"), true);
    button.disabled = false;
  } finally {
    if (button.textContent !== t("backup.done")) button.disabled = false;
  }
}

function watchSelectedPost(payload, button, textEl, tab) {
  if (selectedRefreshTimer) clearInterval(selectedRefreshTimer);
  let attempts = 0;
  selectedRefreshTimer = setInterval(async () => {
    attempts += 1;
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (pageUrl, sourceUrl, selectedText) => globalThis.ChamberFacebookPlatform?.refreshSelected?.(pageUrl, sourceUrl, selectedText) || null,
        args: [tab.url, payload.sourceUrl || "", payload.textContent || ""]
      });
      const refreshed = injected?.[0]?.result;
      if (!refreshed) return;
      const changed = refreshed.contentExpanded !== payload.contentExpanded ||
        refreshed.textContent !== payload.textContent ||
        refreshed.media?.primary_fb_cdn !== payload.media?.primary_fb_cdn ||
        refreshed.mediaUrls?.length !== payload.mediaUrls?.length;
      if (!changed) return;
      Object.assign(payload, refreshed);
      textEl.textContent = payload.textContent || t("post.selectedNoText");
      const validation = ChamberMvpValidation.validateBackupPayload(payload);
      if (validation.ok) {
        button.disabled = false;
        button.textContent = t("post.backupButton");
        button.onclick = () => backupPost(payload, button);
        setStatus(t("post.updated"), false);
        clearInterval(selectedRefreshTimer);
        selectedRefreshTimer = null;
      } else if (validation.code === "SOURCE_URL_REQUIRED") {
        button.disabled = true;
        button.textContent = t("post.missingPermalinkButton");
        setStatus(validationMessage(validation, payload), true);
        clearInterval(selectedRefreshTimer);
        selectedRefreshTimer = null;
      }
    } catch (_) {
      // The tab may be navigating or Facebook may temporarily replace the DOM.
    }
    if (attempts >= 120 && selectedRefreshTimer) {
      clearInterval(selectedRefreshTimer);
      selectedRefreshTimer = null;
    }
  }, 500);
}

async function loadPosts() {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes("facebook.com")) {
    postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("post.facebookOnly") }));
    return;
  }
  const profileState = await getActiveProfile();
  const activeProfile = profileState.profiles.find((profile) => profile.id === profileState.activeId);
  if (!activeProfile?.alias) {
    postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("post.mappingBeforeScan") }));
    await renderProfiles();
    return;
  }
  postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("post.scanning") }));
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const topLevelArticles = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink"], a[href*="story_fbid"], a[href*="/photos/"], a[href*="/videos/"]'))
          .filter((link) => !/[?&](comment_id|reply_comment_id)=/i.test(link.href))
          .map((link) => {
            let node = link;
            for (let i = 0; node && i < 20; i += 1, node = node.parentElement) {
              if (node.querySelector?.('div[data-ad-preview="message"], div[data-testid="post_message"], div[data-ad-comet-preview="message"]')) return node;
            }
            return null;
          })
          .filter(Boolean)
          .filter((article, index, all) => all.indexOf(article) === index)
          .filter((article) => {
            const rect = article.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < window.innerHeight &&
              article.querySelector('div[data-ad-preview="message"], div[data-testid="post_message"], div[data-ad-comet-preview="message"], img, video');
          });

        return topLevelArticles.map((article) => {
          const message = article.querySelector('div[data-ad-preview="message"]') ||
            article.querySelector('div[data-testid="post_message"]') ||
            article.querySelector('div[data-ad-comet-preview="message"]') ||
            null;
          const image = Array.from(article.querySelectorAll('img[src*="fbcdn.net"]')).find((el) => el.closest('div[role="article"]') === article);
          const video = article.querySelector('video');
          const link = Array.from(article.querySelectorAll('a[href*="/posts/"], a[href*="/permalink"], a[href*="story_fbid"], a[href*="/photos/"], a[href*="/videos/"]'))
            .find((el) => !/[?&](comment_id|reply_comment_id)=/i.test(el.href));
          const textContent = (message?.innerText || message?.textContent || "").trim();
          const mediaUrl = image?.src || video?.src || "";
          if (!textContent && !mediaUrl) return null;
          return {
            textContent,
            media: { primary_fb_cdn: mediaUrl, fallback_backup: "" },
            mediaUrls: mediaUrl ? [mediaUrl] : [],
            sourceUrl: link?.href || "",
            timestamp: Math.floor(Date.now() / 1000)
          };
        }).filter(Boolean).slice(0, 10);
      }
    });
    const cookie = await chrome.cookies.get({ url: tab.url, name: "c_user" });
    const response = {
      success: true,
      posts: (injected?.[0]?.result || []).map((post) => ({
        ...post,
        fbUserId: cookie?.value || null
      }))
    };
    if (!response?.success || !response.posts?.length) {
      postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("post.noneVisible") }));
      return;
    }
    postListEl.replaceChildren();
    const scanMeta = document.createElement("div");
    scanMeta.className = "post-meta";
    scanMeta.textContent = t("post.scanCount", { count: response.posts.length, time: formatDate(new Date(), { timeStyle: "medium" }) });
    postListEl.appendChild(scanMeta);
    response.posts.forEach((post, index) => {
      const card = document.createElement("div");
      card.className = "post";
      const text = document.createElement("div");
      text.className = "post-text";
      text.textContent = `${index + 1}. ${post.textContent || t("post.mediaOnly")}`;
      if (post.media?.primary_fb_cdn) {
        const thumb = document.createElement("img");
        thumb.className = "post-thumb";
        thumb.src = post.media.primary_fb_cdn;
        thumb.alt = t("post.imagePreview");
        card.appendChild(thumb);
      }
      const meta = document.createElement("div");
      meta.className = "post-meta";
      meta.textContent = post.sourceUrl ? t("post.permalinkDetected") : t("post.currentPage");
      const button = document.createElement("button");
      button.textContent = t("post.backupButton");
      button.addEventListener("click", () => backupPost(post, button));
      card.append(text, meta, button);
      postListEl.appendChild(card);
    });
  } catch (error) {
    postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("post.readFailed", { error: error.message }) }));
  }
}

async function selectPost() {
  if (selectedRefreshTimer) { clearInterval(selectedRefreshTimer); selectedRefreshTimer = null; }
  const profileState = await getActiveProfile();
  const activeProfile = profileState.profiles.find((profile) => profile.id === profileState.activeId);
  if (!activeProfile?.alias) {
    setStatus(t("picker.unmapped"), true);
    postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.openSettings") }));
    await renderProfiles();
    return;
  }
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes("facebook.com")) {
    setStatus(t("post.facebookOnly"), true);
    return;
  }
  pickerTabId = tab.id;
  selectButton.disabled = false;
  selectButton.textContent = t("backup.cancelSelect");
  resultEl.replaceChildren();
  postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.clickPost") }));
  setStatus(t("picker.instructions"));
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["platform-facebook.js"] });
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (pageUrl) => globalThis.ChamberFacebookPlatform?.startPicker?.(pageUrl) || null,
      args: [tab.url]
    });
    const payload = injected?.[0]?.result;
    if (!payload) {
      postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.canceledList") }));
      setStatus(t("picker.canceled"));
      return;
    }
    const cookie = await chrome.cookies.get({ url: tab.url, name: "c_user" });
    payload.fbUserId = cookie?.value || null;
    if (payload.isOwnAuthor !== true) {
      postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.authorUnknown") }));
      setStatus(payload.isOwnAuthor === false ? t("picker.notOwner") : t("picker.authorStopped"), true);
      reportSidepanelEvent("sidepanel:author-check-blocked", {
        sourceUrl: payload.sourceUrl || "",
        authorName: payload.authorName || "",
        authorUrl: payload.authorUrl || "",
        isOwnAuthor: payload.isOwnAuthor ?? null
      });
      return;
    }
    postListEl.replaceChildren();
    const card = document.createElement("div");
    card.className = "post";
    const text = document.createElement("div");
    text.className = "post-text";
    text.textContent = payload.textContent || t("post.selectedNoText");
    if (payload.media.primary_fb_cdn) {
      const thumb = document.createElement("img");
      thumb.className = "post-thumb";
      thumb.src = payload.media.primary_fb_cdn;
      thumb.alt = t("picker.selectedImage");
      card.appendChild(thumb);
    }
    const button = document.createElement("button");
    button.textContent = t("post.backupButton");
    let canBackup = false;
    const validation = ChamberMvpValidation.validateBackupPayload(payload);
    if (!ChamberMvpValidation.isValidFacebookPostUrl(payload.sourceUrl)) {
      button.disabled = true;
      button.textContent = t("post.missingPermalinkButton");
      setStatus(validationMessage(validation, payload), true);
      reportSidepanelEvent("sidepanel:source-url-blocked", {
        sourceUrl: payload.sourceUrl || "",
        sourceCandidates: Array.isArray(payload.sourceCandidates) ? payload.sourceCandidates.slice(0, 30) : [],
        videoDetected: payload.media?.videoDetected === true,
        videoSourceType: payload.media?.videoSourceType || ""
      });
    } else if (payload.media?.album && payload.media?.albumComplete === false) {
      button.disabled = true;
      button.textContent = t("picker.albumIncompleteButton");
      const countText = payload.media.albumExpectedCount
        ? `${payload.media.albumLoadedCount || payload.mediaUrls?.length || 0} / ${payload.media.albumExpectedCount}`
        : t("picker.albumCount", { count: payload.media.albumLoadedCount || payload.mediaUrls?.length || 0 });
      setStatus(t("picker.albumIncomplete", { count: countText }), true);
    } else if (payload.contentExpanded === false) {
      button.disabled = true;
      button.textContent = t("picker.textCollapsedButton");
      setStatus(t("picker.textCollapsed"), true);
    } else if (!payload.textContent && !payload.mediaUrls?.length && !payload.media?.videoDetected) {
      button.disabled = true;
      button.textContent = t("picker.emptyButton");
      setStatus(t("picker.empty"), true);
    } else {
      // Text is optional. Photo albums, reels and image-only posts may have
      // an empty caption; a valid media URL is sufficient content.
      canBackup = true;
      button.addEventListener("click", () => backupPost(payload, button));
    }
    const meta = document.createElement("div");
    meta.className = "post-meta";
    const albumMeta = payload.media?.album
      ? t("picker.albumMeta", {
          loaded: payload.media.albumLoadedCount || payload.mediaUrls?.length || 0,
          expected: payload.media.albumExpectedCount ? t("picker.albumExpected", { expected: payload.media.albumExpectedCount }) : "",
          incomplete: payload.media.albumComplete === false ? t("picker.incomplete") : ""
        })
      : "";
    const videoMeta = payload.media?.videoDetected
      ? t("picker.video", { note: payload.media.videoSourceType === "stream" ? t("picker.videoNote") : "" })
      : "";
    meta.textContent = t("picker.meta", {
      author: payload.authorName || t("picker.unknownAuthor"),
      date: payload.publishedAt ? formatDate(payload.publishedAt * 1000, { dateStyle: "medium", timeStyle: "short" }) : t("picker.unknownTime"),
      album: albumMeta,
      video: videoMeta
    });
    card.append(text, meta);
    if (payload.media?.videoDetected) {
      const videoLimit = document.createElement("div");
      videoLimit.className = "video-limit-note";
      videoLimit.textContent = t("picker.videoLimit");
      card.appendChild(videoLimit);
    }
    if (payload.sourceUrl) {
      const source = document.createElement("a");
      source.href = payload.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = t("picker.viewSource");
      source.style.cssText = "display:block;margin:6px 0;color:#93c5fd;font-size:11px;overflow-wrap:anywhere";
      card.appendChild(source);
    } else {
      const missing = document.createElement("div");
      missing.className = "post-meta";
      missing.textContent = t("picker.noPermalink");
      card.appendChild(missing);
    }
    card.appendChild(button);
    postListEl.appendChild(card);
    if (canBackup) setStatus(
      payload.media?.videoDetected
        ? t("picker.videoReady")
        : payload.media?.album
          ? t("picker.albumReady", { count: payload.media.albumLoadedCount || payload.mediaUrls.length })
          : t("picker.ready")
    );
    else if (payload.contentExpanded === false) watchSelectedPost(payload, button, text, tab);
  } catch (error) {
    setStatus(error.message || t("picker.failed"), true);
    postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.failedList") }));
  } finally {
    pickerTabId = null;
    selectButton.textContent = t("backup.select");
    await renderProfiles();
  }
}

selectButton.addEventListener("click", () => {
  if (pickerTabId) cancelActivePicker();
  else selectPost();
});

async function initializePanel() {
  await ChamberI18n.init();
  languageSelect.value = ChamberI18n.getLocale();
  renderVersion();
  languageSelect.addEventListener("change", async () => {
    await ChamberI18n.setLocale(languageSelect.value);
    location.reload();
  });
  await loadPageInfo();
}

initializePanel().catch(() => {
  pageUrlEl.textContent = t("page.unavailable");
});
// Do not guess a post on panel open. The user must explicitly select one.
