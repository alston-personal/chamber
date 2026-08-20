(() => {
  const t = (key, variables) => globalThis.ChamberI18n?.t?.(key, variables) || key;
  const messageSelector = 'div[data-ad-preview="message"], div[data-testid="post_message"], div[data-ad-comet-preview="message"]';
  const textSelector = '[dir="auto"]';
  // Facebook uses different canonical links for feed posts, photos,
  // videos, reels, shares, and some legacy fbid URLs.
  const permalinkSelector = 'a[href*="/posts/"], a[href*="/permalink"], a[href*="story_fbid"], a[href*="/photos/"], a[href*="/media/set/"], a[href*="/videos/"], a[href*="/reel/"], a[href*="/watch"], a[href*="video.php"], a[href*="/share/"], a[href*="fbid="], a[href*="?v="], a[href*="&v="]';

  const isCommentUrl = (url) => /[?&](comment_id|reply_comment_id)=/i.test(url || "");
  const isUsablePostUrl = (url) => {
    try {
      const parsed = new URL(url, location.href);
      // Facebook frequently appends the clicked comment context to the
      // post/reel permalink itself. The path still identifies the post; only
      // the comment parameters must be ignored. A profile URL carrying only
      // comment_id remains invalid because its path has no post identity.
      parsed.searchParams.delete('comment_id');
      parsed.searchParams.delete('reply_comment_id');
      const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
      const videoId = parsed.searchParams.get('v') || '';
      if (!path) return false;
      if (path === '/watch') return parsed.searchParams.has('v');
      if (path === '/video.php') return parsed.searchParams.has('v');
      if (path === '/reel' || path === '/share') return false;
      if (path.endsWith('/reel') || path.endsWith('/watch')) return path.split('/').filter(Boolean).length >= 2;
      if (path.endsWith('/share')) return false;
      return path.includes('/posts/') || path.includes('/permalink') || path.includes('/photos/') || path.includes('/media/set/') || path.includes('/videos/') || path.includes('/reel/') || path.includes('/watch/') || path.includes('/share/') || parsed.searchParams.has('story_fbid') || parsed.searchParams.has('fbid') || parsed.searchParams.has('set') || /^[0-9]{6,}$/.test(videoId);
    } catch (_) { return false; }
  };
  const baseUrl = (url) => {
    try {
      const parsed = new URL(url, location.href);
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    } catch (_) {
      return "";
    }
  };
  const cleanPostUrl = (url) => {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (/^__|^(ref|refid|paipv|eav|mibextid|comment_id|reply_comment_id)$/i.test(key)) parsed.searchParams.delete(key);
      }
      return parsed.href;
    } catch (_) { return ""; }
  };
  const postUrlIdentity = (url) => {
    try {
      const parsed = new URL(cleanPostUrl(url), location.href);
      const identityParams = ['story_fbid', 'fbid', 'set', 'v']
        .filter((key) => parsed.searchParams.has(key))
        .map((key) => `${key}=${parsed.searchParams.get(key)}`)
        .join('&');
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}${identityParams ? `?${identityParams}` : ''}`;
    } catch (_) { return ''; }
  };
  const isVisible = (node) => {
    const rect = node?.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  };

  function extractMessageText(message) {
    if (!message) return "";
    let structured = "";
    const blockTags = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "PRE"]);
    const walk = (node, isRoot = false) => {
      if (!node) return;
      if (node.nodeType === 3) {
        structured += node.nodeValue || "";
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.getAttribute?.("aria-hidden") === "true") return;
      if (node.tagName === "BR") {
        structured += "\n";
        return;
      }
      const before = structured.length;
      for (const child of Array.from(node.childNodes || [])) walk(child, false);
      if (!isRoot && blockTags.has(node.tagName)) {
        const ownText = structured.slice(before).replace(/\n/g, "").trim();
        if (!ownText && structured.endsWith("\n")) structured += "\n";
        else if (!structured.endsWith("\n")) structured += "\n";
      }
    };
    walk(message, true);
    structured = structured
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const visual = String(message.innerText || message.textContent || "")
      .replace(/\u00a0/g, " ")
      .trim();
    const comparable = (value) => value.replace(/\s+/g, "");
    // DOM structure is used only when it contains exactly the same visible
    // characters. This restores paragraph breaks without rewriting wording.
    if (structured && comparable(structured) === comparable(visual)) {
      const structuredBreaks = (structured.match(/\n/g) || []).length;
      const visualBreaks = (visual.match(/\n/g) || []).length;
      return structuredBreaks > visualBreaks ? structured : visual;
    }
    return visual || structured;
  }

  const isCommentNode = (node) => Boolean(node?.closest?.('[data-commentid], [aria-label*="留言"], [aria-label*="回覆"], [aria-label*="comment"], [aria-label*="reply"]'));

  function genericTextRoot(textNode) {
    let root = textNode;
    for (let i = 0; i < 12 && root.parentElement; i += 1) {
      const parent = root.parentElement;
      if (isCommentNode(parent)) break;
      const controls = parent.querySelectorAll('[aria-label="讚"], [aria-label="留言"], [aria-label*="傳送給"], [aria-label*="這則貼文"]');
      if (controls.length >= 2) return parent;
      root = parent;
    }
    return root;
  }

  function ancestors(node, limit = 32) {
    const result = [];
    for (let current = node, depth = 0; current && depth < limit; current = current.parentElement, depth += 1) {
      result.push({ node: current, depth });
    }
    return result;
  }

  function postVisualRoot(node) {
    if (!node) return null;
    let root = node;
    for (let i = 0; i < 8 && root.parentElement; i += 1) {
      const parent = root.parentElement;
      if (parent.querySelectorAll(messageSelector).length !== 1 || parent.querySelector('[data-commentid]')) break;
      root = parent;
    }
    return root;
  }

  function isAfter(a, b) {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function isNestedPrimaryLink(link) {
    for (const { node } of ancestors(link, 10)) {
      const earlier = Array.from(node.querySelectorAll(permalinkSelector))
        .filter((candidate) => candidate !== link && !isCommentUrl(candidate.href) && isAfter(link, candidate));
      if (earlier.length) return true;
    }
    return false;
  }

  function choosePostLink(candidates) {
    const valid = candidates.filter((candidate) => isUsablePostUrl(candidate.href));
    const visible = valid.filter(isVisible);
    const usable = visible.length ? visible : valid;
    if (!usable.length) return null;
    // A story can contain many photo links (one for every album item). Use a
    // post/permalink link when Facebook exposes one; otherwise the first
    // photo link is the representative source URL for the whole story.
    return usable.find((candidate) => /\/posts\/|\/permalink|story_fbid/i.test(candidate.href)) || usable[0];
  }

  function mediaForLink(link, nextLink) {
    const inRange = Array.from(document.querySelectorAll('img, video')).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return isVisible(candidate) && rect.width >= 120 && rect.height >= 120 && isAfter(link, candidate) && (!nextLink || isAfter(candidate, nextLink));
    });
    if (inRange) return inRange;
    for (const { node } of ancestors(link, 18)) {
      const media = Array.from(node.querySelectorAll('img, video')).filter((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return isVisible(candidate) && rect.width >= 120 && rect.height >= 120;
      });
      if (media.length === 1) return media[0];
    }
    return null;
  }

  function buildPostRecords() {
    const links = Array.from(document.querySelectorAll(permalinkSelector))
      .filter((link) => isVisible(link) && isUsablePostUrl(link.href));
    const messages = Array.from(document.querySelectorAll(messageSelector)).filter(isVisible);
    const textPosts = Array.from(document.querySelectorAll(textSelector)).filter((node) => {
      const text = (node.innerText || node.textContent || "").trim();
      return isVisible(node) && !isCommentNode(node) && text.length >= 4 && !/^Facebook$/.test(text) && !/^查看洞察報告$/.test(text) && !/^\d+$/.test(text);
    });
    const records = [];
    const usedMessages = new Set();
    links.forEach((link, index) => {
      const nextLink = links[index + 1];
      const message = messages.find((candidate) => isAfter(link, candidate) && (!nextLink || isAfter(candidate, nextLink))) ||
        textPosts.find((candidate) => isAfter(link, candidate) && (!nextLink || isAfter(candidate, nextLink)));
      const media = mediaForLink(link, nextLink);
      if (message) {
        usedMessages.add(message);
        const isGenericText = !message.matches?.(messageSelector);
        // A text post and a nearby image are not necessarily the same post
        // in Facebook's DOM. Only use media inside this post's own root.
        const node = isGenericText ? genericTextRoot(message) : postVisualRoot(message);
        const localMedia = Array.from(node.querySelectorAll('img, video')).find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return isVisible(candidate) && rect.width >= 120 && rect.height >= 120;
        }) || null;
        records.push({ link, message, node, media: localMedia });
        return;
      }
      if (media) records.push({ link, message: null, node: postVisualRoot(media), media });
    });

    // Some Facebook post variants expose the message before their permalink
    // is rendered (or do not render a permalink at all). They are still real
    // posts, not comments: data-ad-preview="message" is the post marker.
    // Keep them selectable instead of silently dropping them.
    messages.forEach((message) => {
      if (usedMessages.has(message)) return;
      const node = postVisualRoot(message);
      if (!node || records.some((record) => record.node === node)) return;
      const nearbyLink = Array.from(node.querySelectorAll(permalinkSelector))
        .find((link) => isUsablePostUrl(link.href));
      records.push({ link: nearbyLink || null, message, node, media: null });
    });
    // Do not create a post from a free-floating dir="auto" node. On a
    // comment-only view those nodes are comment/UI text and guessing here
    // causes the picker to select an unrelated latest post.
    return records;
  }

  function recoverPostFromComment(target) {
    const clickedLink = target.closest?.(permalinkSelector);
    if (!clickedLink || !isCommentUrl(clickedLink.href)) return null;
    const commentNode = target.closest?.('[data-commentid], [role="article"], [aria-label*="留言"], [aria-label*="回覆"]');
    if (!commentNode) return null;
    for (const { node } of ancestors(commentNode.parentElement, 14)) {
      if (!node || node === document.body || node === document.documentElement) continue;
      const content = Array.from(node.querySelectorAll(textSelector)).find((candidate) => {
        const text = (candidate.innerText || candidate.textContent || '').trim();
        return !commentNode.contains(candidate) && isVisible(candidate) && text.length >= 4 &&
          !/^Facebook$/.test(text) && !/^查看洞察報告$/.test(text) && !/^\d+$/.test(text);
      });
      const controls = node.querySelectorAll('[aria-label="讚"], [aria-label="留言"], [aria-label*="傳送給"], [aria-label*="這則貼文"]').length;
      if (content && controls >= 2) {
        const root = genericTextRoot(content);
        return { link: { href: baseUrl(clickedLink.href) }, message: content, node: root, media: null };
      }
    }
    return null;
  }

  function extractPublishedAt(root) {
    const scope = [root, ...ancestors(root, 6).map(({ node }) => node.parentElement).filter(Boolean)];
    const candidates = scope.flatMap((node) => Array.from(node.querySelectorAll('[data-utime], time[datetime], abbr[title], a[title]')));
    for (const node of candidates) {
      const raw = node.getAttribute('data-utime') || node.getAttribute('datetime') || node.getAttribute('title') || '';
      if (/^\d{10,13}$/.test(raw)) return Math.floor(Number(raw) / (raw.length === 13 ? 1000 : 1));
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
    }
    const labels = scope.flatMap((node) => Array.from(node.querySelectorAll('[aria-label]')))
      .map((node) => node.getAttribute('aria-label') || '');
    for (const label of labels) {
      const match = label.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^\d]*(上午|下午)?\s*(\d{1,2}):(\d{2})/);
      if (!match) continue;
      let hour = Number(match[5]);
      if (match[4] === '下午' && hour < 12) hour += 12;
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, Number(match[6]));
      if (!Number.isNaN(date.getTime())) return Math.floor(date.getTime() / 1000);
    }
    return null;
  }

  function moreButtonInScope(scope) {
    return Array.from(scope?.querySelectorAll?.('[role="button"], button, a, span, div') || []).find((node) => {
      const text = (node.innerText || node.textContent || '').trim();
      if (!/^(查看更多|顯示更多|查看全部|See more|More)$/i.test(text) || !isVisible(node) || isCommentNode(node)) return false;
      return !Array.from(node.children || []).some((child) => (child.innerText || child.textContent || '').trim() === text);
    }) || null;
  }

  function hasCollapsedText(message, scope) {
    if (moreButtonInScope(scope)) return true;
    const text = (message?.innerText || message?.textContent || '').trim();
    return /(?:……|\.\.\.|…)?\s*(?:查看更多|顯示更多|See more)\s*$/i.test(text);
  }

  function recoverLiveStory(storyRoot, sourceUrl, beforeText) {
    if (storyRoot?.isConnected) return storyRoot;
    const wanted = postUrlIdentity(sourceUrl);
    const prefix = String(beforeText || '').replace(/(?:……|\.\.\.|…)?\s*(?:查看更多|顯示更多|See more)\s*$/i, '').trim().slice(0, 48);
    for (const candidateMessage of Array.from(document.querySelectorAll(messageSelector))) {
      const candidate = storyContainerFor(candidateMessage);
      if (!candidate) continue;
      if (wanted) {
        const links = Array.from(candidate.querySelectorAll(permalinkSelector));
        if (links.some((link) => postUrlIdentity(link.href) === wanted)) return candidate;
      }
      const text = (candidateMessage.innerText || candidateMessage.textContent || '').trim();
      if (prefix.length >= 12 && text.startsWith(prefix)) return candidate;
    }
    return null;
  }

  async function expandMore(message, storyRoot, sourceUrl = '') {
    // Image/video-only posts have no message node and therefore have nothing
    // to expand. They are valid posts as long as media is present.
    if (!message) return { complete: true, story: storyRoot, message: null };
    const scope = storyRoot || message.parentElement || message;
    const before = (message.innerText || message.textContent || '').trim();
    const more = moreButtonInScope(scope);
    if (!more) return { complete: !hasCollapsedText(message, scope), story: scope, message };
    more.click?.();
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const liveStory = recoverLiveStory(scope, sourceUrl, before);
      if (!liveStory) continue;
      const currentMessage = liveStory.querySelector?.(messageSelector) || message;
      const current = (currentMessage.innerText || currentMessage.textContent || '').trim();
      if (current.length > before.length && !hasCollapsedText(currentMessage, liveStory)) {
        return { complete: true, story: liveStory, message: currentMessage };
      }
    }
    const liveStory = recoverLiveStory(scope, sourceUrl, before) || scope;
    const currentMessage = liveStory.querySelector?.(messageSelector) || message;
    return { complete: !hasCollapsedText(currentMessage, liveStory) && (currentMessage.innerText || currentMessage.textContent || '').trim().length > before.length, story: liveStory, message: currentMessage };
  }

  function localMedia(root) {
    return Array.from(root?.querySelectorAll?.('img, video') || []).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return isVisible(candidate) && rect.width >= 120 && rect.height >= 120;
    }) || null;
  }

  function visibleMedia(root) {
    const seen = new Set();
    return Array.from(root?.querySelectorAll?.('img, video') || []).filter((candidate) => {
      if (isCommentNode(candidate)) return false;
      const rect = candidate.getBoundingClientRect();
      if (!isVisible(candidate) || rect.width < 120 || rect.height < 120) return false;
      const url = candidate.currentSrc || candidate.src || '';
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  function albumTriggerInScope(scope) {
    return Array.from(scope?.querySelectorAll?.('[role="button"], a, span, div') || []).find((node) => {
      if (isCommentNode(node) || !isVisible(node)) return false;
      const text = (node.innerText || node.textContent || '').trim();
      return /^\+\d+$/.test(text) && !Array.from(node.children || []).some((child) => (child.innerText || child.textContent || '').trim() === text);
    }) || null;
  }

  async function collectAlbumMedia(story, initialUrls, sourceUrl, onProgress = () => {}) {
    const albumLink = Array.from(story?.querySelectorAll?.(permalinkSelector) || [])
      .find((link) => /\/media\/set\//i.test(link.href || ''));
    const trigger = albumTriggerInScope(story);
    const looksLikeAlbum = Boolean(albumLink || trigger || (sourceUrl || '').includes('/media/set/'));
    const collected = new Set(initialUrls || []);
    const storyText = (story?.innerText || story?.textContent || '').replace(/,/g, '');
    const declaredCountMatch = storyText.match(/(?:新增了|加入了|added)?\s*(\d+)\s*(?:張相片|張照片|photos?)/i);
    const triggerAdditional = trigger ? Number((trigger.innerText || trigger.textContent || '').trim().replace('+', '')) : 0;
    // Facebook's +N tile itself occupies one of the visible media slots, so
    // the best fallback total is visible_count - 1 + N. Prefer an explicit
    // "新增了 N 張相片" label whenever Facebook provides one.
    const expectedCount = declaredCountMatch
      ? Number(declaredCountMatch[1])
      : triggerAdditional > 0
        ? Math.max(collected.size, collected.size - 1 + triggerAdditional)
        : null;
    if (!looksLikeAlbum || !trigger) {
      const complete = !looksLikeAlbum || Boolean(expectedCount && collected.size >= expectedCount);
      return { urls: Array.from(collected), complete, loadedCount: collected.size, expectedCount };
    }

    const approved = window.confirm(t("facebook.albumConfirm", {
      approx: expectedCount ? t("facebook.albumApprox", { count: expectedCount }) : ""
    }));
    if (!approved) {
      return { urls: Array.from(collected), complete: false, loadedCount: collected.size, expectedCount, cancelled: true };
    }

    try {
      globalThis.__chamberAlbumAutomation = true;
      onProgress(t("facebook.albumOpening", { progress: expectedCount ? ` (0 / ${expectedCount})` : "" }));
      trigger.click();
      const findDialog = () => Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
        .filter(isVisible)
        .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || null;
      let dialog = null;
      const dialogDeadline = Date.now() + 5000;
      while (!dialog && Date.now() < dialogDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        dialog = findDialog();
      }
      if (!dialog) {
        globalThis.__chamberAlbumAutomation = false;
        return { urls: Array.from(collected), complete: false, loadedCount: collected.size, expectedCount };
      }

      const collectVisible = (scope) => {
        for (const element of Array.from(scope?.querySelectorAll?.('img, video') || [])) {
          const rect = element.getBoundingClientRect();
          if (!isVisible(element) || rect.width < 120 || rect.height < 120) continue;
          const url = element.currentSrc || element.src || '';
          if (url && !url.startsWith('blob:') && !url.startsWith('data:')) collected.add(url);
        }
        onProgress(t("facebook.albumLoading", { loaded: collected.size, expected: expectedCount ? ` / ${expectedCount}` : "" }));
      };
      const closeDialog = async () => {
        const currentDialog = findDialog() || dialog;
        const close = Array.from(currentDialog?.querySelectorAll?.('[role="button"], button, [aria-label]') || []).find((node) => {
          if (!isVisible(node)) return false;
          const label = `${node.getAttribute('aria-label') || ''} ${(node.innerText || node.textContent || '').trim()}`;
          return /關閉|close/i.test(label);
        });
        if (close) close.click();
        else {
          globalThis.__chamberClosingAlbum = true;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 50));
          globalThis.__chamberClosingAlbum = false;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      };

      let stableRounds = 0;
      let reachedEnd = false;
      const maxRounds = Math.min(Math.max((expectedCount || 100) + 30, 140), 400);
      for (let round = 0; round < maxRounds; round += 1) {
        dialog = findDialog() || dialog;
        collectVisible(dialog);

        if (expectedCount && collected.size >= expectedCount) {
          reachedEnd = true;
          break;
        }

        const next = Array.from(dialog.querySelectorAll('[role="button"], button, [aria-label]')).find((node) => {
          if (!isVisible(node)) return false;
          if (node.getAttribute('aria-disabled') === 'true' || node.disabled) return false;
          const label = `${node.getAttribute('aria-label') || ''} ${(node.innerText || node.textContent || '').trim()}`;
          return /下一張|下一個|next photo|next item|^next$/i.test(label.trim());
        });
        if (next) {
          const beforeCount = collected.size;
          next.click();
          const loadDeadline = Date.now() + 1800;
          while (Date.now() < loadDeadline) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            dialog = findDialog() || dialog;
            collectVisible(dialog);
            if (collected.size > beforeCount) break;
          }
          stableRounds = collected.size > beforeCount ? 0 : stableRounds + 1;
        } else if (dialog.scrollHeight > dialog.clientHeight) {
          dialog.scrollTop = Math.min(dialog.scrollTop + Math.max(dialog.clientHeight * 0.8, 300), dialog.scrollHeight);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const beforeCount = collected.size;
          collectVisible(dialog);
          stableRounds = collected.size > beforeCount ? 0 : stableRounds + 1;
        } else {
          stableRounds += 1;
          if (stableRounds >= 12) {
            reachedEnd = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
      await closeDialog();
      globalThis.__chamberAlbumAutomation = false;
      const complete = expectedCount ? collected.size >= expectedCount : reachedEnd;
      return { urls: Array.from(collected), complete, loadedCount: collected.size, expectedCount };
    } catch (error) {
      console.warn('[Chamber] Album collection stopped:', error);
      globalThis.__chamberClosingAlbum = true;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      globalThis.__chamberClosingAlbum = false;
      globalThis.__chamberAlbumAutomation = false;
      return { urls: Array.from(collected), complete: false, loadedCount: collected.size, expectedCount };
    }
  }

  function storyContainerFor(seed) {
    if (!seed) return null;
    for (const { node } of ancestors(seed, 28)) {
      if (!node || node === document.body || node === document.documentElement || isCommentNode(node)) continue;
      const hasStoryMessage = node.querySelector?.(messageSelector);
      const hasPostAction = node.querySelector?.('[aria-label*="這則貼文採取的動作"], [aria-label*="post actions"], [data-ad-rendering-role="story_message"]');
      const hasPostControl = node.querySelector?.('[aria-label="讚"], [aria-label="留言"], [data-ad-rendering-role="comment_button"]');
      if ((hasStoryMessage || hasPostAction) && hasPostControl) return node;
    }
    return null;
  }

  function extractAuthor(root, pageUrl) {
    const scope = [root, ...ancestors(root, 6).map(({ node }) => node.parentElement).filter(Boolean)];
    const authorLinks = scope.flatMap((node) => Array.from(node.querySelectorAll('a[data-ad-rendering-role="profile_name"][href], a[href]'))).filter((link) => {
      const label = link.getAttribute('aria-label') || '';
      return label && !/讚|留言|分享|回覆|action|comment|reply/i.test(label);
    });
    const author = authorLinks.find((link) => link.matches?.('[data-ad-rendering-role="profile_name"]') && !isCommentNode(link)) ||
      authorLinks.find((link) => !isCommentNode(link) && !/^\d{4}年/.test(link.getAttribute('aria-label') || '')) || null;
    let expectedPath = '';
    try { expectedPath = new URL(pageUrl || location.href).pathname.replace(/\/$/, '').toLowerCase(); } catch (_) {}
    let isOwnAuthor = null;
    const normalizePath = (url) => {
      try {
        const path = new URL(url, location.href).pathname.replace(/\/+$/, '').toLowerCase();
        return path || '/';
      } catch (_) { return ''; }
    };
    const pagePath = (() => {
      try {
        const rawPath = new URL(pageUrl || location.href).pathname.toLowerCase();
        return rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '');
      } catch (_) { return ''; }
    })();
    const isProfileContext = Boolean(pagePath && pagePath !== '/' &&
      !/^\/(home|watch|groups|marketplace|notifications|messages|reels|search|gaming|events|friends)(\/|$)/i.test(pagePath) &&
      !pagePath.startsWith('/profile.php'));
    if (isProfileContext && expectedPath && author) {
      isOwnAuthor = normalizePath(author.href) === expectedPath;
    }
    // Feed pages usually hide the numeric author ID. Compare the selected
    // author's path with the logged-in user's profile link in the sticky
    // header. This is a positive signal; absence remains unknown and must be
    // blocked by the side panel rather than guessed as "own".
    if (author && isOwnAuthor === null) {
      const authorPath = normalizePath(author.href);
      if (authorPath && authorPath !== '/') {
        const headerOwnLink = Array.from(document.querySelectorAll('a[href]')).some((link) => {
          if (root.contains(link)) return false;
          const rect = link.getBoundingClientRect?.();
          if (!rect || rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > 260) return false;
          return normalizePath(link.href) === authorPath;
        });
        if (headerOwnLink) isOwnAuthor = true;
      }
    }
    return { authorName: author?.getAttribute('aria-label') || '', authorUrl: author?.href || '', isOwnAuthor };
  }

  function findPostRoot(target, point = { x: 0, y: 0 }) {
    if (!target || target === document.documentElement || target === document.body) return null;
    if (isCommentNode(target)) return null;

    const directMessage = target.closest?.(messageSelector);
    const media = !directMessage && target.closest?.('img, video');
    const genericText = !directMessage && !media && target.closest?.(textSelector);
    const linkCard = target.closest?.('a[target="_blank"], a[href*="http"], div[role="article"] a');
    const articleContainer = target.closest?.('div[role="article"], div[data-pagelet*="FeedUnit"]');

    const seed = directMessage
      || (media && (() => {
        const rect = media.getBoundingClientRect();
        return rect.width >= 80 && rect.height >= 80 ? media : null;
      })())
      || (genericText && !isCommentNode(genericText) ? genericText : null)
      || linkCard
      || articleContainer;

    if (!seed) return null;

    const story = articleContainer || storyContainerFor(seed);
    if (!story) return null;
    const message = directMessage || (genericText && !isCommentNode(genericText) ? genericText : null) || story.querySelector(messageSelector) || linkCard;

    let link = null;
    link = choosePostLink(Array.from(story.querySelectorAll(permalinkSelector)));
    return {
      link,
      message: message || null,
      node: story,
      media: localMedia(story) || media
    };
  }

  function extract(record, pageUrl, extraMedia = null) {
    if (!record?.node) return null;
    const root = record.node;
    const message = record.message;
    const mediaElements = record.media ? [record.media, ...visibleMedia(root)] : visibleMedia(root);
    const videoElement = mediaElements.find((element) => element?.tagName === 'VIDEO') || null;
    const mediaCandidates = videoElement ? [videoElement] : mediaElements;
    const mediaUrls = [];
    const seenMedia = new Set();
    for (const element of mediaCandidates) {
      const rawUrl = element?.currentSrc || element?.src || '';
      const url = element?.tagName === 'VIDEO' ? (element.poster || '') : rawUrl;
      if (url && !seenMedia.has(url)) { seenMedia.add(url); mediaUrls.push(url); }
    }
    for (const url of extraMedia?.urls || []) {
      if (url && !seenMedia.has(url)) { seenMedia.add(url); mediaUrls.push(url); }
    }
    const mediaUrl = mediaUrls[0] || '';
    const author = extractAuthor(root, pageUrl);
    const publishedAt = extractPublishedAt(root);
    let textContent = extractMessageText(message);
    if (!textContent) {
      const linkCard = root.querySelector('a[target="_blank"][href*="l.facebook.com"], a[target="_blank"][href*="http"], a[rel*="nofollow"][target="_blank"]');
      if (linkCard) {
        const cardTexts = Array.from(linkCard.querySelectorAll('span[dir="auto"], div[dir="auto"], span, div'))
          .map((el) => (el.innerText || el.textContent || "").trim())
          .filter((t) => t.length > 3 && !/^(facebook|讚|留言|分享|like|comment|share|查看洞察報告)$/i.test(t));
        const uniqueTexts = Array.from(new Set(cardTexts));
        if (uniqueTexts.length > 0) {
          textContent = uniqueTexts.join("\n");
        }
      }
    }

    // Detect if this post is a shared/reshared post containing another author's content
    const subStory = root.querySelector('div[role="article"] div[role="article"], div[data-ad-preview="message"], div[class*="x1yztbdb"]');
    const isSharedPost = Boolean(subStory && subStory !== root);
    let sharedAuthor = "";
    if (isSharedPost && subStory) {
      const subAuthorNode = subStory.querySelector('strong, h4 a, h3 a, a[role="link"] span, span[dir="auto"]');
      sharedAuthor = (subAuthorNode?.innerText || subAuthorNode?.textContent || "").trim();
      if (/^(讚|留言|分享|like|comment|share)$/i.test(sharedAuthor)) sharedAuthor = "";
    }

    return {
      textContent,
      isSharedPost,
      sharedAuthor,
      media: {
        primary_fb_cdn: mediaUrl,
        fallback_backup: "",
        album: Boolean(extraMedia?.album),
        albumComplete: extraMedia?.complete !== false,
        albumLoadedCount: extraMedia?.loadedCount || mediaUrls.length,
        albumExpectedCount: extraMedia?.expectedCount || null,
        albumSourceUrl: extraMedia?.sourceUrl || "",
        videoDetected: Boolean(videoElement),
        videoSourceType: videoElement ? "stream" : ""
      },
      mediaUrls,
      sourceUrl: cleanPostUrl(record.link?.href || ""),
      sourceCandidates: Array.from(root.querySelectorAll('a[href]'))
        .map((link) => cleanPostUrl(link.href || ''))
        .filter((url, index, all) => url && /(^|\.)facebook\.com\//i.test(new URL(url).hostname + '/') && all.indexOf(url) === index)
        .slice(0, 30),
      timestamp: publishedAt || Math.floor(Date.now() / 1000),
      publishedAt,
      ...author
    };
  }

  function bestMessageInStory(story, selectedText = '') {
    if (!story) return null;
    const prefix = String(selectedText || '')
      .replace(/(?:……|\.\.\.|…)?\s*(?:查看更多|顯示更多|See more)\s*$/i, '')
      .trim()
      .slice(0, 48);
    const candidates = Array.from(story.querySelectorAll(`${messageSelector}, ${textSelector}`))
      .filter((node) => !isCommentNode(node) && isVisible(node))
      .filter((node) => {
        const text = (node.innerText || node.textContent || '').trim();
        if (!text) return false;
        if (node.matches?.(messageSelector)) return true;
        return prefix.length >= 8 && text.startsWith(prefix);
      });
    return candidates.sort((a, b) => {
      const aCollapsed = hasCollapsedText(a, story) ? 1 : 0;
      const bCollapsed = hasCollapsedText(b, story) ? 1 : 0;
      if (aCollapsed !== bCollapsed) return aCollapsed - bCollapsed;
      return (b.innerText || b.textContent || '').trim().length - (a.innerText || a.textContent || '').trim().length;
    })[0] || null;
  }

  function refreshSelected(pageUrl, sourceUrl, selectedText = '') {
    const wanted = postUrlIdentity(sourceUrl);
    const stories = [];
    const remembered = globalThis.__chamberSelectedStory?.story || null;
    if (remembered?.isConnected) stories.push(remembered);
    const possibleMessages = Array.from(document.querySelectorAll(`${messageSelector}, ${textSelector}`));
    for (const message of possibleMessages) {
      const text = (message.innerText || message.textContent || '').trim();
      const selectedPrefix = String(selectedText || '').replace(/(?:……|\.\.\.|…)?\s*(?:查看更多|顯示更多|See more)\s*$/i, '').trim().slice(0, 48);
      if (!message.matches?.(messageSelector) && (!selectedPrefix || !text.startsWith(selectedPrefix))) continue;
      const candidate = storyContainerFor(message);
      if (!candidate || stories.includes(candidate)) continue;
      const links = Array.from(candidate.querySelectorAll(permalinkSelector)).filter((link) => isUsablePostUrl(link.href));
      const sourceMatches = wanted && links.some((link) => postUrlIdentity(link.href) === wanted);
      const textMatches = selectedPrefix.length >= 12 && text.startsWith(selectedPrefix);
      if (!wanted || sourceMatches || textMatches) stories.push(candidate);
    }
    const story = stories.sort((a, b) => {
      const aMessage = bestMessageInStory(a, selectedText);
      const bMessage = bestMessageInStory(b, selectedText);
      const aCollapsed = aMessage && hasCollapsedText(aMessage, a) ? 1 : 0;
      const bCollapsed = bMessage && hasCollapsedText(bMessage, b) ? 1 : 0;
      if (aCollapsed !== bCollapsed) return aCollapsed - bCollapsed;
      return (bMessage?.innerText || bMessage?.textContent || '').trim().length - (aMessage?.innerText || aMessage?.textContent || '').trim().length;
    })[0] || null;
    if (!story) return null;
    const message = bestMessageInStory(story, selectedText) || story.querySelector(messageSelector);
    const link = choosePostLink(Array.from(story.querySelectorAll(permalinkSelector)));
    const selectedAlbum = globalThis.__chamberSelectedStory?.album || null;
    const payload = extract({ node: story, message, link, media: localMedia(story) }, pageUrl, selectedAlbum ? {
      ...selectedAlbum,
      album: true,
      sourceUrl: sourceUrl || selectedAlbum.sourceUrl || ''
    } : null);
    if (!payload) return null;
    payload.contentExpanded = !message || !hasCollapsedText(message, story);
    return payload;
  }

  globalThis.ChamberFacebookPlatform = {
    startPicker(pageUrl) {
      // A previous Side Panel or injected-script context may have disappeared
      // without running its closure cleanup. DOM events cross extension JS
      // contexts, so this cancels every surviving picker before starting one.
      document.dispatchEvent(new CustomEvent("chamber:cancel-picker"));
      globalThis.__chamberPickerCancel?.();
      return new Promise((resolve) => {
        const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        document.documentElement.setAttribute("data-chamber-picker-session", sessionToken);
        const isCurrentSession = () => document.documentElement.getAttribute("data-chamber-picker-session") === sessionToken;
        const style = document.createElement("style");
        style.id = "chamber-picker-style";
        style.textContent = ".chamber-picker-target{outline:3px solid #6366f1!important;outline-offset:3px!important;background:rgba(99,102,241,.08)!important}.chamber-picker-banner{position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);padding:10px 16px;border-radius:10px;background:#312e81;color:#fff;font:600 14px system-ui;box-shadow:0 4px 20px #0008;pointer-events:none}";
        document.documentElement.appendChild(style);
        const banner = document.createElement("div");
        banner.className = "chamber-picker-banner";
        banner.textContent = t("facebook.pickerHover");
        banner.style.pointerEvents = "auto";
        banner.style.cursor = "pointer";
        banner.title = t("facebook.pickerCancel");
        banner.addEventListener("click", () => cancel(), true);
        document.documentElement.appendChild(banner);
        let highlighted = null;
        let finished = false;
        let selecting = false;
        const cleanup = () => {
          if (finished) return;
          finished = true;
          highlighted?.classList.remove("chamber-picker-target");
          style.remove(); banner.remove();
          document.removeEventListener("mousemove", onMove, true);
          document.removeEventListener("click", onClick, true);
          document.removeEventListener("keydown", onKey, true);
          document.removeEventListener("keyup", onKey, true);
          document.removeEventListener("chamber:cancel-picker", onExternalCancel, true);
          window.removeEventListener("keydown", onKey, true);
          window.removeEventListener("keyup", onKey, true);
          if (globalThis.__chamberPickerCancel === cancel) globalThis.__chamberPickerCancel = null;
          if (isCurrentSession()) document.documentElement.removeAttribute("data-chamber-picker-session");
        };
        const cancel = () => { cleanup(); resolve(null); };
        const onExternalCancel = () => cancel();
        globalThis.__chamberPickerCancel = cancel;
        const onMove = (event) => {
          if (!isCurrentSession()) { cancel(); return; }
          const info = findPostRoot(event.target, { x: event.clientX, y: event.clientY });
          const next = info?.node || null;
          if (next === highlighted) return;
          highlighted?.classList.remove("chamber-picker-target");
          highlighted = next;
          banner.textContent = highlighted
            ? t("facebook.pickerLocked")
            : t("facebook.pickerHover");
          highlighted?.classList.add("chamber-picker-target");
        };
        const onKey = (event) => {
          if (!isCurrentSession()) { cancel(); return; }
          if (globalThis.__chamberClosingAlbum) return;
          if (event.key === "Escape" || event.key === "Esc" || event.code === "Escape" || event.keyCode === 27 || event.which === 27) {
            event.preventDefault(); event.stopImmediatePropagation(); cancel();
          }
        };
        const onClick = async (event) => {
          if (!isCurrentSession()) { cancel(); return; }
          if (selecting) {
            event.preventDefault(); event.stopPropagation();
            return;
          }
          if (globalThis.__chamberAlbumAutomation && !event.isTrusted) return;
          const info = findPostRoot(event.target, { x: event.clientX, y: event.clientY });
          if (!info?.node) return;
          selecting = true;
          event.preventDefault(); event.stopPropagation();
          document.removeEventListener("click", onClick, true);
          const initialSourceUrl = cleanPostUrl(info.link?.href || '');
          const expansion = await expandMore(info.message, info.node, initialSourceUrl);
          const liveStory = expansion.story || info.node;
          const refreshedMessage = expansion.message || liveStory.querySelector?.(messageSelector) || info.message;
          const liveInfo = {
            ...info,
            node: liveStory,
            message: refreshedMessage,
            link: choosePostLink(Array.from(liveStory.querySelectorAll(permalinkSelector))) || info.link,
            media: localMedia(liveStory) || info.media
          };
          const firstPayload = extract(liveInfo, pageUrl);
          banner.textContent = t("facebook.albumPleaseWait");
          const album = await collectAlbumMedia(
            liveStory,
            firstPayload?.mediaUrls || [],
            firstPayload?.sourceUrl || '',
            (message) => { banner.textContent = message; }
          );
          if (album.cancelled) {
            cancel();
            return;
          }
          const payload = extract(liveInfo, pageUrl, {
            ...album,
            album: album.urls.length > 1 || Boolean(liveStory.querySelector?.('[href*="/media/set/"]')),
            sourceUrl: firstPayload?.sourceUrl || ''
          });
          payload.contentExpanded = expansion.complete;
          globalThis.__chamberSelectedStory = {
            story: liveStory,
            sourceUrl: payload.sourceUrl || "",
            album: payload.media?.album ? album : null
          };
          cleanup(); resolve(payload);
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("click", onClick, true);
        document.addEventListener("keydown", onKey, true);
        document.addEventListener("keyup", onKey, true);
        document.addEventListener("chamber:cancel-picker", onExternalCancel, true);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKey, true);
      });
    },
    refreshSelected,
    _testExtractMessageText: extractMessageText
  };
})();
