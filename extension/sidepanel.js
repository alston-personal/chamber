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
const platformSelect = document.getElementById("platformSelect");
const { t, formatDate } = ChamberI18n;
let selectedRefreshTimer = null;
let pickerTabId = null;
let panelContextKey = "";
let panelContextRefreshTimer = null;
let preferredActiveTabId = null;

function renderVersion() {
  versionLabel.textContent = t("version.label", { version: chrome.runtime.getManifest().version });
}

function validationMessage(validation, payload) {
  if (validation?.code === "SOURCE_URL_REQUIRED") {
    return t("validation.SOURCE_URL_REQUIRED_PLATFORM", { platform: platformName(payload?.platform || "facebook") });
  }
  const key = validation?.code === "AUTHOR_NOT_CONFIRMED" && payload?.isOwnAuthor === false
    ? "validation.NOT_OWNER"
    : `validation.${validation?.code || "CONTENT_REQUIRED"}`;
  return t(key);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function platformForTab(tab) {
  try {
    const host = new URL(tab?.url || "").hostname.toLowerCase();
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
    if (["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(host)) return "threads";
  } catch (_) {}
  return null;
}

const platformName = (platform) => platform === "threads" ? "Threads" : "Facebook";

async function rawPlatformIdentity(tab = null) {
  tab ||= await getActiveTab();
  const platform = platformForTab(tab);
  if (!platform) throw new Error(t("error.openSupportedPlatform"));
  if (platform === "facebook") {
    const cookie = await chrome.cookies.get({ url: tab.url, name: "c_user" });
    if (!cookie?.value) throw new Error(t("error.loginPlatform", { platform: "Facebook" }));
    return { platform, actorId: cookie.value, actorHandle: "", tab };
  }
  const cookie = await chrome.cookies.get({ url: tab.url, name: "ds_user_id" });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["platform-threads.js"] });
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.ChamberThreadsPlatform?.getAccountContext?.() || null
  });
  const account = injected?.[0]?.result;
  if (!cookie?.value || !account?.handle || account.profilePageOnly) throw new Error(t("error.loginPlatform", { platform: "Threads" }));
  return { platform, actorId: cookie.value, actorHandle: account.handle, tab };
}

