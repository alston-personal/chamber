(function initChamberDeclaration(global) {
  const DEFAULT_TEXT = `【本人樂觀開朗之 Web3 轉世聲明】

本人不酗酒、不抽菸，無任何精神疾患，亦無任何尋短傾向。特此聲明：若本人帳號無預警消失，絕非自主登出。

若哪天我的臉書遭到演算法無情斬首、人間蒸發……
他們可以砍掉我的帳號，但不能奪走我的內容自主權。

我的記憶、文字與回聲，已備份在 Chamber。
👉 Chamber Echo 網址見留言第一樓
（電腦使用者也可掃描下方 QR Code）`;

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("無法產生轉世卡圖片")), "image/png");
    });
  }

  function loadImage(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error("QR Code 載入逾時")), timeoutMs);
      image.crossOrigin = "anonymous";
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(new Error("QR Code 載入失敗")); };
      image.src = url;
    });
  }

  async function generateCard({ timelineUrl, alias }) {
    if (!timelineUrl) throw new Error("找不到 Echo 時光牆網址");
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("瀏覽器無法建立轉世卡");

    const gradient = ctx.createLinearGradient(0, 0, 0, 800);
    gradient.addColorStop(0, "#090d16");
    gradient.addColorStop(0.52, "#1e1b4b");
    gradient.addColorStop(1, "#020617");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 800);
    ctx.strokeStyle = "rgba(99,102,241,.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 560, 760);
    ctx.strokeStyle = "rgba(139,92,246,.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(26, 26, 548, 748);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText("CHAMBER PROTOCOL", 300, 82);
    ctx.fillStyle = "#a78bfa";
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.fillText("WEB3 REBORN DECLARATION", 300, 112);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("我的內容，由我決定如何保存。", 300, 172);

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=6366f1&bgcolor=020617&data=${encodeURIComponent(timelineUrl)}`;
    try {
      const qrImage = await loadImage(qrUrl);
      ctx.drawImage(qrImage, 175, 225, 250, 250);
    } catch (_) {
      ctx.fillStyle = "#020617";
      ctx.fillRect(175, 225, 250, 250);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("QR Code 暫時無法載入", 300, 350);
    }
    ctx.strokeStyle = "rgba(129,140,248,.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(169, 219, 262, 262);

    ctx.fillStyle = "#c4b5fd";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.fillText("掃描前往我的 Chamber Echo", 300, 525);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 18px ui-monospace, monospace";
    ctx.fillText(`@${String(alias || "chamber").replace(/^@/, "")}`, 300, 575);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("studio.milkcat.org/echo · 測試網", 300, 718);

    return { dataUrl: canvas.toDataURL("image/png"), blob: await canvasBlob(canvas) };
  }

  global.ChamberDeclaration = Object.freeze({ DEFAULT_TEXT, generateCard });
})(globalThis);
