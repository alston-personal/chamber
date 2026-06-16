/**
 * popup.js - Interactive controls for the Chamber Settings Popup
 */
document.addEventListener("DOMContentLoaded", () => {
  const walletAddressInput = document.getElementById("walletAddress");
  const walletPrivateKeyInput = document.getElementById("walletPrivateKey");
  const imgurClientIdInput = document.getElementById("imgurClientId");
  const isEncryptionEnabledCheckbox = document.getElementById("isEncryptionEnabled");
  const saveBtn = document.getElementById("saveBtn");
  const declarationTextarea = document.getElementById("declarationText");
  const genCardBtn = document.getElementById("genCardBtn");

  const TEMPLATE = `【本人樂觀開朗之 Web3 轉世聲明】

本人不酗酒、不抽菸，無任何精神疾患，亦無任何尋短傾向。特此聲明：若本人帳號無預警消失，絕非自主登出。

若哪天我的臉書遭到『祖克柏』的演算法大刀無情斬首、人間蒸發……
『他們可以砍掉我們的帳號，但永遠無法閹割我們的——自由（FREEDOM！！！）』

想要我的思想嗎？想要的話可以全部給你，去尋找吧！
我把這一生所有的記憶、文字與不被審查的真實言論，都藏在那個去中心化 Web3 的『Chamber』密室裡了！

當這座 Web2 帝國的圍牆倒塌時，我的回聲將在彼岸永恆迴盪。
👉 Chamber 重生網址見留言第一樓 🛡️
（電腦用戶可直接掃描下方身分卡 QR Code 訪問）`;

  // Helper to load and format the editable declaration
  function updateDeclarationText(walletAddr) {
    if (walletAddr) {
      declarationTextarea.value = TEMPLATE;
    } else {
      declarationTextarea.value = TEMPLATE;
    }
  }

  // Load existing configurations
  chrome.storage.local.get(
    ["walletAddress", "walletPrivateKey", "imgurClientId", "isEncryptionEnabled"],
    (data) => {
      if (data.walletAddress) {
        walletAddressInput.value = data.walletAddress;
        updateDeclarationText(data.walletAddress);
      } else {
        updateDeclarationText("0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1");
      }
      if (data.walletPrivateKey) walletPrivateKeyInput.value = data.walletPrivateKey;
      if (data.imgurClientId) imgurClientIdInput.value = data.imgurClientId;
      if (data.isEncryptionEnabled !== undefined) {
        isEncryptionEnabledCheckbox.checked = data.isEncryptionEnabled;
      }
    }
  );

  // Save configurations
  saveBtn.addEventListener("click", () => {
    const walletAddress = walletAddressInput.value.trim();
    const walletPrivateKey = walletPrivateKeyInput.value.trim();
    const imgurClientId = imgurClientIdInput.value.trim();
    const isEncryptionEnabled = isEncryptionEnabledCheckbox.checked;

    if (!walletAddress) {
      alert("請輸入儲存錢包地址！");
      return;
    }

    saveBtn.innerText = "儲存中...";
    saveBtn.disabled = true;

    chrome.storage.local.set({
      walletAddress,
      walletPrivateKey,
      imgurClientId,
      isEncryptionEnabled
    }, () => {
      updateDeclarationText(walletAddress);
      setTimeout(() => {
        saveBtn.innerText = "設定已儲存！";
        saveBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        
        setTimeout(() => {
          saveBtn.innerText = "儲存設定";
          saveBtn.style.background = "linear-gradient(135deg, #6366f1, #4f46e5)";
          saveBtn.disabled = false;
        }, 1500);
      }, 500);
    });
  });

  // Generate Reborn Card on Canvas and download it
  genCardBtn.addEventListener("click", async () => {
    const walletAddress = walletAddressInput.value.trim() || "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";
    const textToCopy = declarationTextarea.value;

    genCardBtn.innerText = "⏳ 正在生成轉世卡...";
    genCardBtn.disabled = true;

    try {
      // 1. Copy the text from the textarea to clipboard
      await navigator.clipboard.writeText(textToCopy);
      console.log("[Chamber] Declaration text copied to clipboard.");

      // 2. Build the target URL for the QR Code
      const timelineUrl = `https://studio.milkcat.org/echo/${walletAddress}`;

      // 3. Create a canvas
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2D context");

      // Draw dark glowing background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 800);
      grad.addColorStop(0, "#0f172a"); // slate-900
      grad.addColorStop(0.5, "#1e1b4b"); // indigo-950
      grad.addColorStop(1, "#020617"); // slate-950
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
      // Custom color matching our palette: foreground indigo (#6366f1), background slate-950 (#020617)
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
      ctx.fillText(`ADDRESS: ${walletAddress}`, 300, 600);

      // Draw branding seal
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = "bold 10px monospace";
      ctx.fillText("studio.milkcat.org/echo • Arweave Immutable Storage", 300, 720);

      // 4. Trigger file download
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "chamber-reborn-card.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 5. Update UI feedback
      genCardBtn.innerText = "✅ 複製成功 & 卡片已下載！";
      genCardBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";

      setTimeout(() => {
        genCardBtn.innerText = "⚡ 生成聲明並下載轉世卡";
        genCardBtn.style.background = "linear-gradient(135deg, #8b5cf6, #6d28d9)";
        genCardBtn.disabled = false;
      }, 3000);

    } catch (err) {
      console.error("[Chamber] Failed to copy text or generate card:", err);
      alert("生成失敗，請手動複製網址！錯誤: " + err.message);
      genCardBtn.innerText = "⚡ 生成聲明並下載轉世卡";
      genCardBtn.disabled = false;
    }
  });
});
