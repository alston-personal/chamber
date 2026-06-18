/**
 * popup.js - Chamber Protocol Settings Popup Logic
 *
 * Implements dashboard navigation, connection badges, auto-generation of
 * local key/custodial wallets, and canvas-based reborn ID cards.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const dashboardView = document.getElementById("dashboardView");
  const settingsView = document.getElementById("settingsView");
  
  const toSettingsBtn = document.getElementById("toSettingsBtn");
  const backBtn = document.getElementById("backBtn");
  const saveBtn = document.getElementById("saveBtn");
  const viewDocsBtn = document.getElementById("viewDocsBtn");
  
  const identityAliasInput = document.getElementById("identityAlias");
  const checkAliasBtn = document.getElementById("checkAliasBtn");
  const aliasStatus = document.getElementById("aliasStatus");
  const walletAddressInput = document.getElementById("walletAddress");
  const walletPrivateKeyInput = document.getElementById("walletPrivateKey");
  const imgurClientIdInput = document.getElementById("imgurClientId");
  const isEncryptionEnabledCheckbox = document.getElementById("isEncryptionEnabled");
  
  const timelineUrlText = document.getElementById("timelineUrlText");
  const identityAliasSummary = document.getElementById("identityAliasSummary");
  const identityWalletSummary = document.getElementById("identityWalletSummary");
  const copyTimelineBtn = document.getElementById("copyTimelineBtn");
  const declarationTextarea = document.getElementById("declarationText");
  const genCardBtn = document.getElementById("genCardBtn");
  
  const connectionDot = document.getElementById("connectionDot");
  const connectionBadge = document.getElementById("connectionBadge");
  let aliasCheckTimer = null;
  let lastAliasCheckResult = null;

  const DEFAULT_DECLARATION = `【本人樂觀開朗之 Web3 轉世聲明】

本人不酗酒、不抽菸，無任何精神疾患，亦無任何尋短傾向。特此聲明：若本人帳號無預警消失，絕非自主登出。

若哪天我的臉書遭到『祖克柏』的演算法大刀無情斬首、人間蒸發……
『他們可以砍掉我們的帳號，但永遠無法閹割我們的——自由（FREEDOM！！！）』

想要我的思想嗎？想要的話可以全部給你，去尋找吧！
我把這一生所有的記憶、文字與不被審查的真實言論，都藏在那個去中心化 Web3 的『Chamber』密室裡了！

當這座 Web2 帝國的圍牆倒塌時，我的回聲將在彼岸永恆迴盪。
👉 Chamber 重生網址見留言第一樓 🛡️
（電腦用戶可直接掃描下方身分卡 QR Code 訪問）`;

  // 1. Navigation toggle
  toSettingsBtn.addEventListener("click", () => {
    dashboardView.classList.add("hidden");
    settingsView.classList.remove("hidden");
  });

  backBtn.addEventListener("click", () => {
    settingsView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
  });

  // Helper to generate secure random hex string
  function generateRandomHex(bytesCount) {
    const arr = new Uint8Array(bytesCount);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function detectPlatform(url) {
    if (!url) return "facebook";
    if (url.includes("instagram.com")) return "instagram";
    if (url.includes("threads.net")) return "threads";
    if (url.includes("x.com") || url.includes("twitter.com")) return "x";
    return "facebook";
  }

  async function checkAliasAvailability(alias, walletAddress) {
    const url = new URL("https://studio.milkcat.org/chamber-api/identity/check");
    url.searchParams.set("alias", alias);
    if (walletAddress) {
      url.searchParams.set("walletAddress", walletAddress);
    }
    const response = await fetch(url.toString());
    return response.ok ? response.json() : { success: false, error: "check failed" };
  }

  async function runAliasCheck({ quiet = false } = {}) {
    const alias = identityAliasInput?.value.trim() || "";
    if (!alias) {
      lastAliasCheckResult = null;
      renderAliasStatus(null);
      setComposerReady(false, "");
      return null;
    }

    if (!quiet && aliasStatus) {
      aliasStatus.innerText = "正在檢查暱稱是否可用...";
    }
    if (checkAliasBtn && !quiet) {
      checkAliasBtn.disabled = true;
      checkAliasBtn.innerText = "檢查中...";
    }

    const walletAddress = walletAddressInput?.value.trim() || "";
    const result = await checkAliasAvailability(alias, walletAddress);
    lastAliasCheckResult = result;
    renderAliasStatus(result);

    if (checkAliasBtn) {
      checkAliasBtn.disabled = false;
      checkAliasBtn.innerText = "檢查可用性";
    }

    const availableToUse = Boolean(result?.success && (result.available || result.ownedByRequester));
    setComposerReady(availableToUse, alias, { preserveAliasStatus: !availableToUse });
    return result;
  }

  function renderAliasStatus(result) {
    if (!aliasStatus) return;
    if (!result) {
      aliasStatus.textContent = "";
      return;
    }

    if (result.available) {
      aliasStatus.innerHTML = `✅ 暱稱可用：<code>${result.alias}</code>`;
      return;
    }

    const suggestions = (result.suggestions || []).slice(0, 5);
    if (suggestions.length) {
      aliasStatus.innerHTML = `⚠️ 暱稱已被使用，建議：${suggestions.map((s) => `<code>${s.alias}</code>（${s.display}）`).join("、")}`;
    } else {
      aliasStatus.innerText = "⚠️ 暱稱已被使用，請改一個名稱。";
    }
  }

  function renderIdentitySummary(alias, walletAddress, platform) {
    if (!identityAliasSummary || !identityWalletSummary) return;
    if (!alias) {
      identityAliasSummary.innerText = "尚未設定暱稱，請到進階設定建立 mapping。";
      identityWalletSummary.innerText = "設定後，這個暱稱會對應到你的錢包與平台。";
      return;
    }
    identityAliasSummary.innerHTML = `暱稱：<code>${alias}</code>｜平台：<code>${platform || "facebook"}</code>`;
    identityWalletSummary.innerHTML = `錢包：<code>${walletAddress || "託管錢包"}</code>`;
  }

  function setComposerReady(enabled, alias = "", options = {}) {
    if (!genCardBtn) return;
    genCardBtn.disabled = !enabled;
    genCardBtn.innerText = enabled
      ? "⚡ 一鍵生成聲明並發佈"
      : "⚠️ 先設定暱稱再使用";
    if (!enabled && aliasStatus && !options.preserveAliasStatus) {
      aliasStatus.innerText = alias
        ? `先完成暱稱 mapping 才能使用一鍵聲明。現在是：${alias}`
        : "先完成暱稱 mapping 才能使用一鍵聲明。";
    }
  }

  if (checkAliasBtn) {
    checkAliasBtn.addEventListener("click", () => {
      runAliasCheck({ quiet: false });
    });
  }

  if (identityAliasInput) {
    identityAliasInput.addEventListener("input", () => {
      if (aliasCheckTimer) {
        clearTimeout(aliasCheckTimer);
      }
      aliasCheckTimer = setTimeout(() => {
        runAliasCheck({ quiet: true }).catch((err) => {
          console.warn("[Chamber] Alias auto-check failed:", err);
        });
      }, 500);
    });
  }

  // 2. Load configurations and handle first-time initialization
  chrome.storage.local.get(["lastFbUserId", "imgurClientId"], (meta) => {
    const userId = meta.lastFbUserId || "default";
    const prefix = `user_${userId}_`;
    
    chrome.storage.local.get(
      [
        prefix + "identityAlias",
        prefix + "identityPlatform",
        prefix + "nativeWalletAddress",
        prefix + "nativeWalletPrivateKey",
        prefix + "customWalletAddress",
        prefix + "customWalletPrivateKey",
        prefix + "isEncryptionEnabled",
        prefix + "lastEchoUrl",
        prefix + "lastFbUserIdHash"
      ],
      (data) => {
        identityAliasInput.value = data[prefix + "identityAlias"] || "";
        let nativeWalletAddress = data[prefix + "nativeWalletAddress"];
        let nativeWalletPrivateKey = data[prefix + "nativeWalletPrivateKey"];
        
        // Auto-initialize custodial wallet if not set for this specific user
        if (!nativeWalletAddress) {
          nativeWalletAddress = "0x" + generateRandomHex(20); // 20 bytes = 40 hex chars
          nativeWalletPrivateKey = generateRandomHex(32); // 32 bytes = 64 hex chars
          const update = {};
          update[prefix + "nativeWalletAddress"] = nativeWalletAddress;
          update[prefix + "nativeWalletPrivateKey"] = nativeWalletPrivateKey;
          chrome.storage.local.set(update);
        }

        // Display Native Wallet Address (Read-only)
        document.getElementById("nativeWalletLabel").innerText = nativeWalletAddress;

        // Populate Inputs with Custom Wallet configuration (blank = custodial)
        walletAddressInput.value = data[prefix + "customWalletAddress"] || "";
        walletPrivateKeyInput.value = data[prefix + "customWalletPrivateKey"] || "";
        imgurClientIdInput.value = meta.imgurClientId || "";
        if (data[prefix + "isEncryptionEnabled"] !== undefined) {
          isEncryptionEnabledCheckbox.checked = data[prefix + "isEncryptionEnabled"];
        } else {
          isEncryptionEnabledCheckbox.checked = true; // default enabled
        }

        if (data[prefix + "identityAlias"]) {
          aliasStatus.innerHTML = `已綁定暱稱：<code>${data[prefix + "identityAlias"]}</code>`;
        }
        renderIdentitySummary(
          data[prefix + "identityAlias"] || "",
          data[prefix + "customWalletAddress"] || nativeWalletAddress,
          data[prefix + "identityPlatform"] || "facebook"
        );
        setComposerReady(Boolean(data[prefix + "identityAlias"]), data[prefix + "identityAlias"] || "");
        if (data[prefix + "identityAlias"]) {
          runAliasCheck({ quiet: true }).catch((err) => {
            console.warn("[Chamber] Initial alias check failed:", err);
          });
        }

        // Populate Timeline Link
        const lastEchoUrl = data[prefix + "lastEchoUrl"];
        if (lastEchoUrl) {
          timelineUrlText.innerText = lastEchoUrl;
          timelineUrlText.style.color = "#38bdf8"; // Active link color
        } else {
          timelineUrlText.innerText = "尚未激活，請先在 Facebook 備份...";
          timelineUrlText.style.color = "#94a3b8"; // Muted color
        }

        declarationTextarea.value = DEFAULT_DECLARATION;
      }
    );
  });

  // 3. Save Settings Handler
  saveBtn.addEventListener("click", async () => {
    const identityAlias = identityAliasInput.value.trim();
    const customWalletAddress = walletAddressInput.value.trim();
    const customWalletPrivateKey = walletPrivateKeyInput.value.trim();
    const imgurClientId = imgurClientIdInput.value.trim();
    const isEncryptionEnabled = isEncryptionEnabledCheckbox.checked;

    saveBtn.innerText = "⏳ 儲存中...";
    saveBtn.disabled = true;

    chrome.storage.local.get(["lastFbUserId"], async (meta) => {
      const userId = meta.lastFbUserId || "default";
      const prefix = `user_${userId}_`;

      if (!identityAlias) {
        aliasStatus.innerText = "請先輸入身份暱稱，再儲存。";
        saveBtn.innerText = "⚠️ 請填暱稱";
        saveBtn.disabled = false;
        setComposerReady(false, "");
        return;
      }

      const activeTabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
      const activeUrl = activeTabs?.[0]?.url || "";
      const platform = detectPlatform(activeUrl);
      const effectiveWallet = customWalletAddress || "";
      const aliasCheck = await checkAliasAvailability(identityAlias, effectiveWallet);
      if (!aliasCheck.success) {
        aliasStatus.innerText = "暱稱檢查失敗，請稍後再試。";
        saveBtn.innerText = "⚠️ 檢查失敗";
        saveBtn.disabled = false;
        setComposerReady(false, identityAlias, { preserveAliasStatus: true });
        return;
      }

      if (!aliasCheck.available && !aliasCheck.ownedByRequester) {
        renderAliasStatus(aliasCheck);
        saveBtn.innerText = "⚠️ 暱稱被占用";
        saveBtn.disabled = false;
        setComposerReady(false, identityAlias, { preserveAliasStatus: true });
        return;
      }

      const registerRes = await fetch("https://studio.milkcat.org/chamber-api/identity/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias: identityAlias,
          platform,
          actorType: platform === "facebook" ? "personal" : "account",
          actorId: userId,
          displayName: identityAlias,
          walletAddress: effectiveWallet || null,
          proof: "",
        }),
      });
      const registerJson = await registerRes.json();
      if (!registerRes.ok || !registerJson.success) {
        renderAliasStatus({ available: false, alias: identityAlias, suggestions: registerJson.suggestions || aliasCheck.suggestions || [] });
        saveBtn.innerText = "⚠️ 暱稱無法使用";
        saveBtn.disabled = false;
        setComposerReady(false, identityAlias, { preserveAliasStatus: true });
        return;
      }
      
      const update = { imgurClientId };
      update[prefix + "identityAlias"] = identityAlias;
      update[prefix + "identityPlatform"] = platform;
      update[prefix + "customWalletAddress"] = customWalletAddress;
      update[prefix + "customWalletPrivateKey"] = customWalletPrivateKey;
      update[prefix + "isEncryptionEnabled"] = isEncryptionEnabled;
      update[prefix + "lastEchoUrl"] = "";
      update[prefix + "lastFbUserIdHash"] = "";

      chrome.storage.local.set(update, () => {
        setTimeout(() => {
            saveBtn.innerText = "💾 儲存成功！";
            saveBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
          
          setTimeout(() => {
            saveBtn.innerText = "💾 儲存並套用";
            saveBtn.style.background = ""; // revert to class gradient
            saveBtn.disabled = false;
            aliasStatus.innerHTML = `✅ 已綁定 <code>${identityAlias}</code> → <code>${effectiveWallet || "託管錢包"}</code>（${platform}）`;
            renderIdentitySummary(identityAlias, effectiveWallet || "", platform);
            lastAliasCheckResult = aliasCheck;
            setComposerReady(true, identityAlias);
            // Return to dashboard after successful save
            settingsView.classList.add("hidden");
            dashboardView.classList.remove("hidden");
          }, 1000);
        }, 400);
      });
    });
  });

  // 4. Dynamic Platform Connection Badge
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      const activeTab = tabs[0];
      const url = activeTab.url || "";
      let statusText = "🌐 探索中 - 前往 Facebook 啟動備份";
      let dotColor = "#94a3b8"; // gray

      if (url.includes("facebook.com")) {
        statusText = "👥 已連結 Facebook 頁面 (Ready)";
        dotColor = "#3b82f6"; // blue
      } else if (url.includes("threads.net")) {
        statusText = "🧵 已連結 Threads 頁面 (Ready)";
        dotColor = "#c084fc"; // purple
      } else if (url.includes("x.com") || url.includes("twitter.com")) {
        statusText = "🐦 已連結 X (Twitter) (Ready)";
        dotColor = "#38bdf8"; // sky blue
      } else if (url.includes("instagram.com")) {
        statusText = "📸 已連結 Instagram (Ready)";
        dotColor = "#db2777"; // IG pink
      }

      connectionBadge.innerText = statusText;
      connectionDot.style.backgroundColor = dotColor;
      connectionDot.style.boxShadow = `0 0 10px ${dotColor}`;
    }
  });

  // 5. Copy Reborn Link Handler
  copyTimelineBtn.addEventListener("click", () => {
    chrome.storage.local.get(["lastFbUserId"], (meta) => {
      const userId = meta.lastFbUserId || "default";
      const prefix = `user_${userId}_`;
      chrome.storage.local.get([prefix + "lastEchoUrl"], (data) => {
        const targetUrl = data[prefix + "lastEchoUrl"] || "";
        if (!targetUrl) {
          alert("請先完成首次備份以啟用重生牆網址！");
          return;
        }
        
        navigator.clipboard.writeText(targetUrl).then(() => {
          copyTimelineBtn.innerText = "已複製！";
          copyTimelineBtn.style.background = "rgba(16, 185, 129, 0.2)";
          copyTimelineBtn.style.color = "#34d399";
          copyTimelineBtn.style.borderColor = "rgba(16, 185, 129, 0.5)";
          
          setTimeout(() => {
            copyTimelineBtn.innerText = "複製網址";
            copyTimelineBtn.style.background = "";
            copyTimelineBtn.style.color = "";
            copyTimelineBtn.style.borderColor = "";
          }, 1500);
        });
      });
    });
  });

  // 6. View Docs Handler
  viewDocsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://studio.milkcat.org/echo/README_TEST.md" });
  });

  // 7. Reborn Card Generator Handler (HTML5 Canvas)
  genCardBtn.addEventListener("click", async () => {
    const textToCopy = declarationTextarea.value.trim();

    genCardBtn.innerText = "⏳ 正在生成轉世卡...";
    genCardBtn.disabled = true;

    try {
      // Put the declaration into the clipboard first so the composer can paste it
      // after the image frame finishes rendering.
      await navigator.clipboard.writeText(textToCopy);
      console.log("[Chamber] Declaration text copied to clipboard.");

      // 1. Copy the text from the textarea to clipboard
      // 2. Fetch or fallback target URL for the QR Code
      const meta = await new Promise((resolve) => {
        chrome.storage.local.get(["lastFbUserId"], resolve);
      });
      const userId = meta.lastFbUserId || "default";
      const prefix = `user_${userId}_`;

      const data = await new Promise((resolve) => {
        chrome.storage.local.get([prefix + "lastEchoUrl", prefix + "customWalletAddress", prefix + "nativeWalletAddress"], resolve);
      });
      const activeWallet = data[prefix + "customWalletAddress"] || data[prefix + "nativeWalletAddress"] || "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";
      const fallbackTimelineUrl = `https://studio.milkcat.org/echo/${activeWallet}/all`;
      const storedTimelineUrl = data[prefix + "lastEchoUrl"] || "";
      const timelineUrl = storedTimelineUrl.includes(activeWallet) ? storedTimelineUrl : fallbackTimelineUrl;

      // 3. Create canvas
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2D context");

      // Draw dark glowing background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 800);
      grad.addColorStop(0, "#090d16"); // deep navy
      grad.addColorStop(0.5, "#1e1b4b"); // indigo
      grad.addColorStop(1, "#020617"); // black
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 800);

      // Draw glowing cyber grid borders
      ctx.strokeStyle = "rgba(99, 102, 241, 0.2)"; // indigo glow
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 560, 760);
      
      ctx.strokeStyle = "rgba(139, 92, 246, 0.4)"; // purple glow
      ctx.lineWidth = 1;
      ctx.strokeRect(25, 25, 550, 750);

      // Draw card headers
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CHAMBER PROTOCOL", 300, 80);

      ctx.fillStyle = "#8b5cf6"; // purple label
      ctx.font = "bold 14px monospace";
      ctx.fillText("DECENTRALIZED SOCIAL REBORN KEY", 300, 110);

      // Draw decorative divider lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(100, 140);
      ctx.lineTo(500, 140);
      ctx.stroke();

      // Draw Meme text preview on the card in light slate color
      ctx.fillStyle = "#94a3b8"; // slate-400
      ctx.font = "italic 13px sans-serif";
      ctx.fillText("「他們可以砍掉我們的帳號，但永遠無法閹割我們的自由」", 300, 180);

      // Fetch and draw QR Code from public API
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=99-102-241&bgcolor=2-6-23&data=${encodeURIComponent(timelineUrl)}`;
      
      const qrImage = new Image();
      qrImage.crossOrigin = "anonymous"; // Avoid canvas CORS taint
      
      await new Promise((resolve, reject) => {
        qrImage.onload = () => resolve(true);
        qrImage.onerror = (err) => reject(err);
        qrImage.src = qrUrl;
      });

      // Draw QR Code centered on the canvas
      ctx.drawImage(qrImage, 175, 240, 250, 250);

      // Draw QR Code frame box
      ctx.strokeStyle = "rgba(99, 102, 241, 0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(170, 235, 260, 260);

      ctx.fillStyle = "#a5b4fc"; // indigo-300
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("掃描二維碼訪問我的去中心化重生牆 (Echo)", 300, 530);

      // Draw wallet address at the bottom
      ctx.fillStyle = "#38bdf8"; // sky-400
      ctx.font = "bold 13px monospace";
      ctx.fillText(`KEY: ${activeWallet}`, 300, 600);

      // Draw branding seal
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = "bold 10px monospace";
      ctx.fillText("studio.milkcat.org/echo • Arweave Devnet Storage", 300, 720);

      // 4. Copy both Text and Image to Clipboard (Multi-Mime)
      canvas.toBlob(async (imageBlob) => {
        try {
          const textBlob = new Blob([textToCopy], { type: "text/plain" });
          const item = new ClipboardItem({
            "text/plain": textBlob,
            "image/png": imageBlob
          });
          await navigator.clipboard.write([item]);
          console.log("[Chamber] Copy text and image to clipboard successful.");
          
          genCardBtn.innerText = "✅ 複製成功 & 發文框已開啟！";
          genCardBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        } catch (clipErr) {
          console.warn("[Chamber] Multi-mime clipboard write failed:", clipErr);
          // Fallback to text-only copy
          await navigator.clipboard.writeText(textToCopy);
          genCardBtn.innerText = "✅ 複製聲明 & 發文框已開啟！";
          genCardBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        }
      }, "image/png");

      const dataUrl = canvas.toDataURL("image/png");

      // Auto-fill Facebook Composer if currently on Facebook
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes("facebook.com")) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "OPEN_FB_COMPOSER_AND_FILL",
            payload: {
              text: textToCopy,
              imageUrl: dataUrl
            }
          }, (res) => {
            if (chrome.runtime.lastError) {
              console.debug("[Chamber] Content script was not ready to receive message:", chrome.runtime.lastError.message);
              alert("⚠️ 偵測到擴充功能剛剛完成更新！\n請先「重新整理（F5）」您的 Facebook 頁面以激活最新版腳本。\n\n（備用方案：我們已將圖文複製到剪貼簿，您也可直接在臉書發文框按 Ctrl+V 貼上發佈！）");
            }
          });
        }
      });

      setTimeout(() => {
        genCardBtn.innerText = "⚡ 一鍵生成聲明並發佈";
        genCardBtn.style.background = ""; // revert
        genCardBtn.disabled = false;
      }, 3000);

    } catch (err) {
      console.error("[Chamber] Failed to generate card:", err);
      alert("生成失敗，錯誤: " + err.message);
      genCardBtn.innerText = "⚡ 一鍵生成聲明並發佈";
      genCardBtn.disabled = false;
    }
  });
});
