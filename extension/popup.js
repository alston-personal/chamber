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
  
  const walletAddressInput = document.getElementById("walletAddress");
  const walletPrivateKeyInput = document.getElementById("walletPrivateKey");
  const imgurClientIdInput = document.getElementById("imgurClientId");
  const isEncryptionEnabledCheckbox = document.getElementById("isEncryptionEnabled");
  
  const timelineUrlText = document.getElementById("timelineUrlText");
  const copyTimelineBtn = document.getElementById("copyTimelineBtn");
  const declarationTextarea = document.getElementById("declarationText");
  const genCardBtn = document.getElementById("genCardBtn");
  
  const connectionDot = document.getElementById("connectionDot");
  const connectionBadge = document.getElementById("connectionBadge");

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

  // 2. Load configurations and handle first-time initialization
  chrome.storage.local.get(
    ["walletAddress", "walletPrivateKey", "imgurClientId", "isEncryptionEnabled", "lastEchoUrl", "lastFbUserIdHash"],
    (data) => {
      let walletAddress = data.walletAddress;
      let walletPrivateKey = data.walletPrivateKey;
      
      // Auto-initialize custodial wallet if not set
      if (!walletAddress) {
        walletAddress = "0x" + generateRandomHex(20); // 20 bytes = 40 hex chars
        chrome.storage.local.set({ walletAddress });
      }
      
      // Auto-initialize encryption key if not set
      if (!walletPrivateKey) {
        walletPrivateKey = generateRandomHex(32); // 32 bytes = 64 hex chars
        chrome.storage.local.set({ walletPrivateKey });
      }

      // Populate Inputs
      walletAddressInput.value = walletAddress;
      walletPrivateKeyInput.value = walletPrivateKey;
      imgurClientIdInput.value = data.imgurClientId || "";
      if (data.isEncryptionEnabled !== undefined) {
        isEncryptionEnabledCheckbox.checked = data.isEncryptionEnabled;
      }

      // Populate Timeline Link
      if (data.lastEchoUrl) {
        timelineUrlText.innerText = data.lastEchoUrl;
        timelineUrlText.style.color = "#38bdf8"; // Active link color
      } else {
        timelineUrlText.innerText = "尚未激活，請先在 Facebook 備份...";
        timelineUrlText.style.color = "#94a3b8"; // Muted color
      }

      declarationTextarea.value = DEFAULT_DECLARATION;
    }
  );

  // 3. Save Settings Handler
  saveBtn.addEventListener("click", () => {
    const walletAddress = walletAddressInput.value.trim();
    const walletPrivateKey = walletPrivateKeyInput.value.trim();
    const imgurClientId = imgurClientIdInput.value.trim();
    const isEncryptionEnabled = isEncryptionEnabledCheckbox.checked;

    if (!walletAddress) {
      alert("請填寫儲存錢包地址！");
      return;
    }

    saveBtn.innerText = "⏳ 儲存中...";
    saveBtn.disabled = true;

    chrome.storage.local.set({
      walletAddress,
      walletPrivateKey,
      imgurClientId,
      isEncryptionEnabled
    }, () => {
      setTimeout(() => {
        saveBtn.innerText = "💾 儲存成功！";
        saveBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        
        setTimeout(() => {
          saveBtn.innerText = "💾 儲存並套用";
          saveBtn.style.background = ""; // revert to class gradient
          saveBtn.disabled = false;
          // Return to dashboard after successful save
          settingsView.classList.add("hidden");
          dashboardView.classList.remove("hidden");
        }, 1000);
      }, 400);
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
    chrome.storage.local.get(["lastEchoUrl"], (data) => {
      const targetUrl = data.lastEchoUrl || "";
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
      // 1. Copy the text from the textarea to clipboard
      await navigator.clipboard.writeText(textToCopy);
      console.log("[Chamber] Declaration text copied to clipboard.");

      // 2. Fetch or fallback target URL for the QR Code
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(["lastEchoUrl", "walletAddress"], resolve);
      });
      const timelineUrl = data.lastEchoUrl || `https://studio.milkcat.org/echo/${data.walletAddress || "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1"}/all`;

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
      const displayAddr = data.walletAddress || "CUSTODIAL_WALLET";
      ctx.fillStyle = "#38bdf8"; // sky-400
      ctx.font = "bold 13px monospace";
      ctx.fillText(`KEY: ${displayAddr}`, 300, 600);

      // Draw branding seal
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = "bold 10px monospace";
      ctx.fillText("studio.milkcat.org/echo • Arweave Devnet Storage", 300, 720);

      // 4. Trigger file download
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "chamber-reborn-card.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 5. Update UI feedback
      genCardBtn.innerText = "✅ 複製聲明並下載轉世卡成功！";
      genCardBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";

      setTimeout(() => {
        genCardBtn.innerText = "⚡ 生成聲明並下載轉世卡";
        genCardBtn.style.background = ""; // revert
        genCardBtn.disabled = false;
      }, 3000);

    } catch (err) {
      console.error("[Chamber] Failed to generate card:", err);
      alert("生成失敗，錯誤: " + err.message);
      genCardBtn.innerText = "⚡ 生成聲明並下載轉世卡";
      genCardBtn.disabled = false;
    }
  });
});
