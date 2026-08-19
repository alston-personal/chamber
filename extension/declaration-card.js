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

  async function generateCard({ timelineUrl, alias }) {
    if (!timelineUrl) throw new Error(t("declaration.timelineMissing"));
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t("declaration.canvasFailed"));

    const gradient = ctx.createLinearGradient(0, 0, 0, 800);
    gradient.addColorStop(0, "#090d16");
    gradient.addColorStop(0.52, "#1e1b4b");
    gradient.addColorStop(1, "#020617");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 800);
    ctx.strokeStyle = "rgba(99,102,241,.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 752, 752);
    ctx.strokeStyle = "rgba(139,92,246,.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(32, 32, 736, 736);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText("CHAMBER PROTOCOL", 400, 85);
    ctx.fillStyle = "#a78bfa";
    ctx.font = "bold 15px ui-monospace, monospace";
    ctx.fillText("WEB3 REBORN DECLARATION", 400, 118);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillText(t("declaration.cardTagline"), 400, 175);

    // Draw QR Code locally using ChamberQRCode engine (100% offline, zero network requests)
    try {
      if (global.ChamberQRCode?.drawToContext) {
        global.ChamberQRCode.drawToContext(ctx, timelineUrl, 260, 220, 280, "#6366f1", "#020617");
      } else {
        throw new Error("ChamberQRCode not loaded");
      }
    } catch (_) {
      ctx.fillStyle = "#020617";
      ctx.fillRect(260, 220, 280, 280);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(t("declaration.qrUnavailable"), 400, 360);
    }
    ctx.strokeStyle = "rgba(129,140,248,.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(254, 214, 292, 292);

    ctx.fillStyle = "#c4b5fd";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(t("declaration.scanEcho"), 400, 555);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 20px ui-monospace, monospace";
    ctx.fillText(`@${String(alias || "chamber").replace(/^@/, "")}`, 400, 605);
    ctx.fillStyle = "#64748b";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(t("declaration.network"), 400, 735);

    return { dataUrl: canvas.toDataURL("image/png"), blob: await canvasBlob(canvas) };
  }

  global.ChamberDeclaration = Object.freeze({ getDefaultText: () => t("declaration.defaultText"), generateCard });
})(globalThis);
