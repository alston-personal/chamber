(() => {
  const t = (key, variables) => globalThis.ChamberI18n?.t?.(key, variables) || key;
  const TWEET_PATH = /^\/([^/]+)\/status\/([0-9]+)\/?$/i;
  const TWEET_LINK_SELECTOR = 'a[href*="/status/"]';
  const ACTION_TEXT = /^(reply|repost|like|view|share|bookmark|analytics|回覆|轉發|喜歡|讚|書籤|分享|查看觀看次數|查看互動|更多)$/i;
  const MORE_TEXT = /^(show more|see more|顯示更多|查看更多|\.\.\.\s*more)$/i;
  const baseHref = () => typeof location !== "undefined" ? location.href : "https://x.com/";

  function parsePermalink(value) {
    try {
      const url = new URL(String(value || ""), baseHref());
      const host = url.hostname.toLowerCase();
      if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(host)) return null;
      const match = url.pathname.match(TWEET_PATH);
      if (!match) return null;
      const author = decodeURIComponent(match[1]).replace(/^@/, "");
      const tweetId = match[2];
      return {
        author,
        tweetId,
        url: `https://x.com/${encodeURIComponent(author)}/status/${tweetId}`
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
    return MORE_TEXT.test(String(node.innerText || node.textContent || "").trim());
  }

  function postLinksIn(node) {
    return Array.from(node?.querySelectorAll?.(TWEET_LINK_SELECTOR) || [])
      .map((link) => ({ link, parsed: parsePermalink(link.href) }))
      .filter((item) => item.parsed);
  }

  function postContainerFor(target) {
    if (!target) return null;
    const direct = target.closest?.('article[data-testid="tweet"], article, div[data-testid="cellInnerDiv"]');
    if (direct) return direct;

    let candidate = null;
    for (let node = target, depth = 0; node && depth < 16; node = node.parentElement, depth += 1) {
      if (node.tagName === "BODY" || node.tagName === "HTML" || node.tagName === "MAIN" || node.tagName === "NAV" || node.tagName === "ASIDE" || node.tagName === "HEADER" || node.tagName === "SECTION") break;
      const links = postLinksIn(node);
      const count = unique(links.map(({ parsed }) => parsed.tweetId)).length;
      if (count === 1) {
        candidate = node;
        if (node.querySelector('time[datetime]') || node.querySelectorAll('button, svg').length >= 3) {
          return node;
        }
      } else if (count > 1) {
        break;
      }
    }
    return candidate || target.closest?.('article') || null;
  }

  function structuredText(node) {
    if (!node) return "";
    let output = "";
    const blocks = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "PRE", "H1", "H2", "H3"]);
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

  function extractAuthorFrom(container) {
    if (!container) return "";
    const userNamesNode = container.querySelector('[data-testid="User-Name"]');
    if (userNamesNode) {
      const handleLink = userNamesNode.querySelector('a[href^="/"]');
      if (handleLink) {
        const href = handleLink.getAttribute("href") || "";
        const match = href.match(/^\/([A-Za-z0-9_]+)\/?$/);
        if (match) return normalizeHandle(match[1]);
      }
    }
    const directLinks = Array.from(container.querySelectorAll('a[role="link"][href^="/"]'));
    for (const link of directLinks) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/^\/([A-Za-z0-9_]+)\/?$/);
      if (match && !["home", "explore", "notifications", "messages", "bookmarks", "jobs", "lists", "premium", "verified-choose", "i", "settings"].includes(match[1].toLowerCase())) {
        return normalizeHandle(match[1]);
      }
    }
    return "";
  }

  function extractPublishedAt(container) {
    const timeNode = container?.querySelector?.('time[datetime]');
    if (!timeNode) return null;
    const datetime = timeNode.getAttribute('datetime');
    if (datetime) {
      const timestamp = Math.floor(new Date(datetime).getTime() / 1000);
      if (!isNaN(timestamp) && timestamp > 0) return timestamp;
    }
    return null;
  }

  function mediaForPost(container) {
    const urls = [];
    let videoDetected = Array.from(container.querySelectorAll('[data-testid="videoPlayer"], [data-testid="videoComponent"], video')).some(visible);
    
    // Images in tweet (photos, albums, and link preview cards)
    const imgSelectors = [
      'img[src*="pbs.twimg.com/media/"]',
      'img[src*="pbs.twimg.com/card_img/"]',
      'img[src*="pbs.twimg.com/semantic_core_img/"]',
      '[data-testid="card.wrapper"] img',
      '[data-testid="card.layoutLarge.detail"] img',
      '[data-testid="card.layoutSmall.detail"] img',
      '[data-testid="tweetPhoto"] img'
    ];
    for (const img of Array.from(container.querySelectorAll(imgSelectors.join(", ")))) {
      if (!visible(img)) continue;
      const src = img.currentSrc || img.src;
      if (!src) continue;
      // Convert to high res
      let highRes = src;
      try {
        const url = new URL(src);
        if (url.hostname.includes("twimg.com")) {
          if (url.searchParams.has("name")) url.searchParams.set("name", "large");
        }
        highRes = url.toString();
      } catch (_) {}
      if (highRes && /^https?:\/\//i.test(highRes) && !urls.includes(highRes)) {
        urls.push(highRes);
      }
    }

    // Videos / GIFs in tweet
    for (const vid of Array.from(container.querySelectorAll('video'))) {
      if (!visible(vid)) continue;
      videoDetected = true;
      if (vid.poster && /^https?:\/\//i.test(vid.poster) && !urls.includes(vid.poster)) {
        urls.push(vid.poster);
      }
    }

    return {
      urls,
      meta: {
        primary_fb_cdn: urls[0] || "",
        fallback_backup: "",
        album: urls.length > 1,
        albumLoadedCount: urls.length,
        albumExpectedCount: urls.length > 1 ? urls.length : null,
        albumComplete: true,
        videoDetected,
        videoSourceType: videoDetected ? "stream" : ""
      }
    };
  }

  function extractCardAndLinks(container, baseText) {
    let text = baseText;
    const cards = [];

    // 1. Twitter Cards / Link preview wrappers
    const cardWrappers = Array.from(container.querySelectorAll('[data-testid="card.wrapper"], [data-testid="card.layoutLarge.detail"], [data-testid="card.layoutSmall.detail"], div[data-testid="preview"]'));
    for (const card of cardWrappers) {
      const linkNode = card.querySelector('a[href]') || card.closest('a[href]') || (card.tagName === 'A' ? card : null);
      let href = linkNode?.href || linkNode?.getAttribute('href') || "";
      if (!href || href.startsWith("/") || href.startsWith("#")) continue;

      const cardTexts = Array.from(card.querySelectorAll('span, div'))
        .map((s) => s.textContent.trim())
        .filter((s) => s && s.length > 1 && !/^(promoted|sponsored|廣告)$/i.test(s));
      const cardTitle = cardTexts[0] || "";
      if (!cards.some((c) => c.href === href)) {
        cards.push({ href, title: cardTitle });
      }
    }

    // 2. Inline links in tweetText (e.g. t.co links or external URLs)
    const tweetTextNode = container.querySelector('[data-testid="tweetText"]');
    const linksInText = Array.from((tweetTextNode || container).querySelectorAll('a[href*="t.co"], a[target="_blank"][href^="http"]'));
    for (const a of linksInText) {
      const href = a.href || a.getAttribute("href") || "";
      if (!href || href.startsWith("/") || href.startsWith("#")) continue;
      const display = a.textContent.trim();
      if (!cards.some((c) => c.href === href)) {
        cards.push({ href, title: display });
      }
    }

    // Append rich link / card snippets if not already contained in text
    const linkSnippets = [];
    for (const card of cards) {
      const urlToAppend = card.href;
      // Check if text already has this URL
      if (!text.includes(urlToAppend)) {
        if (card.title && card.title !== card.href && !text.includes(card.title)) {
          linkSnippets.push(`🔗 ${card.title}\n${urlToAppend}`);
        } else {
          linkSnippets.push(`🔗 ${urlToAppend}`);
        }
      }
    }

    if (linkSnippets.length > 0) {
      text = text ? `${text}\n\n${linkSnippets.join("\n\n")}` : linkSnippets.join("\n\n");
    }

    return text.trim();
  }

  function textForPost(container) {
    const moreBtn = Array.from(container.querySelectorAll('[role="button"], button, span')).find(isMoreControl);
    if (moreBtn && typeof moreBtn.click === "function") {
      try { moreBtn.click(); } catch (_) {}
    }

    const tweetTextNode = container.querySelector('[data-testid="tweetText"]');
    const baseText = tweetTextNode ? structuredText(tweetTextNode) : "";
    return extractCardAndLinks(container, baseText);
  }

  function extract(container, expectedHandle, preferredSourceUrl = "") {
    const candidates = postLinksIn(container);
    let own = null;
    if (preferredSourceUrl) {
      const pref = parsePermalink(preferredSourceUrl);
      if (pref) own = candidates.find(({ parsed }) => parsed.tweetId === pref.tweetId);
    }
    own ||= candidates.find(({ link }) => postContainerFor(link) === container) || candidates[0];
    if (!own) {
      const pageParsed = parsePermalink(location.href);
      if (pageParsed) own = { link: null, parsed: pageParsed };
    }
    if (!own) return null;

    const parsed = own.parsed;
    const author = extractAuthorFrom(container) || parsed.author || (expectedHandle ? normalizeHandle(expectedHandle) : "");
    const publishedAt = extractPublishedAt(container) || Math.floor(Date.now() / 1000);
    const media = mediaForPost(container);
    const textContent = textForPost(container);
    const expected = normalizeHandle(expectedHandle);

    return {
      platform: "x",
      textContent,
      sourceUrl: parsed.url,
      sourceCandidates: candidates.map(({ parsed: p }) => p.url),
      authorName: author ? `@${author}` : `@${parsed.author}`,
      authorUrl: `https://x.com/${encodeURIComponent(author || parsed.author)}`,
      publishedAt,
      timestamp: publishedAt,
      isOwnAuthor: expected && author ? normalizeHandle(author) === expected : true,
      contentExpanded: true,
      mediaUrls: media.urls,
      media: media.meta
    };
  }

  function findBySource(sourceUrl) {
    const wanted = parsePermalink(sourceUrl)?.tweetId;
    if (!wanted) return null;
    const containers = unique(Array.from(document.querySelectorAll(TWEET_LINK_SELECTOR))
      .filter((item) => parsePermalink(item.href)?.tweetId === wanted)
      .map((link) => postContainerFor(link)));
    return containers.find(Boolean) || document.querySelector('article[data-testid="tweet"], article') || null;
  }

  function getAccountContext() {
    // Check user avatar button in bottom left nav
    const accountBtn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [aria-label*="Account menu" i], [aria-label*="帳號選單" i]');
    if (accountBtn) {
      const handleSpan = Array.from(accountBtn.querySelectorAll('span')).find((s) => /^@[A-Za-z0-9_]+$/.test(s.textContent.trim()));
      if (handleSpan) {
        return { handle: normalizeHandle(handleSpan.textContent), profilePageOnly: false };
      }
    }

    // Check profile nav link
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute("href") || "";
      const match = href.match(/^\/([A-Za-z0-9_]+)\/?$/);
      if (match) return { handle: normalizeHandle(match[1]), profilePageOnly: false };
    }

    // Check if current page is user profile
    const match = location.pathname.match(/^\/([A-Za-z0-9_]+)\/?$/);
    if (match && !["home", "explore", "notifications", "messages", "bookmarks", "jobs", "lists", "premium", "i", "settings"].includes(match[1].toLowerCase())) {
      return { handle: normalizeHandle(match[1]), profilePageOnly: true };
    }

    return { handle: "", profilePageOnly: false };
  }

  function highlight(node) {
    let box = document.getElementById("chamber-picker-highlight");
    if (!box) {
      box = document.createElement("div");
      box.id = "chamber-picker-highlight";
      box.style.position = "fixed";
      box.style.pointerEvents = "none";
      box.style.border = "3px solid #1d9bf0";
      box.style.background = "rgba(29, 155, 240, 0.12)";
      box.style.borderRadius = "14px";
      box.style.zIndex = "2147483640";
      box.style.transition = "all 0.1s ease";
      document.documentElement.appendChild(box);
    }
    if (!node) {
      box.style.display = "none";
      return;
    }
    const rect = node.getBoundingClientRect();
    box.style.display = "block";
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  function startPicker(pageUrl, expectedHandle) {
    return new Promise((resolve) => {
      document.documentElement.setAttribute("data-chamber-picker-session", "active");
      let banner = document.getElementById("chamber-picker-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "chamber-picker-banner";
        banner.className = "chamber-picker-banner";
        banner.style.position = "fixed";
        banner.style.top = "16px";
        banner.style.left = "50%";
        banner.style.transform = "translateX(-50%)";
        banner.style.padding = "10px 20px";
        banner.style.background = "#000000";
        banner.style.color = "#1d9bf0";
        banner.style.border = "2px solid #1d9bf0";
        banner.style.borderRadius = "999px";
        banner.style.fontSize = "13px";
        banner.style.fontWeight = "bold";
        banner.style.zIndex = "2147483647";
        banner.style.boxShadow = "0 10px 25px rgba(0,0,0,0.7)";
        banner.textContent = "Chamber：請將滑鼠移到 X (Twitter) 推文上並點選（按 Esc 取消）";
        document.documentElement.appendChild(banner);
      }

      let activeTarget = null;

      const cleanup = () => {
        document.documentElement.removeAttribute("data-chamber-picker-session");
        document.removeEventListener("mousemove", onMouseMove, true);
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("chamber:cancel-picker", cancel, true);
        banner?.remove();
        highlight(null);
      };

      const finish = (result) => {
        cleanup();
        resolve(result);
      };

      const cancel = () => finish(null);

      const onMouseMove = (e) => {
        const container = postContainerFor(e.target);
        if (container) {
          activeTarget = container;
          highlight(container);
        } else {
          highlight(null);
        }
      };

      const onClick = async (e) => {
        const container = postContainerFor(e.target);
        if (!container) return;
        e.preventDefault();
        e.stopPropagation();
        banner.textContent = "Chamber：正在擷取 X 推文內容與媒體…";
        const result = extract(container, expectedHandle);
        finish(result);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape" || e.keyCode === 27) {
          e.preventDefault();
          cancel();
        }
      };

      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("chamber:cancel-picker", cancel, true);
      globalThis.__chamberPickerCancel = cancel;
    });
  }

  async function openComposerAndFill(text, imageUrl) {
    const newTweetBtn = document.querySelector('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"], [aria-label*="Post" i], [aria-label*="發文" i]');
    
    let modal = document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (!modal && newTweetBtn) {
      newTweetBtn.click();
      for (let attempt = 0; attempt < 25 && !modal; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        modal = document.querySelector('[role="dialog"], [aria-modal="true"]');
      }
    }

    let imageAttached = false;
    if (imageUrl) {
      try {
        const response = await fetch(imageUrl);
        const file = new File([await response.blob()], "chamber-reborn-card.png", { type: "image/png" });
        const fileInput = (modal ? modal.querySelector('input[type="file"][accept*="image"]') : null)
          || Array.from(document.querySelectorAll('input[type="file"][accept*="image"]')).find((node) => !node.disabled);
        if (fileInput) {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          fileInput.files = transfer.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
          imageAttached = true;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (_) {}
    }

    let textbox = null;
    let targetScope = modal || document;
    for (let attempt = 0; attempt < 30 && !textbox; attempt += 1) {
      modal = document.querySelector('[role="dialog"], [aria-modal="true"]');
      targetScope = modal || document;
      textbox = Array.from(targetScope.querySelectorAll('[data-testid="tweetTextarea_0"], [contenteditable="true"][role="textbox"]')).find(visible) || null;
      if (!textbox) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!textbox) throw new Error("Could not locate X tweet composer");

    textbox.focus();
    const current = (textbox.innerText || textbox.textContent || "").trim();
    if (!current.includes("本人樂觀開朗") && !current.includes("Chamber")) {
      const range = document.createRange();
      range.selectNodeContents(textbox);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete");

      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        textbox.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      } catch (_) {}

      if (!textbox.textContent.trim()) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]) {
            try { document.execCommand('insertText', false, lines[i]); } catch (_) {}
          }
          if (i < lines.length - 1) {
            try { document.execCommand('insertParagraph', false, null); } catch (_) {}
          }
        }
      }
    }

    return { success: true, imageAttached };
  }

  globalThis.ChamberXPlatform = {
    platform: "x",
    parsePermalink,
    getAccountContext,
    extractAuthorFrom,
    extractPublishedAt,
    extractMediaFrom: mediaForPost,
    startPicker,
    openComposerAndFill,
    refreshSelected(pageUrl, sourceUrl, selectedText, expectedHandle) {
      const container = findBySource(sourceUrl);
      return container ? extract(container, expectedHandle, sourceUrl) : null;
    }
  };
})();