async function activePlatformIdentity() {
  const raw = await rawPlatformIdentity();
  const state = await getActiveProfile(raw);
  const profile = state.profiles.find((item) => item.id === state.activeId);
  const userId = profile?.ownerUserId || (raw.platform === "facebook" ? raw.actorId : `threads:${raw.actorId}`);
  return { ...raw, userId, prefix: `user_${userId}_`, profile };
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
    const { prefix } = await activePlatformIdentity();
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

async function getActiveProfile(rawIdentity = null) {
  const raw = rawIdentity || await rawPlatformIdentity();
  const legacy = await chrome.storage.local.get(["lastFbUserId"]);
  const initialOwnerId = raw.platform === "facebook" ? raw.actorId : (legacy.lastFbUserId || `threads:${raw.actorId}`);
  const prefix = `user_${initialOwnerId}_`;
  const data = await chrome.storage.local.get([
    "chamberProfiles", "activeChamberProfileId", prefix + "identityAlias",
    prefix + "customWalletAddress", prefix + "nativeWalletAddress"
  ]);
  let profiles = Array.isArray(data.chamberProfiles) ? data.chamberProfiles : [];
  let activeId = data.activeChamberProfileId;
  if (!profiles.length) {
    const alias = data[prefix + "identityAlias"] || "";
    const wallet = data[prefix + "customWalletAddress"] || data[prefix + "nativeWalletAddress"] || "";
    const first = { id: profileId(), name: alias || t("account.defaultName"), alias, walletAddress: wallet, ownerUserId: initialOwnerId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    profiles = [first];
    activeId = first.id;
    await chrome.storage.local.set({ chamberProfiles: profiles, activeChamberProfileId: activeId });
  }
  if (!profiles.some((profile) => profile.id === activeId)) {
    activeId = profiles[0].id;
    await chrome.storage.local.set({ activeChamberProfileId: activeId });
  }
  const activeProfile = profiles.find((profile) => profile.id === activeId);
  if (activeProfile && !activeProfile.ownerUserId) {
    activeProfile.ownerUserId = initialOwnerId;
    await chrome.storage.local.set({ chamberProfiles: profiles });
  }
  if (activeProfile && !activeProfile.alias && raw.actorId) {
    try {
      const response = await fetch(`https://studio.milkcat.org/chamber-api/identity/by-actor?platform=${encodeURIComponent(raw.platform)}&actorId=${encodeURIComponent(raw.actorId)}`);
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
  const currentPlatform = platformName(platformForTab(await getActiveTab()) || "facebook");
  selectButton.disabled = !mapped;
  rebornButton.disabled = !mapped;
  selectButton.title = mapped ? t("account.selectTitlePlatform", { platform: currentPlatform }) : t("account.mappingRequiredTitle");
  if (!mapped) {
    setStatus(t("account.mappingRequired"), true);
  }
}

async function loadSettingsForm() {
  const identity = await activePlatformIdentity();
  const state = await getActiveProfile(identity);
  const profile = state.profiles.find((item) => item.id === state.activeId);
  const prefix = identity.prefix;
  const data = await chrome.storage.local.get([prefix + "identityAlias", prefix + "customWalletAddress"]);
  settingsAlias.value = profile?.alias || data[prefix + "identityAlias"] || "";
  settingsWallet.value = profile?.walletAddress || data[prefix + "customWalletAddress"] || "";
  await refreshRecoveryStatus();
}

recoveryExport?.addEventListener("click", async () => {
  try {
    const { prefix } = await activePlatformIdentity();
    const data = await chrome.storage.local.get([prefix + "identityAlias", prefix + "lastEchoUrl"]);
    const alias = data[prefix + "identityAlias"] || "";
    const target = alias
      ? `https://studio.milkcat.org/echo/${encodeURIComponent(alias)}/all?recovery=true`
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
  const identity = await activePlatformIdentity();
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
  const name = platformName(identity.platform);
  const description = document.getElementById("rebornDescription");
  if (description) description.textContent = t("reborn.descriptionPlatform", { platform: name });
  if (!rebornText.value.trim()) rebornText.value = identity.platform === "threads" ? t("declaration.defaultTextThreads") : ChamberDeclaration.getDefaultText();
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
    const identity = await activePlatformIdentity();
    if (!tab?.id || !identity.platform) throw new Error(t("reborn.platformRequired"));
    const state = await getActiveProfile();
    const profile = state.profiles.find((item) => item.id === state.activeId);
    if (!profile?.alias) throw new Error(t("reborn.aliasRequired"));
    const timelineUrl = `https://studio.milkcat.org/echo/${encodeURIComponent(profile.alias)}/${identity.platform === "threads" ? "threads" : "fb"}`;
    const card = await ChamberDeclaration.generateCard({ timelineUrl, alias: profile.alias });

    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "image/png": card.blob,
      })]);
    } catch (_) {
      await navigator.clipboard.writeText(text);
    }

    if (identity.platform === "threads") {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["platform-threads.js"] });
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (body, imageUrl) => globalThis.ChamberThreadsPlatform?.openComposerAndFill?.(body, imageUrl),
        args: [text, card.dataUrl]
      });
      const result = injected?.[0]?.result;
      if (!result?.success) throw new Error(t("threads.composerMissing"));
      rebornStatus.textContent = result.imageAttached ? t("reborn.successPlatform", { platform: "Threads" }) : t("reborn.successTextOnly", { platform: "Threads" });
    } else {
      await sendTabMessageWithRecovery(tab.id, {
        action: "OPEN_FB_COMPOSER_AND_FILL",
        payload: { text, imageUrl: card.dataUrl },
      });
      rebornStatus.textContent = t("reborn.successPlatform", { platform: "Facebook" });
    }
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
    const identity = await activePlatformIdentity();
    const wallet = settingsWallet.value.trim();
    const nativeOwner = await ensureNativeOwnerKey(identity.userId);
    const effectiveWallet = wallet || nativeOwner.address;
    const checkUrl = new URL("https://studio.milkcat.org/chamber-api/identity/check");
    checkUrl.searchParams.set("alias", alias);
    checkUrl.searchParams.set("walletAddress", effectiveWallet);
    const checkResponse = await fetch(checkUrl);
    const check = await checkResponse.json();
    if (!check.success || (!check.available && !check.ownedByRequester)) throw new Error(t("alias.invalid"));
    const registerResponse = await fetch("https://studio.milkcat.org/chamber-api/identity/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias, platform: identity.platform, actorType: "personal", actorId: identity.actorId, displayName: alias, walletAddress: effectiveWallet, proof: "" })
    });
    const registered = await registerResponse.json();
    if (!registerResponse.ok || !registered.success) throw new Error(registered.error || t("alias.mappingSaveFailed"));
    const prefix = identity.prefix;
    const state = await getActiveProfile();
    const profile = state.profiles.find((item) => item.id === state.activeId);
    if (profile) {
      profile.name = alias; profile.alias = alias; profile.walletAddress = wallet; profile.updatedAt = new Date().toISOString();
    }
    await chrome.storage.local.set({
      [prefix + "identityAlias"]: alias,
      [prefix + "identityPlatform"]: identity.platform,
      [prefix + "identityActorId"]: identity.actorId,
      [prefix + "identityActorType"]: "personal",
      [prefix + "identityDisplayName"]: alias,
      [prefix + "customWalletAddress"]: wallet,
      lastFbUserId: identity.userId,
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
  let identity = null;
  try { identity = await activePlatformIdentity(); } catch (_) {}
  if (identity?.userId) await chrome.storage.local.set({ lastFbUserId: identity.userId });
  resultEl.replaceChildren();
  postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("account.refreshed") }));
  const name = platformName(identity?.platform || platformForTab(await getActiveTab()) || "facebook");
  setStatus(identity?.actorId
    ? t("account.refreshHelpPlatform", { platform: name })
    : t("account.contextClearedPlatform", { platform: name }));
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
  if (preferredActiveTabId != null && chrome.tabs.get) {
    try {
      const preferred = await chrome.tabs.get(preferredActiveTabId);
      if (preferred?.active) return preferred;
    } catch (_) {
      preferredActiveTabId = null;
    }
  }
  const current = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current[0]) return current[0];
  const active = await chrome.tabs.query({ active: true });
  return active.find((tab) => platformForTab(tab)) || active[0];
}

