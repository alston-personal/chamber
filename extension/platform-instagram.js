(() => {
  const t = (key, variables) => globalThis.ChamberI18n?.t?.(key, variables) || key;
  const POST_PATH = /^\/(?:p|reel)\/([A-Za-z0-9_-]+)\/?$/i;
  const POST_LINK_SELECTOR = 'a[href*="/p/"], a[href*="/reel/"]';
  const ACTION_TEXT = /^(like|reply|repost|quote|share|send|more|follow|following|liked|replies|likes|views|讚|回覆|轉發|引用|分享|傳送|更多|追蹤|查看翻譯|留言|儲存)$/i;
  const MORE_TEXT = /^(more|see more|顯示更多|查看更多|\.\.\.\s*more)$/i;
  const baseHref = () => typeof location !== "undefined" ? location.href : "https://www.instagram.com/";

  function parsePermalink(value) {
    try {
      const url = new URL(String(value || ""), baseHref());
      const host = url.hostname.toLowerCase();
      if (!["instagram.com", "www.instagram.com"].includes(host)) return null;
      const match = url.pathname.match(POST_PATH);
      if (!match) return null;
      const type = url.pathname.startsWith("/reel/") ? "reel" : "p";
      return {
        shortcode: match[1],
        type,
        url: `https://www.instagram.com/${type}/${match[1]}/`
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
    return Array.from(node?.querySelectorAll?.(POST_LINK_SELECTOR) || [])
      .map((link) => ({ link, parsed: parsePermalink(link.href) }))
      .filter((item) => item.parsed);
  }

  function postContainerFor(target) {
    if (!target) return null;
    const direct = target.closest?.('article, div[role="dialog"] article, div[role="dialog"]');
    if (direct) return direct;

    let candidate = null;
    for (let node = target, depth = 0; node && depth < 16; node = node.parentElement, depth += 1) {
      if (node.tagName === "BODY" || node.tagName === "HTML" || node.tagName === "MAIN" || node.tagName === "NAV" || node.tagName === "ASIDE" || node.tagName === "HEADER") break;
      const links = postLinksIn(node);
      const count = unique(links.map(({ parsed }) => parsed.shortcode)).length;
      if (count === 1) {
        candidate = node;
        if (node.querySelector('time[datetime]') || node.querySelectorAll('button, svg').length >= 3) {
          return node;
        }
      } else if (count > 1) {
        // Stop before going up into multi-post timeline
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
    const directLinks = Array.from(container.querySelectorAll('header a[href^="/"], a[role="link"][href^="/"], a[href*="instagram.com/"]'));
    for (const link of directLinks) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/^\/([A-Za-z0-9._]+)\/?$/);
      if (match && !["explore", "reels", "stories", "direct", "p", "reel", "accounts", "your_activity"].includes(match[1].toLowerCase())) {
        return normalizeHandle(match[1]);
      }
    }
    const headerTitle = container.querySelector('header h2, header span, header a, div._aa_y');
    if (headerTitle) {
      const text = headerTitle.textContent.trim().replace(/^@/, "");
      if (text && !["explore", "reels"].includes(text.toLowerCase())) return normalizeHandle(text);
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

  function expectedMediaCount(container) {
    let count = 0;
    for (const node of Array.from(container.querySelectorAll('[aria-label], [alt]'))) {
      const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("alt") || ""}`;
      for (const pattern of [/(?:image|photo|slide)\s*\d+\s*(?:of|\/)+\s*(\d+)/ig, /第\s*\d+\s*張[，,\s]*(?:共|總共)\s*(\d+)\s*張/g]) {
        for (const match of label.matchAll(pattern)) count = Math.max(count, Number(match[1] || 0));
      }
    }
    return count;
  }

  function mediaForPost(container) {
    const urls = [];
    let videoDetected = Array.from(container.querySelectorAll('video')).some(visible);
    for (const img of Array.from(container.querySelectorAll('img[src], img[srcset]'))) {
      if (!visible(img)) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width < 140 && rect.height < 140) continue;
      const srcset = img.getAttribute("srcset");
      let best = img.currentSrc || img.src;
      if (srcset) {
        const parts = srcset.split(",").map(p => p.trim().split(" "));
        const highest = parts[parts.length - 1][0];
        if (highest && highest.startsWith("http")) best = highest;
      }
      if (best && /^https?:\/\//i.test(best) && !best.includes("profile_pic") && !urls.includes(best)) {
        urls.push(best);
      }
    }
    const expected = expectedMediaCount(container);
    const hasNext = Array.from(container.querySelectorAll('button[aria-label*="Next" i], button[aria-label*="下一張" i], div[role="button"][aria-label*="Next" i]')).some(visible);
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

  function textForPost(container, author) {
    const moreBtn = Array.from(container.querySelectorAll('button, [role="button"], span')).find(isMoreControl);
    if (moreBtn && typeof moreBtn.click === "function") {
      try { moreBtn.click(); } catch (_) {}
    }

    // 1. Direct Instagram caption containers (h1 in post modal, div._a9zs / span._a9zs in feed)
    const captionNode = container.querySelector('h1, div._a9zs, span._a9zs, div._a9zm span, div[class*="caption"] span');
    if (captionNode && visible(captionNode)) {
      const txt = structuredText(captionNode);
      if (txt && !ACTION_TEXT.test(txt)) return txt;
    }

    // 2. Candidate caption spans next to author
    const candidateSpans = Array.from(container.querySelectorAll('div._a9zr span, div._a9zs span, span._aacu'))
      .filter((node) => {
        if (!visible(node)) return false;
        if (node.closest('nav, aside, ul[class*="comment"], div[role="menu"]')) return false;
        const text = String(node.innerText || node.textContent || "").trim();
        if (!text || text.length < 2) return false;
        if (ACTION_TEXT.test(text)) return false;
        if (normalizeHandle(text) === normalizeHandle(author)) return false;
        return true;
      });

    if (candidateSpans.length > 0) {
      return structuredText(candidateSpans[0]);
    }

    // 3. Fallback: Search strictly inside article/main content without traversing to feed/nav
    const textBlocks = Array.from(container.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .filter((node) => {
        if (!visible(node)) return false;
        if (node.closest('nav, aside, header, footer, ul[class*="comment"], div[role="menu"]')) return false;
        const text = String(node.innerText || node.textContent || "").trim();
        if (!text || text.length < 3) return false;
        if (ACTION_TEXT.test(text)) return false;
        if (/(?:首頁|Reel|訊息|搜尋|通知|建立|主控板|個人檔案|Meta|翻譯年糕|為你推薦|贊助|原始音訊|讚|留言|分享|儲存|Home|Explore|Messages|Notifications|Create|Profile|Sponsored|Suggested|Likes|Comments)/i.test(text)) return false;
        if (normalizeHandle(text) === normalizeHandle(author)) return false;
        return true;
      });

    return textBlocks.length > 0 ? structuredText(textBlocks[0]) : "";
  }

  function extract(container, expectedHandle, preferredSourceUrl = "") {
    const candidates = postLinksIn(container);
    let own = null;
    if (preferredSourceUrl) {
      const pref = parsePermalink(preferredSourceUrl);
      if (pref) own = candidates.find(({ parsed }) => parsed.shortcode === pref.shortcode);
    }
    own ||= candidates.find(({ link }) => postContainerFor(link) === container) || candidates[0];
    if (!own) {
      const pageParsed = parsePermalink(location.href);
      if (pageParsed) own = { link: null, parsed: pageParsed };
    }
    if (!own) return null;

    const parsed = own.parsed;
    const author = extractAuthorFrom(container) || (expectedHandle ? normalizeHandle(expectedHandle) : "");
    const publishedAt = extractPublishedAt(container) || Math.floor(Date.now() / 1000);
    const media = mediaForPost(container);
    const textContent = textForPost(container, author);
    const expected = normalizeHandle(expectedHandle);

    return {
      platform: "instagram",
      textContent,
      sourceUrl: parsed.url,
      sourceCandidates: candidates.map(({ parsed: p }) => p.url),
      authorName: author ? `@${author}` : "",
      authorUrl: author ? `https://www.instagram.com/${encodeURIComponent(author)}/` : "https://www.instagram.com/",
      publishedAt,
      timestamp: publishedAt,
      isOwnAuthor: expected && author ? normalizeHandle(author) === expected : true,
      contentExpanded: true,
      mediaUrls: media.urls,
      media: media.meta
    };
  }

  async function expandAndExtract(container, expectedHandle) {
    const more = Array.from(container.querySelectorAll('[role="button"], button')).find(isMoreControl);
    if (more) {
      try { more.click(); } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    let payload = extract(container, expectedHandle);
    if (!payload?.media?.album || payload.media.albumComplete !== false) return payload;
    const collected = [...payload.mediaUrls];
    const expected = payload.media.albumExpectedCount || 0;

    for (let attempt = 0; attempt < Math.min(Math.max(expected || 0, 10), 30); attempt += 1) {
      const next = Array.from(container.querySelectorAll('button[aria-label*="Next" i], button[aria-label*="下一張" i], div[role="button"][aria-label*="Next" i]')).find(visible);
      if (!next) break;
      try { next.click(); } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 200));
      const current = extract(container, expectedHandle);
      const before = collected.length;
      for (const url of current?.mediaUrls || []) if (!collected.includes(url)) collected.push(url);
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
    return containers.find(Boolean) || document.querySelector('article, div[role="dialog"] article') || null;
  }

  function getAccountContext() {
    // 1. Check sidebar nav profile link
    const profileLinks = Array.from(document.querySelectorAll('a[href^="/"][role="link"], a[href*="instagram.com/"]'));
    for (const link of profileLinks) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/^\/([A-Za-z0-9._]+)\/?$/);
      if (match) {
        const handle = match[1].toLowerCase();
        if (!["explore", "reels", "stories", "direct", "p", "reel", "accounts", "your_activity", "search"].includes(handle)) {
          const img = link.querySelector('img[alt*="profile" i], img[alt*="大頭貼照" i], img[alt*="頭像" i]');
          if (img || link.querySelector('svg[aria-label*="Profile" i], svg[aria-label*="個人檔案" i]')) {
            return { handle, profilePageOnly: false };
          }
        }
      }
    }

    // 2. Check if current URL is profile page
    const pageMatch = location.pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
    if (pageMatch && !["explore", "reels", "stories", "direct", "p", "reel"].includes(pageMatch[1].toLowerCase())) {
      return { handle: pageMatch[1], profilePageOnly: true };
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
      box.style.border = "3px solid #f43f5e";
      box.style.background = "rgba(244, 63, 94, 0.12)";
      box.style.borderRadius = "12px";
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
        banner.style.background = "#0f172a";
        banner.style.color = "#38bdf8";
        banner.style.border = "2px solid #38bdf8";
        banner.style.borderRadius = "999px";
        banner.style.fontSize = "13px";
        banner.style.fontWeight = "bold";
        banner.style.zIndex = "2147483647";
        banner.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)";
        banner.textContent = "Chamber：請將滑鼠移到 Instagram 貼文上並點選（按 Esc 取消）";
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
        banner.textContent = "Chamber：正在擷取 Instagram 貼文內容與相簿…";
        const result = await expandAndExtract(container, expectedHandle);
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
    const labels = /new post|create|新增貼文|建立|發佈|貼文/i;
    const elements = Array.from(document.querySelectorAll('svg, a, div[role="button"], [role="link"], span, button'));
    let clickTarget = null;
    for (const el of elements) {
      const label = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.innerText || el.textContent
      ].filter(Boolean).join(" ");
      if (labels.test(label) && label.length < 40 && visible(el)) {
        clickTarget = el.closest('a, button, div[role="button"], div[role="menuitem"]') || el;
        break;
      }
    }
    if (clickTarget) {
      clickTarget.click();
    } else {
      const svg = Array.from(document.querySelectorAll('svg[aria-label*="New post" i], svg[aria-label*="建立" i], svg[aria-label*="Create" i]')).find(visible);
      const target = svg?.closest('a, button, div') || svg;
      target?.click();
    }

    let imageAttached = false;
    if (imageUrl) {
      try {
        const response = await fetch(imageUrl);
        const file = new File([await response.blob()], "chamber-reborn-card.png", { type: "image/png" });
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const fileInput = Array.from(document.querySelectorAll('input[type="file"]')).find((node) => !node.disabled);
          if (fileInput) {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            fileInput.files = transfer.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
            imageAttached = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      } catch (_) {}
    }

    return { success: true, imageAttached };
  }

  globalThis.ChamberInstagramPlatform = {
    platform: "instagram",
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
