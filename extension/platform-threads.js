(() => {
  const t = (key, variables) => globalThis.ChamberI18n?.t?.(key, variables) || key;
  const POST_PATH = /^\/@([^/]+)\/post\/([A-Za-z0-9_-]+)\/?$/i;
  const POST_LINK_SELECTOR = 'a[href*="/post/"]';
  const ACTION_TEXT = /^(like|reply|repost|quote|share|send|more|follow|following|liked|replies|likes|views|讚|回覆|轉發|引用|分享|傳送|更多|追蹤|查看翻譯)$/i;
  const MORE_TEXT = /^(more|see more|顯示更多|查看更多)$/i;
  const PLAYBACK_ERROR_TEXT = /^(?:sorry,?\s+we(?:'|\u2019)?re having trouble playing this video\.?|learn more)$/i;
  const baseHref = () => typeof location !== "undefined" ? location.href : "https://www.threads.com/";

  function parsePermalink(value) {
    try {
      const url = new URL(String(value || ""), baseHref());
      if (!["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(POST_PATH);
      if (!match) return null;
      return {
        author: decodeURIComponent(match[1]).replace(/^@/, ""),
        shortcode: match[2],
        url: `https://www.threads.com/@${encodeURIComponent(match[1].replace(/^@/, ""))}/post/${match[2]}`
      };
    } catch (_) {
      return null;
    }
  }

  const normalizeHandle = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
  const visible = (node) => {
    const rect = node?.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  };
  const unique = (values) => Array.from(new Set(values.filter(Boolean)));

  function isMoreControl(node) {
    if (!node || node.getAttribute?.("aria-haspopup")) return false;
    if (node.querySelector?.('svg[aria-label="More"], svg[aria-label="更多"]')) return false;
    return MORE_TEXT.test(String(node.innerText || node.textContent || "").trim());
  }

  function postLinksIn(node) {
    return Array.from(node?.querySelectorAll?.(POST_LINK_SELECTOR) || [])
      .map((link) => ({ link, parsed: parsePermalink(link.href) }))
      .filter((item) => item.parsed);
  }

  function postContainerFor(target) {
    const semantic = target?.closest?.('article, [role="article"]');
    if (semantic && postLinksIn(semantic).length) return semantic;
    let fallback = null;
    for (let node = target, depth = 0; node && depth < 18; node = node.parentElement, depth += 1) {
      const identities = unique(postLinksIn(node).map(({ parsed }) => parsed.shortcode));
      if (identities.length < 1) {
        if (fallback && identities.length > 1) break;
        continue;
      }
      const hasBody = Array.from(node.querySelectorAll?.('[dir="auto"], img, video') || []).some(visible);
      if (!hasBody) continue;
      fallback ||= node;
      const hasTime = Boolean(node.querySelector('time[datetime]'));
      const controls = node.querySelectorAll('button, [role="button"]').length;
      if (hasTime && controls >= 2) return node;
    }
    return fallback;
  }

  function structuredText(node) {
    if (!node) return "";
    let output = "";
    const blocks = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "PRE"]);
    const walk = (current, root = false) => {
      if (!current) return;
      if (current.nodeType === 3) { output += current.nodeValue || ""; return; }
      if (current.nodeType !== 1 || current.getAttribute?.("aria-hidden") === "true") return;
      if (current.tagName === "BR") { output += "\n"; return; }
      for (const child of Array.from(current.childNodes || [])) walk(child);
      if (!root && blocks.has(current.tagName) && !output.endsWith("\n")) output += "\n";
    };
    walk(node, true);
    return output.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function textForPost(container, parsed) {
    const nested = new Set(Array.from(container.querySelectorAll(POST_LINK_SELECTOR))
      .map((link) => postContainerFor(link))
      .filter((node) => node && node !== container && container.contains(node)));
    const timeLabels = new Set(Array.from(container.querySelectorAll("time")).map((node) => String(node.innerText || node.textContent || "").trim()).filter(Boolean));
    const candidates = Array.from(container.querySelectorAll('[dir="auto"]')).filter((node) => {
      if (!visible(node) || Array.from(nested).some((nestedPost) => nestedPost.contains(node))) return false;
      if (node.querySelector('[dir="auto"]')) return false;
      if (node.closest('button, [role="button"], time')) return false;
      const text = String(node.innerText || node.textContent || "").trim();
      const profileLink = node.closest('a[href^="/@"]');
      if (profileLink && normalizeHandle(new URL(profileLink.href, baseHref()).pathname.split("/")[1]) === normalizeHandle(parsed.author)) return false;
      const enclosingLink = node.closest("a[href]");
      if (enclosingLink && /\/search(?:\?|$)/i.test(enclosingLink.getAttribute("href") || "")) return false;
      return text && !ACTION_TEXT.test(text) && !PLAYBACK_ERROR_TEXT.test(text) && !timeLabels.has(text)
        && normalizeHandle(text) !== normalizeHandle(parsed.author) && !/^\d+[smhdw]$/i.test(text);
    });
    const lines = [];
    for (const node of candidates) {
      const value = structuredText(node) || String(node.innerText || node.textContent || "").trim();
      if (value && !lines.includes(value)) lines.push(value);
    }
    return lines.join("\n").replace(/(?:\n|^)(?:more|see more|顯示更多|查看更多)$/i, "").trim();
  }

  function nestedPostContainers(container) {
    return unique(postLinksIn(container).map(({ link }) => postContainerFor(link)))
      .filter((node) => node && node !== container && container.contains(node));
  }

  function expectedMediaCount(container) {
    let count = 0;
    for (const node of Array.from(container.querySelectorAll('[aria-label], [alt]'))) {
      const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("alt") || ""}`;
      for (const pattern of [/(?:image|photo)\s*\d+\s*(?:of|\/)+\s*(\d+)/ig, /第\s*\d+\s*張[，,\s]*(?:共|總共)\s*(\d+)\s*張/g]) {
        for (const match of label.matchAll(pattern)) count = Math.max(count, Number(match[1] || 0));
      }
    }
    return count;
  }

  function mediaForPost(container) {
    const urls = [];
    let videoDetected = Array.from(container.querySelectorAll('[aria-label], [title]')).some((node) => {
      const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`;
      return /video playback|play video|pause video|播放影片|暫停影片/i.test(label);
    });
    const nested = nestedPostContainers(container);
    for (const node of Array.from(container.querySelectorAll('img, video'))) {
      if (nested.some((quoted) => quoted.contains(node))) continue;
      if (!visible(node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 160 || rect.height < 120) continue;
      if (node.tagName === "VIDEO") videoDetected = true;
      const value = node.tagName === "VIDEO" ? node.poster : (node.currentSrc || node.src);
      if (/^https?:\/\//i.test(value || "") && !urls.includes(value)) urls.push(value);
    }
    const expected = expectedMediaCount(container);
    const hasNext = Array.from(container.querySelectorAll('button, [role="button"]')).some((node) => {
      const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`;
      return /next|下一張|下一個/i.test(label) && node.getAttribute("aria-disabled") !== "true" && !node.disabled;
    });
    return {
      urls,
      meta: {
        primary_fb_cdn: urls[0] || "",
        fallback_backup: "",
        album: expected > 1 || urls.length > 1 || hasNext,
        albumLoadedCount: urls.length,
        albumExpectedCount: expected || (urls.length > 1 ? urls.length : null),
        albumComplete: expected ? urls.length >= expected : !hasNext,
        videoDetected,
        videoSourceType: videoDetected ? "stream" : ""
      }
    };
  }

  function extract(container, expectedHandle, preferredSourceUrl = "") {
    const candidates = postLinksIn(container);
    const preferred = parsePermalink(preferredSourceUrl);
    const own = (preferred && candidates.find(({ parsed }) => parsed.shortcode === preferred.shortcode))
      || candidates.find(({ link }) => postContainerFor(link) === container)
      || candidates[0];
    if (!own) return null;
    const parsed = own.parsed;
    const time = container.querySelector('time[datetime]');
    const publishedMs = time?.dateTime ? Date.parse(time.dateTime) : NaN;
    const media = mediaForPost(container);
    const more = Array.from(container.querySelectorAll('[role="button"], button')).some(isMoreControl);
    const expected = normalizeHandle(expectedHandle);
    return {
      platform: "threads",
      textContent: textForPost(container, parsed),
      sourceUrl: parsed.url,
      sourceCandidates: candidates.map(({ parsed: item }) => item.url),
      authorName: `@${parsed.author}`,
      authorUrl: `https://www.threads.com/@${encodeURIComponent(parsed.author)}`,
      publishedAt: Number.isFinite(publishedMs) ? Math.floor(publishedMs / 1000) : null,
      timestamp: Number.isFinite(publishedMs) ? Math.floor(publishedMs / 1000) : Math.floor(Date.now() / 1000),
      isOwnAuthor: expected ? normalizeHandle(parsed.author) === expected : null,
      contentExpanded: !more,
      mediaUrls: media.urls,
      media: media.meta
    };
  }

  async function expandAndExtract(container, expectedHandle) {
    const more = Array.from(container.querySelectorAll('[role="button"], button')).find(isMoreControl);
    if (more) {
      more.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    let payload = extract(container, expectedHandle);
    if (!payload?.media?.album || payload.media.albumComplete !== false) return payload;
    const collected = [...payload.mediaUrls];
    const expected = payload.media.albumExpectedCount || 0;
    for (let attempt = 0; attempt < Math.min(Math.max(expected || 0, 12), 50); attempt += 1) {
      const next = Array.from(container.querySelectorAll('button, [role="button"]')).find((node) => {
        const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`;
        return visible(node) && /next|下一張|下一個/i.test(label) && node.getAttribute("aria-disabled") !== "true" && !node.disabled;
      });
      if (!next) break;
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const current = extract(container, expectedHandle);
      const before = collected.length;
      for (const url of current?.mediaUrls || []) if (!collected.includes(url)) collected.push(url);
      const banner = document.querySelector(".chamber-picker-banner");
      if (banner) banner.textContent = t("threads.carouselLoading", { loaded: collected.length, expected: expected || "?" });
      if ((expected && collected.length >= expected) || (!expected && collected.length === before)) break;
      payload = current || payload;
    }
    payload.mediaUrls = collected;
    payload.media = {
      ...payload.media,
      primary_fb_cdn: collected[0] || payload.media.primary_fb_cdn || "",
      album: true,
      albumLoadedCount: collected.length,
      albumExpectedCount: expected || collected.length,
      albumComplete: !expected || collected.length >= expected
    };
    return payload;
  }

  function findBySource(sourceUrl) {
    const wanted = parsePermalink(sourceUrl)?.shortcode;
    if (!wanted) return null;
    const containers = unique(Array.from(document.querySelectorAll(POST_LINK_SELECTOR))
      .filter((item) => parsePermalink(item.href)?.shortcode === wanted)
      .map((link) => postContainerFor(link)));
    const scored = containers.filter(Boolean).map((container) => {
      const identities = unique(postLinksIn(container).map(({ parsed }) => parsed.shortcode));
      const hasTime = Boolean(container.querySelector("time[datetime]"));
      const hasBody = Array.from(container.querySelectorAll('[dir="auto"], img, video')).some(visible);
      const controls = container.querySelectorAll('button, [role="button"]').length;
      return {
        container,
        score: (hasTime ? 1000 : 0) + (hasBody ? 300 : 0) + Math.min(controls, 8) * 10 - Math.max(identities.length - 1, 0) * 40
      };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.container || null;
  }

  function getAccountContext() {
    const profileLinks = Array.from(document.querySelectorAll('a[href^="/@"], a[href*="threads.com/@"], a[href*="threads.net/@"]'));
    const scored = profileLinks.map((link) => {
      let handle = "";
      try { handle = new URL(link.href, location.href).pathname.match(/^\/@([^/]+)\/?$/)?.[1] || ""; } catch (_) {}
      if (!handle) return null;
      const label = `${link.getAttribute("aria-label") || ""} ${link.getAttribute("title") || ""}`;
      let score = /profile|個人檔案|個人資料/i.test(label) ? 100 : 0;
      if (link.closest('nav, [role="navigation"], header')) score += 25;
      if (visible(link)) score += 5;
      return { handle: decodeURIComponent(handle), score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    if (scored[0]?.score >= 25) return { handle: scored[0].handle };
    const pageHandle = location.pathname.match(/^\/@([^/]+)\/?$/)?.[1];
    return pageHandle ? { handle: decodeURIComponent(pageHandle), profilePageOnly: true } : null;
  }

  function startPicker(pageUrl, expectedHandle) {
    document.dispatchEvent(new CustomEvent("chamber:cancel-picker"));
    globalThis.__chamberPickerCancel?.();
    return new Promise((resolve) => {
      const style = document.createElement("style");
      style.id = "chamber-picker-style";
      style.textContent = ".chamber-picker-target{outline:3px solid #6366f1!important;outline-offset:3px!important;background:rgba(99,102,241,.08)!important}.chamber-picker-banner{position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);padding:10px 16px;border-radius:10px;background:#312e81;color:#fff;font:600 14px system-ui;box-shadow:0 4px 20px #0008}";
      document.documentElement.appendChild(style);
      const banner = document.createElement("div");
      banner.className = "chamber-picker-banner";
      banner.textContent = t("threads.pickerHover");
      document.documentElement.appendChild(banner);
      let highlighted = null;
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        highlighted?.classList.remove("chamber-picker-target");
        style.remove(); banner.remove();
        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("click", click, true);
        document.removeEventListener("keydown", key, true);
        document.removeEventListener("chamber:cancel-picker", cancel, true);
        globalThis.__chamberPickerCancel = null;
      };
      const finish = (value) => { cleanup(); resolve(value); };
      const cancel = () => finish(null);
      const move = (event) => {
        const next = postContainerFor(event.target);
        if (next === highlighted) return;
        highlighted?.classList.remove("chamber-picker-target");
        highlighted = next;
        highlighted?.classList.add("chamber-picker-target");
      };
      const click = async (event) => {
        const container = postContainerFor(event.target);
        if (!container) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const result = await expandAndExtract(container, expectedHandle);
        finish(result);
      };
      const key = (event) => { if (event.key === "Escape" || event.key === "Esc" || event.keyCode === 27) { event.preventDefault(); cancel(); } };
      document.addEventListener("mousemove", move, true);
      document.addEventListener("click", click, true);
      document.addEventListener("keydown", key, true);
      document.addEventListener("chamber:cancel-picker", cancel, true);
      globalThis.__chamberPickerCancel = cancel;
    });
  }

  function setEditorText(el, textToInsert) {
    if (!el) return;
    const current = (el.innerText || el.textContent || "").trim();
    if (current.includes("本人樂觀開朗之 Web3 轉世聲明") || current.includes("Web3 Reborn Declaration") || (current.length > 50 && current.includes("Chamber"))) {
      return;
    }
    el.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}

    document.execCommand("selectAll", false, null);
    try {
      document.execCommand("insertText", false, textToInsert);
    } catch (_) {}

    if (!el.textContent.trim()) {
      const escapeHtml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const htmlText = textToInsert
        .split("\n")
        .map((l) => (l === "" ? "<br>" : `<div>${escapeHtml(l)}</div>`))
        .join("");
      try {
        document.execCommand("insertHTML", false, htmlText);
      } catch (_) {}
    }

    el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: textToInsert }));
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: textToInsert }));
  }

  async function openComposerAndFill(text, imageUrl) {
    const labels = /new thread|create|post|新增串文|建立|發佈/i;
    const button = Array.from(document.querySelectorAll('button, [role="button"]')).find((node) => {
      const label = `${node.getAttribute("aria-label") || ""} ${node.innerText || node.textContent || ""}`.trim();
      return visible(node) && labels.test(label) && label.length < 80;
    });
    button?.click();
    let textbox = null;
    for (let attempt = 0; attempt < 30 && !textbox; attempt += 1) {
      textbox = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')).find(visible) || null;
      if (!textbox) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!textbox) throw new Error(t("threads.composerMissing"));
    
    if (textbox.tagName === "TEXTAREA") {
      textbox.focus();
      textbox.value = text;
      textbox.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      setEditorText(textbox, text);
    }

    let imageAttached = false;
    if (imageUrl) {
      try {
        const response = await fetch(imageUrl);
        const file = new File([await response.blob()], "chamber-reborn-card.png", { type: "image/png" });
        const input = Array.from(document.querySelectorAll('input[type="file"]')).find((node) => !node.disabled);
        if (input) {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          imageAttached = true;

          // Re-verify text retention after Threads attachment DOM update
          const restore = () => {
            const currentTextbox = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')).find(visible);
            if (currentTextbox && !currentTextbox.innerText?.trim()) {
              if (currentTextbox.tagName === "TEXTAREA") {
                currentTextbox.value = text;
                currentTextbox.dispatchEvent(new Event("input", { bubbles: true }));
              } else {
                setEditorText(currentTextbox, text);
              }
            }
          };
          setTimeout(restore, 400);
          setTimeout(restore, 900);
        }
      } catch (_) {}
    }
    return { success: true, imageAttached };
  }

  globalThis.ChamberThreadsPlatform = {
    parsePermalink,
    getAccountContext,
    openComposerAndFill,
    startPicker,
    refreshSelected(pageUrl, sourceUrl, selectedText, expectedHandle) {
      const container = findBySource(sourceUrl);
      return container ? extract(container, expectedHandle, sourceUrl) : null;
    },
    _testStructuredText: structuredText,
    _testNormalizeHandle: normalizeHandle,
    _testIsMoreControl: isMoreControl
  };
})();