async function activatePlatformTab(platform) {
  const patterns = platform === "threads"
    ? ["*://*.threads.com/*", "*://*.threads.net/*"]
    : ["*://*.facebook.com/*"];
  let tabs = await chrome.tabs.query({ currentWindow: true, url: patterns });
  if (!tabs.length) tabs = await chrome.tabs.query({ url: patterns });
  const tab = tabs.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  if (!tab?.id) {
    const created = await chrome.tabs.create({ url: platform === "threads" ? "https://www.threads.com/" : "https://www.facebook.com/", active: true });
    preferredActiveTabId = created?.id ?? null;
  } else {
    preferredActiveTabId = tab.id;
    if (tab.windowId != null && chrome.windows?.update) await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
  }
  panelContextKey = "";
  schedulePanelContextRefresh();
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
    // The active social tab may have navigated while picker mode was active.
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
  const platform = platformForTab(tab);
  const name = platformName(platform || "facebook");
  if (platform && platformSelect) platformSelect.value = platform;
  const currentLabel = document.getElementById("currentPlatformLabel");
  const promptLabel = document.getElementById("selectPromptLabel");
  if (currentLabel) currentLabel.textContent = t("backup.currentPlatformNamed", { platform: name });
  if (promptLabel) promptLabel.textContent = t("backup.selectPromptNamed", { platform: name });
  if (platform) selectButton.textContent = t("backup.selectPlatform", { platform: name });
  selectButton.disabled = true;
  rebornButton.disabled = true;
  try {
    await renderProfiles();
  } catch (error) {
    setStatus(error.message || t("error.loginPlatform", { platform: name }), true);
  }
}

