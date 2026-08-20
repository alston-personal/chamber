(() => {
  const t = (key, variables) => globalThis.ChamberI18n?.t?.(key, variables) || key;
  const POST_PATH = /^\/(?:p|reel)\/([A-Za-z0-9_-]+)\/?$/i;
  const POST_LINK_SELECTOR = 'a[href*="/p/"], a[href*="/reel/"]';
  const ACTION_TEXT = /^(like|reply|repost|quote|share|send|more|follow|following|liked|replies|likes|views|讚|回覆|轉發|引用|分享|傳送|更多|追蹤|查看翻譯|留言|儲存)$/i;
  const MORE_TEXT = /^(?:\.\.\.|…|\s)*(?:more|see more|顯示更多|查看更多|更多|más|mais|続きを読む|他)(?:\.\.\.|…|\s)*$/i;
  const TIMESTAMP_TEXT = /^(?:\d+\s*(?:小時|分鐘|秒|天|週|年|h|m|s|d|w|y|hours?|mins?|days?|ago|前)|\d+\s*[小時分鐘秒天週年hmsdwy]\s*(?:前|ago)?)$/i;
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
    if (node.closest?.('header, nav, time')) return false;
    const text = String(node.innerText || node.textContent || "").trim();
    if (!text || text.length > 25) return false;
    return MORE_TEXT.test(text);
  }

  function postLinksIn(node) {
    if (!node) return [];
    const elements = [];
    if (node.matches?.(POST_LINK_SELECTOR)) elements.push(node);
    if (node.querySelectorAll) elements.push(...Array.from(node.querySelectorAll(POST_LINK_SELECTOR)));
    return elements
      .map((link) => ({ link, parsed: parsePermalink(link.href) }))
      .filter((item) => item.parsed);
  }

  function postContainerFor(target) {
    if (!target) return null;
    const direct = target.closest?.('article, div[role="dialog"] article, div[role="dialog"]');
    if (direct) return direct;

    const directLink = target.closest?.(POST_LINK_SELECTOR);
    if (directLink) {
      return directLink.closest('div[style*="aspect-ratio"], div._aabd, a') || directLink;
    }

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
    return getAccountContext()?.handle || "";
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

  function cleanCaptionText(rawText, author) {
    if (!rawText) return "";
    let txt = rawText.trim();
    // Strip leading action bar text (讚, 回應, 1轉發, 分享, 儲存, etc.)
    txt = txt.replace(/^(?:(?:\d+\s*)?(?:讚|回應|轉發|分享|儲存|Like|Likes|Reply|Replies|Repost|Share|Save)\s*\n+)+/gim, '').trim();
    if (author) {
      txt = txt.replace(new RegExp(`^@?${author}\\s*`, 'i'), '').trim();
    }
    // Strip any remaining action bar labels
    txt = txt.replace(/^(?:(?:\d+\s*)?(?:讚|回應|轉發|分享|儲存|Like|Likes|Reply|Replies|Repost|Share|Save)\s*\n+)+/gim, '').trim();
    // Strip trailing action labels: ... 更多, 翻譯年糕, 查看翻譯, See translation
    txt = txt.replace(/(?:(?:\.\.\.|…)?\s*(?:更多|顯示更多|查看更多|more|see more|翻譯年糕|See translation|查看翻譯)\s*)+$/i, '').trim();
    // Strip trailing comment counters like 查看全部 1 則留言
    txt = txt.replace(/(?:\n|^)(?:查看全部\s*\d+\s*則留言|View all\s*\d+\s*comments?)(?:\n|$).*$/is, '').trim();
    return txt;
  }

  function textForPost(container, author) {
    const isSingleDialog = Boolean(container.closest?.('div[role="dialog"]') || container.matches?.('div[role="dialog"]'));

    // 1. Single Post Dialog / Modal: Caption is in h1 or first list item of the comments list
    if (isSingleDialog) {
      const h1Node = container.querySelector('h1');
      if (h1Node && visible(h1Node)) {
        const txt = cleanCaptionText(structuredText(h1Node), author);
        if (txt && !ACTION_TEXT.test(txt) && !TIMESTAMP_TEXT.test(txt)) return txt;
      }

      // In modal/dialog, the caption is strictly the first item in the comments list (or div._a9zm)
      const firstItem = container.querySelector('ul > div > li:first-child, ul > li:first-child, div._a9zm, div._a9zr');
      if (firstItem && visible(firstItem)) {
        // Exclude if it's a comment from a different user when post author is known
        const userLink = firstItem.querySelector('a[href^="/"]');
        const userHandle = userLink ? normalizeHandle(userLink.getAttribute("href")?.split("/")?.[1]) : "";
        if (!author || !userHandle || userHandle === normalizeHandle(author)) {
          const txt = cleanCaptionText(structuredText(firstItem), author);
          if (txt && !ACTION_TEXT.test(txt) && !TIMESTAMP_TEXT.test(txt)) return txt;
        }
      }
    }

    // 2. Feed Post: Find caption block associated with the post author
    if (author) {
      const authorLinks = Array.from(container.querySelectorAll(`a[href^="/${author}/"], a[href^="/${author}"], a[href*="instagram.com/${author}"]`))
        .filter((node) => visible(node) && !node.closest('header, nav, time, button, svg'));

      for (const link of authorLinks) {
        let captionBlock = link.closest('div, span, p');
        if (captionBlock === link) captionBlock = link.parentElement;
        while (captionBlock && captionBlock.parentElement && captionBlock.parentElement !== container) {
          const parent = captionBlock.parentElement;
          if (parent.matches?.('article, div[role="dialog"]') || parent.tagName === "HEADER") break;
          // Do not climb into containers that include the action bar (like/comment/share icons)
          if (parent.querySelector('svg[aria-label*="讚"], svg[aria-label*="Like"], svg[aria-label*="留言"], svg[aria-label*="Comment"]')) break;
          const parentText = structuredText(parent);
          if (/^(?:讚|回應|轉發|分享|儲存|Like|Comment)/i.test(parentText.trim())) break;
          captionBlock = parent;
        }

        if (captionBlock) {
          const txt = cleanCaptionText(structuredText(captionBlock), author);
          if (txt && txt.length > 1 && !ACTION_TEXT.test(txt) && !TIMESTAMP_TEXT.test(txt)) {
            return txt;
          }
        }
      }
    }

    // 3. Fallback: Search candidate caption spans inside post body (excluding header, time, comments)
    const candidateNodes = Array.from(container.querySelectorAll('div._a9zs, span._a9zs, span._aacu, div[dir="auto"], span[dir="auto"], div._a72d'))
      .filter((node) => {
        if (!visible(node)) return false;
        if (node.closest('header, nav, aside, time, button, ul > li:not(:first-child), div[role="menu"]')) return false;
        const text = String(node.innerText || node.textContent || "").trim();
        if (!text || text.length < 2) return false;
        if (ACTION_TEXT.test(text) || TIMESTAMP_TEXT.test(text)) return false;
        if (/(?:首頁|Reel|訊息|搜尋|通知|建立|主控板|個人檔案|Meta|翻譯年糕|為你推薦|贊助|原始音訊|讚|留言|分享|儲存|Home|Explore|Messages|Notifications|Create|Profile|Sponsored|Suggested|Likes|Comments|查看全部.*則留言|View all.*comments|加強推廣貼文|查看洞察報告)/i.test(text)) return false;
        return true;
      });

    // Sort candidates by text length descending so full caption is preferred over small fragments
    candidateNodes.sort((a, b) => (structuredText(b).length - structuredText(a).length));

    for (const node of candidateNodes) {
      const txt = cleanCaptionText(structuredText(node), author);
      if (txt && txt.length > 2 && !ACTION_TEXT.test(txt) && !TIMESTAMP_TEXT.test(txt)) {
        return txt;
      }
    }

    // 4. Thumbnail alt fallback (contains Instagram caption text on grid thumbnails)
    const imgAlt = container.querySelector('img[alt]')?.getAttribute('alt') || "";
    if (imgAlt && imgAlt.length > 10) {
      const cleaned = imgAlt.replace(/^Photo by .+? on .+\.(?:\s*May be an image of .+?\.)?\s*/i, '').trim();
      if (cleaned && !ACTION_TEXT.test(cleaned) && !TIMESTAMP_TEXT.test(cleaned)) return cleaned;
    }

    return "";
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
    const hasMore = Array.from(container.querySelectorAll('[role="button"], button, span, div, a')).some((el) => visible(el) && isMoreControl(el));

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
      contentExpanded: !hasMore,
      mediaUrls: media.urls,
      media: media.meta
    };
  }

  async function expandAndExtract(container, expectedHandle) {
    let targetScope = container;

    // If selected node is a profile grid thumbnail, click it to open the post dialog for full extraction
    const isGridThumb = Boolean(container.closest?.('div._aabd, div[style*="aspect-ratio"]') || (container.tagName === "A" && container.href.includes("/p/")));
    if (isGridThumb && !container.closest?.('article, div[role="dialog"]')) {
      const link = container.matches?.('a[href*="/p/"], a[href*="/reel/"]') ? container : container.querySelector?.('a[href*="/p/"], a[href*="/reel/"]');
      if (link) {
        link.click();
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 100));
          const dialog = document.querySelector('div[role="dialog"] article, div[role="dialog"]');
          if (dialog) {
            targetScope = dialog;
            break;
          }
        }
      }
    }

    const moreControls = Array.from(targetScope.querySelectorAll('[role="button"], button, span, div, a')).filter((el) => visible(el) && isMoreControl(el));
    for (const more of moreControls) {
      try { if (typeof more.click === "function") more.click(); } catch (_) {}
    }
    if (moreControls.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    let payload = extract(targetScope, expectedHandle);
    if (!payload?.media?.album || payload.media.albumComplete !== false) return payload;
    const collected = [...payload.mediaUrls];
    const expected = payload.media.albumExpectedCount || 0;

    for (let attempt = 0; attempt < Math.min(Math.max(expected || 0, 10), 30); attempt += 1) {
      const next = Array.from(targetScope.querySelectorAll('button[aria-label*="Next" i], button[aria-label*="下一張" i], div[role="button"][aria-label*="Next" i]')).find(visible);
      if (!next) break;
      try { next.click(); } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 200));
      const current = extract(targetScope, expectedHandle);
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
        let container = postContainerFor(e.target);
        if (!container) {
          const link = e.target.closest?.('a[href*="/p/"], a[href*="/reel/"]');
          if (link) container = link;
        }
        if (!container) return;
        e.preventDefault();
        e.stopImmediatePropagation();
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
    // 1. Look specifically for the Create / New Post button on the left sidebar
    const createIcons = Array.from(document.querySelectorAll('svg[aria-label*="New post" i], svg[aria-label*="建立" i], svg[aria-label*="Create" i], svg[aria-label*="貼文" i]'));
    let clickTarget = createIcons.find(visible)?.closest('a, button, div[role="button"], div[role="menuitem"]');

    if (!clickTarget) {
      const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], div[role="menuitem"], [role="link"], span'));
      for (const el of elements) {
        const label = [
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.innerText || el.textContent
        ].filter(Boolean).join(" ");
        if (labels.test(label) && label.length < 30 && visible(el)) {
          clickTarget = el.closest('a, button, div[role="button"], div[role="menuitem"]') || el;
          break;
        }
      }
    }

    if (clickTarget) {
      clickTarget.click();
    }

    // 2. If Instagram opened a submenu with "貼文" / "Post", click it
    await new Promise((resolve) => setTimeout(resolve, 350));
    const subMenuItem = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="menu"] div[role="button"], [role="menuitem"], span, div')).find((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      return (text === "貼文" || text === "Post") && visible(el);
    });
    subMenuItem?.closest('div[role="button"], a, button, [role="menuitem"]')?.click();

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
            fileInput.dispatchEvent(new Event("input", { bubbles: true }));
            imageAttached = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      } catch (_) {}
    }

    // 3. Advance wizard from Crop -> Filter -> Caption
    for (let step = 0; step < 2; step += 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const nextBtn = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] button, header div[role="button"]')).find((b) => {
        const t = (b.innerText || b.textContent || "").trim();
        return /^(下一步|Next)$/i.test(t) && visible(b);
      });
      if (nextBtn) {
        nextBtn.click();
      }
    }

    // 4. Fill caption on the final caption screen
    await new Promise((resolve) => setTimeout(resolve, 600));
    const captionBox = document.querySelector('div[role="dialog"] textarea, div[role="dialog"] div[contenteditable="true"][role="textbox"], div[role="dialog"] [aria-label*="說明" i], div[role="dialog"] [aria-label*="Write a caption" i]');
    if (captionBox) {
      captionBox.focus();
      if (captionBox.tagName === "TEXTAREA") {
        captionBox.value = text;
        captionBox.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
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
