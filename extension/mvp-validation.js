(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChamberMvpValidation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function isValidFacebookPostUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return false;
      // A valid post/reel URL may include a comment context. Ignore that
      // context and validate the remaining stable post identity.
      url.searchParams.delete("comment_id");
      url.searchParams.delete("reply_comment_id");
      const path = url.pathname.replace(/\/+$/, "").toLowerCase();
      const videoId = url.searchParams.get("v") || "";
      return path.includes("/posts/") || path.includes("/permalink") ||
        path.includes("/photos/") || path.includes("/media/set") ||
        path.includes("/videos/") || path.includes("/reel/") ||
        /^\/share\/(?:v|r|p)\/[^/]+/i.test(path) ||
        (path === "/watch" && url.searchParams.has("v")) ||
        (path === "/video.php" && url.searchParams.has("v")) ||
        url.searchParams.has("story_fbid") || url.searchParams.has("fbid") ||
        url.searchParams.has("set") || /^[0-9]{6,}$/.test(videoId);
    } catch (_) {
      return false;
    }
  }

  function isValidThreadsPostUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      if (!["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(host)) return false;
      return /^\/@[^/]+\/post\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function isValidInstagramPostUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      if (!["instagram.com", "www.instagram.com"].includes(host)) return false;
      return /^\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function isValidXPostUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(host)) return false;
      return /^\/[^/]+\/status\/[0-9]+\/?$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function isValidPostUrl(value, platform = "facebook") {
    const p = String(platform || "facebook").toLowerCase();
    if (p === "threads") return isValidThreadsPostUrl(value);
    if (p === "instagram") return isValidInstagramPostUrl(value);
    if (p === "x" || p === "twitter") return isValidXPostUrl(value);
    return isValidFacebookPostUrl(value);
  }

  function validateBackupPayload(payload) {
    if (!payload || payload.isOwnAuthor !== true) {
      return { ok: false, code: "AUTHOR_NOT_CONFIRMED", message: payload?.isOwnAuthor === false ? "無法備份非本人文章" : "無法確認文章作者，已停止備份" };
    }
    const platform = String(payload.platform || "facebook").toLowerCase();
    if (!isValidPostUrl(payload.sourceUrl, platform)) {
      const pName = platform === "threads" ? "Threads" : platform === "instagram" ? "Instagram" : "Facebook";
      return { ok: false, code: "SOURCE_URL_REQUIRED", message: `${pName} 尚未提供這篇文章的永久連結，已停止備份，避免文章張冠李戴。` };
    }
    if (payload.contentExpanded === false) {
      return { ok: false, code: "CONTENT_NOT_EXPANDED", message: "文章文字尚未完整展開，請展開後再備份。" };
    }
    if (payload.media?.album && payload.media?.albumComplete === false) {
      return { ok: false, code: "ALBUM_INCOMPLETE", message: "相簿尚未完整載入，已停止備份。" };
    }
    const hasText = Boolean(String(payload.textContent || payload.content || "").trim());
    const hasMedia = Array.isArray(payload.mediaUrls) && payload.mediaUrls.some((url) => /^https?:\/\//i.test(String(url || "")));
    const hasVideoPermalink = payload.media?.videoDetected === true && isValidPostUrl(payload.sourceUrl, platform);
    if (!hasText && !hasMedia && !hasVideoPermalink) {
      return { ok: false, code: "CONTENT_REQUIRED", message: "沒有可備份的文字或媒體。" };
    }
    return { ok: true, code: "READY", message: "可以備份" };
  }

  return { isValidFacebookPostUrl, isValidThreadsPostUrl, isValidInstagramPostUrl, isValidPostUrl, validateBackupPayload };
});