function schedulePanelContextRefresh() {
  if (panelContextRefreshTimer) clearTimeout(panelContextRefreshTimer);
  panelContextRefreshTimer = setTimeout(async () => {
    try {
      panelContextRefreshTimer = null;
      const tab = await getActiveTab().catch(() => null);
      const nextKey = `${tab?.id || ""}:${tab?.url || ""}`;
      if (nextKey === panelContextKey) return;

      if (pickerTabId && pickerTabId !== tab?.id) await cancelActivePicker();
      if (selectedRefreshTimer) {
        clearInterval(selectedRefreshTimer);
        selectedRefreshTimer = null;
      }
      panelContextKey = nextKey;
      resultEl.replaceChildren();
      postListEl.replaceChildren(Object.assign(document.createElement("div"), {
        className: "post-meta",
        textContent: t("backup.notSelected")
      }));
      settingsView.hidden = true;
      rebornView.hidden = true;
      backupView.hidden = false;
      setStatus("");
      await loadPageInfo();
    } catch (error) {
      setStatus(error.message || t("page.unavailable"), true);
    }
  }, 80);
}

async function backupPost(payload, button) {
  if (selectedRefreshTimer) { clearInterval(selectedRefreshTimer); selectedRefreshTimer = null; }
  button.disabled = true;
  setStatus(t("backup.inProgress"));
  reportSidepanelEvent("sidepanel:backup-start", {
    platform: payload.platform || "facebook",
    sourceUrl: payload.sourceUrl || "",
    contentLength: String(payload.textContent || payload.content || "").length,
    mediaCount: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.length : 0,
    hasPublishedAt: Boolean(payload.publishedAt)
  });
  try {
    const validation = ChamberMvpValidation.validateBackupPayload(payload);
    if (!validation.ok) throw new Error(validationMessage(validation, payload));
    const { userId, prefix } = await activePlatformIdentity();
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
      platform: payload.platform || "facebook",
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
      platform: payload.platform || "facebook",
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

function watchSelectedPost(payload, button, textEl, tab, identity) {
  if (selectedRefreshTimer) clearInterval(selectedRefreshTimer);
  let attempts = 0;
  selectedRefreshTimer = setInterval(async () => {
    attempts += 1;
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (platform, pageUrl, sourceUrl, selectedText, expectedHandle) => {
          const adapter = platform === "threads" ? globalThis.ChamberThreadsPlatform : globalThis.ChamberFacebookPlatform;
          return adapter?.refreshSelected?.(pageUrl, sourceUrl, selectedText, expectedHandle) || null;
        },
        args: [payload.platform || "facebook", tab.url, payload.sourceUrl || "", payload.textContent || "", identity?.actorHandle || ""]
      });
      const refreshed = injected?.[0]?.result;
      if (!refreshed) return;
      const rememberedMedia = Array.from(new Set([...(payload.mediaUrls || []), ...(refreshed.mediaUrls || [])]));
      if (rememberedMedia.length > (refreshed.mediaUrls || []).length) {
        refreshed.mediaUrls = rememberedMedia;
        refreshed.media = {
          ...(refreshed.media || {}),
          primary_fb_cdn: rememberedMedia[0] || refreshed.media?.primary_fb_cdn || "",
          album: rememberedMedia.length > 1 || refreshed.media?.album === true,
          albumLoadedCount: rememberedMedia.length,
          albumComplete: payload.media?.albumComplete === true || refreshed.media?.albumComplete === true
        };
      }
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
      // The tab may be navigating or the platform may temporarily replace the DOM.
    }
    if (attempts >= 120 && selectedRefreshTimer) {
      clearInterval(selectedRefreshTimer);
      selectedRefreshTimer = null;
    }
  }, 500);
}

