(function initChamberDeclaration(global) {
  const t = (key) => global.ChamberI18n?.t?.(key) || key;

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(t("declaration.blobFailed"))), "image/png");
    });
  }

  function loadImage(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error(t("declaration.qrTimeout"))), timeoutMs);
      image.crossOrigin = "anonymous";
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(new Error(t("declaration.qrFailed"))); };
      image.src = url;
    });
  }

  async function generateCard({ timelineUrl, alias, theme = "leopard" }) {
    if (!timelineUrl) throw new Error(t("declaration.timelineMissing"));
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t("declaration.canvasFailed"));

    const isCyber = theme === "cyber";
    const isEmerald = theme === "emerald";
    const isSakura = theme === "sakura";

    // Theme Color Palettes
    const bgStart = isCyber ? "#050814" : isEmerald ? "#05120d" : isSakura ? "#180812" : "#140f0c";
    const bgMid   = isCyber ? "#0f1c3f" : isEmerald ? "#0f2b1f" : isSakura ? "#381229" : "#2d1c14";
    const bgEnd   = isCyber ? "#020617" : isEmerald ? "#020f08" : isSakura ? "#0f030a" : "#0c0a09";
    const accentColor = isCyber ? "#06b6d4" : isEmerald ? "#10b981" : isSakura ? "#f472b6" : "#f59e0b";
    const subAccent   = isCyber ? "#38bdf8" : isEmerald ? "#34d399" : isSakura ? "#fb7185" : "#fbbf24";
    const qrBg        = isCyber ? "#0d1527" : isEmerald ? "#0a1b14" : isSakura ? "#200a18" : "#1c1511";

    const gradient = ctx.createLinearGradient(0, 0, 0, 800);
    gradient.addColorStop(0, bgStart);
    gradient.addColorStop(0.52, bgMid);
    gradient.addColorStop(1, bgEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 800);

    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 752, 752);

    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.strokeRect(32, 32, 736, 736);
    ctx.globalAlpha = 1.0;

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText("CHAMBER PROTOCOL", 400, 85);
    ctx.fillStyle = subAccent;
    ctx.font = "bold 15px ui-monospace, monospace";
    ctx.fillText("WEB3 REBORN DECLARATION", 400, 118);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillText(t("declaration.cardTagline"), 400, 175);

    // Draw QR Code locally using ChamberQRCode engine with themed palette
    try {
      if (global.ChamberQRCode?.drawToContext) {
        global.ChamberQRCode.drawToContext(ctx, timelineUrl, 260, 220, 280, accentColor, qrBg);
      } else {
        throw new Error("ChamberQRCode not loaded");
      }
    } catch (_) {
      ctx.fillStyle = qrBg;
      ctx.fillRect(260, 220, 280, 280);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(t("declaration.qrUnavailable"), 400, 360);
    }
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(254, 214, 292, 292);

    ctx.fillStyle = subAccent;
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(t("declaration.scanEcho"), 400, 555);
    ctx.fillStyle = accentColor;
    ctx.font = "bold 22px ui-monospace, monospace";
    ctx.fillText(`@${String(alias || "chamber").replace(/^@/, "")}`, 400, 605);
    ctx.fillStyle = "#78716c";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(t("declaration.network"), 400, 735);

    return { dataUrl: canvas.toDataURL("image/png"), blob: await canvasBlob(canvas) };
  }

  global.ChamberDeclaration = Object.freeze({ getDefaultText: () => t("declaration.defaultText"), generateCard });
})(globalThis);