async function loadPosts() {
  const tab = await getActiveTab();
  if (!tab?.id || platformForTab(tab) !== "facebook") {
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
  const tab = await getActiveTab();
  const platform = platformForTab(tab);
  if (!tab?.id || !platform) {
    setStatus(t("post.supportedOnly"), true);
    return;
  }
  const identity = await activePlatformIdentity();
  const profileState = await getActiveProfile(identity);
  const activeProfile = profileState.profiles.find((profile) => profile.id === profileState.activeId);
  if (!activeProfile?.alias) {
    setStatus(t("picker.unmapped"), true);
    postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.openSettings") }));
    await renderProfiles();
    return;
  }
  pickerTabId = tab.id;
  selectButton.disabled = false;
  selectButton.textContent = t("backup.cancelSelect");
  resultEl.replaceChildren();
  postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.clickPostPlatform", { platform: platformName(platform) }) }));
  setStatus(t("picker.instructionsPlatform", { platform: platformName(platform) }));
  try {
    const adapterFile = platform === "threads" ? "platform-threads.js" : "platform-facebook.js";
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [adapterFile] });
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (platformName, pageUrl, expectedHandle) => {
        const adapter = platformName === "threads" ? globalThis.ChamberThreadsPlatform : globalThis.ChamberFacebookPlatform;
        return adapter?.startPicker?.(pageUrl, expectedHandle) || null;
      },
      args: [platform, tab.url, identity.actorHandle || ""]
    });
    const payload = injected?.[0]?.result;
    if (!payload) {
      postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.canceledListPlatform", { platform: platformName(platform) }) }));
      setStatus(t("picker.canceled"));
      return;
    }
    payload.platform = platform;
    payload.fbUserId = identity.userId;
    payload.identityActorId = identity.actorId;
    payload.identityActorType = "personal";
    payload.identityDisplayName = identity.actorHandle ? `@${identity.actorHandle}` : (payload.authorName || "");
    reportSidepanelEvent("sidepanel:picker-selected", {
      platform,
      sourceUrl: payload.sourceUrl || "",
      contentLength: String(payload.textContent || "").length,
      mediaCount: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.length : 0,
      albumExpectedCount: payload.media?.albumExpectedCount || null,
      albumComplete: payload.media?.albumComplete ?? null,
      videoDetected: payload.media?.videoDetected === true,
      isOwnAuthor: payload.isOwnAuthor ?? null
    });
    if (payload.isOwnAuthor !== true) {
      postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.authorUnknownPlatform", { platform: platformName(platform) }) }));
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
    text.textContent = payload.textContent || t("post.selectedNoTextPlatform", { platform: platformName(platform) });
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
    if (!ChamberMvpValidation.isValidPostUrl(payload.sourceUrl, platform)) {
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
      setStatus(t("picker.textCollapsedPlatform", { platform: platformName(platform) }), true);
    } else if (!payload.textContent && !payload.mediaUrls?.length && !payload.media?.videoDetected) {
      button.disabled = true;
      button.textContent = t("picker.emptyButton");
      setStatus(t("picker.emptyPlatform", { platform: platformName(platform) }), true);
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
      videoLimit.textContent = t("picker.videoLimitPlatform", { platform: platformName(platform) });
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
      missing.textContent = t("picker.noPermalinkPlatform", { platform: platformName(platform) });
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
    else if (payload.contentExpanded === false) watchSelectedPost(payload, button, text, tab, identity);
  } catch (error) {
    reportSidepanelEvent("sidepanel:picker-error", {
      platform: platform || "unknown",
      error: error.message || String(error)
    });
    setStatus(error.message || t("picker.failed"), true);
    postListEl.replaceChildren(Object.assign(document.createElement("div"), { className: "post-meta", textContent: t("picker.failedList") }));
  } finally {
    pickerTabId = null;
    selectButton.textContent = t("backup.selectPlatform", { platform: platformName(platform || "facebook") });
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
  // Chrome keeps a Side Panel document alive while the user moves between
  // Facebook and Threads. Follow the active tab instead of retaining the
  // platform and URL that were visible when the panel first opened.
  chrome.tabs.onActivated?.addListener(schedulePanelContextRefresh);
  chrome.tabs.onActivated?.addListener(({ tabId }) => { preferredActiveTabId = tabId; });
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo, updatedTab) => {
    if (!changeInfo.url && changeInfo.status !== "complete") return;
    if (updatedTab?.active) preferredActiveTabId = tabId;
    if (updatedTab?.active || tabId === Number(panelContextKey.split(":", 1)[0])) {
      schedulePanelContextRefresh();
    }
  });
  chrome.windows?.onFocusChanged?.addListener(schedulePanelContextRefresh);
  platformSelect?.addEventListener("change", () => {
    activatePlatformTab(platformSelect.value).catch((error) => setStatus(error.message, true));
  });
  await loadPageInfo();
  const tab = await getActiveTab();
  panelContextKey = `${tab?.id || ""}:${tab?.url || ""}`;
}

initializePanel().catch(() => {
  pageUrlEl.textContent = t("page.unavailable");
});
// Do not guess a post on panel open. The user must explicitly select one.
