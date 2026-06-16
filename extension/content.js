/**
 * content.js - Chamber Protocol Content Script
 * 
 * Injected into Facebook pages. Performs DOM monitoring, appends the backup buttons,
 * scrapes historical post data, and relays intercepted GraphQL events to background.js.
 */

// 1. Inject inject.js into the page's main context
function injectNetworkHook() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject.js");
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.error("[Chamber] Injection of GraphQL hook failed:", err);
  }
}
injectNetworkHook();
// Global variables for active user context from inject.js
let currentFbUserId = null;
let currentFbAccountId = null;

// Helper to extract currently logged-in Facebook User ID
function getFacebookUserId() {
  try {
    const match = document.cookie.match(/c_user=(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {
    console.debug("[Chamber] Failed to read c_user cookie:", e);
  }
  return null;
}

// Track and isolate active Facebook User ID in storage for wallet mapping
const initialFbUserId = getFacebookUserId();
if (initialFbUserId) {
  chrome.storage.local.set({ lastFbUserId: initialFbUserId });
}

// Check if the post belongs to the current user/page to prevent stealing
function isOwnPost(article) {
  try {
    const authorLinkEl = article.querySelector('h2 a[role="link"]') || 
                         article.querySelector('h2 a') || 
                         article.querySelector('a[role="link"]');
    if (!authorLinkEl) return false;

    const authorHref = authorLinkEl.href || "";
    
    // Resolve active user/page ID
    const cUser = getFacebookUserId();
    const activeId = currentFbAccountId || currentFbUserId || cUser;

    if (!activeId) {
      // If we cannot resolve identity, fallback to true to avoid blocking backups
      return true; 
    }

    // 1. Direct ID match in URL
    if (authorHref.includes(activeId)) {
      return true;
    }

    // 2. Data hovercard ID match
    const hovercard = authorLinkEl.getAttribute('data-hovercard') || "";
    if (hovercard.includes(activeId)) {
      return true;
    }

    // 3. Current URL matching (timeline owner check)
    const currentUrl = window.location.href;
    if (currentUrl.includes("/profile.php?id=" + activeId) || currentUrl.includes("/" + activeId)) {
      return true;
    }

    return false;
  } catch (err) {
    console.debug("[Chamber] isOwnPost validation failed:", err);
    return true; // Fallback to avoid breaking
  }
}

// 2. Listen to postMessages from inject.js
window.addEventListener("message", (event) => {
  // Guard clause for safety and origin validation
  if (event.source !== window) return;
  if (event.data && event.data.source === "chamber-graphql-interceptor") {
    // Check message type for user context
    if (event.data.type === "FB_USER_CONTEXT") {
      currentFbUserId = event.data.data.userId;
      currentFbAccountId = event.data.data.accountId;
      console.log("[Chamber] Active FB user context loaded:", currentFbUserId, currentFbAccountId);
      return;
    }

    console.log("[Chamber] Content script received intercepted draft post:", event.data.data);
    const payload = event.data.data || {};
    payload.fbUserId = getFacebookUserId(); // Scrape and attach user ID
    
    // Forward directly to the background script
    chrome.runtime.sendMessage({
      action: "BACKUP_POST_DRAFT",
      payload: payload
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Chamber] Extension background script unreachable:", chrome.runtime.lastError.message);
      } else {
        console.log("[Chamber] Background script ACK auto-sync backup:", response);
      }
    });
  }
});

// 3. Inject CSS styles for the [🔒 備份至 Web3] Button
const styleTag = document.createElement("style");
styleTag.textContent = `
  .chamber-backup-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    margin-left: 10px;
    margin-top: 5px;
    margin-bottom: 5px;
    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2), 0 2px 4px -1px rgba(99, 102, 241, 0.1);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .chamber-backup-btn:hover {
    background: linear-gradient(135deg, #4f46e5, #4338ca);
    transform: translateY(-1px);
    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
  }
  .chamber-backup-btn:active {
    transform: translateY(0);
  }
  .chamber-btn-container {
    display: flex;
    align-items: center;
    margin: 5px 16px;
  }
`;
document.head.appendChild(styleTag);

// 4. Inject manual backup button on historic posts
function getFacebookPostData(postEl) {
  // Try to locate text content using common Facebook article structures
  // - Message block: div[data-ad-preview="message"], div[data-testid="post_message"]
  // - Fallbacks: div[dir="auto"] inside posts
  let textContent = "";
  const msgEl = postEl.querySelector('div[data-ad-preview="message"]') || 
                postEl.querySelector('div[data-testid="post_message"]') ||
                postEl.querySelector('div[dir="auto"]');
  if (msgEl) {
    textContent = msgEl.innerText || msgEl.textContent || "";
  }

  // Find images containing fbcdn urls or standard image blocks
  let primaryFbCdn = "";
  const imgEl = postEl.querySelector('img[src*="fbcdn.net"]');
  if (imgEl) {
    primaryFbCdn = imgEl.src;
  }

  // Find video elements if available
  let videoEl = postEl.querySelector('video');
  if (videoEl && videoEl.src) {
    primaryFbCdn = videoEl.src; // Using video source url
  }

  // Try to find the post permalink
  let postUrl = "";
  const linkEl = postEl.querySelector('a[href*="/posts/"]') || 
                 postEl.querySelector('a[href*="/permalink.php"]') || 
                 postEl.querySelector('a[href*="/permalink/"]') || 
                 postEl.querySelector('a[href*="story_fbid="]') ||
                 postEl.querySelector('a[href*="/photos/"]') ||
                 postEl.querySelector('a[href*="/videos/"]');
  if (linkEl && linkEl.href) {
    // Clean up query parameters if possible to keep it neat
    try {
      const parsedUrl = new URL(linkEl.href);
      // Keep only key post identificators if relevant
      postUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;
    } catch {
      postUrl = linkEl.href;
    }
  }

  // Generate metadata
  const timestamp = Math.floor(Date.now() / 1000); // Scraped timestamp

  return {
    textContent,
    media: {
      primary_fb_cdn: primaryFbCdn,
      fallback_backup: ""
    },
    timestamp,
    sourceUrl: postUrl || ""
  };
}

function handleBackupClick(btn, postEl) {
  const data = getFacebookPostData(postEl);
  if (!data.textContent && !data.media.primary_fb_cdn) {
    alert("無法偵測到貼文內容或媒體網址！");
    return;
  }

  data.fbUserId = getFacebookUserId(); // Scrape and attach user ID

  btn.innerText = "⏳ 備份中...";
  btn.disabled = true;
  btn.style.background = "#9ca3af";

  chrome.runtime.sendMessage({
    action: "BACKUP_HISTORIC_POST",
    payload: data
  }, (response) => {
    if (chrome.runtime.lastError) {
      alert("備份失敗：擴充功能背景服務不可用！");
      btn.innerText = "🔒 備份至 Web3";
      btn.disabled = false;
      btn.style.background = "linear-gradient(135deg, #6366f1, #4f46e5)";
    } else if (response && response.success) {
      btn.innerText = "✅ 已備份至 Arweave";
      btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
      console.log("[Chamber] Historic post successfully processed:", response.txId);
    } else {
      alert("備份失敗: " + (response ? response.error : "未知錯誤"));
      btn.innerText = "🔒 備份至 Web3";
      btn.disabled = false;
      btn.style.background = "linear-gradient(135deg, #6366f1, #4f46e5)";
    }
  });
}

function processDOM() {
  // Scan for typical Facebook timeline articles / posts containers
  const articles = document.querySelectorAll('div[role="article"]');
  articles.forEach((article) => {
    // Check if we already injected a button for this article to prevent duplication
    if (article.dataset.chamberInjected) return;

    // 1. Exclude comments: comments do NOT have h2 tags (which FB uses for post headers)
    const heading = article.querySelector('div[data-testid="UserContentHeader"]') || 
                    article.querySelector('h2');
    if (!heading) return;

    // 2. Exclude other users' posts to prevent abuse/stealing
    if (!isOwnPost(article)) return;

    article.dataset.chamberInjected = "true";

    const container = document.createElement("div");
    container.className = "chamber-btn-container";

    const btn = document.createElement("button");
    btn.className = "chamber-backup-btn";
    btn.innerHTML = `
      <svg style="margin-right: 4px;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      備份至 Web3
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleBackupClick(btn, article);
    });

    container.appendChild(btn);
    heading.parentNode.insertBefore(container, heading.nextSibling);
  });
}

// 5. Initialize MutationObserver to watch for dynamically loaded feed articles
const observer = new MutationObserver((mutations) => {
  processDOM();
});

// Start observing the page body
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Run initial DOM parse
setTimeout(processDOM, 3000);

// 6. Listen to messages from popup.js for composer auto-fill automation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_FB_COMPOSER_AND_FILL") {
    handleOpenComposerAndFill(request.payload.text, request.payload.imageUrl);
    sendResponse({ success: true });
    return true;
  }
});

function findComposerButton() {
  const divs = document.querySelectorAll('div[role="button"]');
  for (const div of divs) {
    const text = div.innerText || "";
    if (text.includes("在想些什麼") || text.includes("Create a post") || text.includes("想分享什麼") || text.includes("建立貼文") || text.includes("寫些什麼")) {
      return div;
    }
  }
  return document.querySelector('div[role="main"] div[role="button"]');
}

function findPhotoBtn() {
  const selectors = [
    'div[role="dialog"] div[role="button"]',
    'div[role="dialog"] i',
    'div[role="main"] div[role="button"]',
    'div[role="button"]',
    'i'
  ];
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const label = el.getAttribute('aria-label') || el.innerText || "";
      if (label.includes("相片") || label.includes("影片") || label.includes("Photo") || label.includes("Video")) {
        return el.closest('div[role="button"]') || el;
      }
    }
  }
  return null;
}

function triggerUpload(fileInput, imageUrl) {
  if (!imageUrl) return;
  fetch(imageUrl)
    .then(res => res.blob())
    .then(blob => {
      try {
        const file = new File([blob], "chamber-reborn-card.png", { type: "image/png" });
        const container = new DataTransfer();
        container.items.add(file);
        fileInput.files = container.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Chamber] Reborn card image auto-uploaded successfully.");
      } catch (err) {
        console.error("[Chamber] Auto-upload file trigger failed:", err);
      }
    })
    .catch(err => console.error("[Chamber] Failed to fetch image blob:", err));
}

function fillText(textbox, text) {
  textbox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);

  // Convert newlines to HTML blocks so Draft.js/React rich editor preserves layout
  const escapeHtml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const htmlText = text
    .split("\n")
    .map(line => line === "" ? "<br>" : `<div>${escapeHtml(line)}</div>`)
    .join("");

  document.execCommand('insertHTML', false, htmlText);
  console.log("[Chamber] Auto-filled composer textbox with layout preserved.");
}

function handleOpenComposerAndFill(text, imageUrl) {
  const textbox = document.querySelector('div[role="dialog"] div[role="textbox"]') || 
                  document.querySelector('div[role="textbox"]');

  if (textbox) {
    if (imageUrl) {
      const fileInput = document.querySelector('input[type="file"]');
      if (!fileInput) {
        const photoBtn = findPhotoBtn();
        if (photoBtn) {
          console.log("[Chamber] Photo mode not active, switching to photo mode...");
          photoBtn.click();
          
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            const activeFileInput = document.querySelector('input[type="file"]');
            if (activeFileInput) {
              clearInterval(interval);
              setTimeout(() => {
                const freshTextbox = document.querySelector('div[role="dialog"] div[role="textbox"]') || 
                                     document.querySelector('div[role="textbox"]');
                if (freshTextbox) {
                  fillText(freshTextbox, text);
                }
                triggerUpload(activeFileInput, imageUrl);
              }, 400); // Buffer for layout to stabilize
            } else if (attempts > 20) {
              clearInterval(interval);
              console.warn("[Chamber] Photo file input did not render, fallback...");
              fillText(textbox, text);
            }
          }, 100);
          return;
        }
      } else {
        // Photo mode is already active
        fillText(textbox, text);
        triggerUpload(fileInput, imageUrl);
        return;
      }
    } else {
      // No image, just write text
      fillText(textbox, text);
      return;
    }
  }

  // If textbox was not found, click the main composer button to open it
  const btn = findComposerButton();
  if (btn) {
    console.log("[Chamber] Found composer button, clicking it...");
    btn.click();
    
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const activeTextbox = document.querySelector('div[role="dialog"] div[role="textbox"]') || 
                            document.querySelector('div[role="textbox"]');
      if (activeTextbox) {
        clearInterval(interval);
        setTimeout(() => {
          handleOpenComposerAndFill(text, imageUrl);
        }, 400); // Buffer for composer dialog to render
      } else if (attempts > 30) {
        clearInterval(interval);
        console.warn("[Chamber] Failed to find composer textbox after clicking.");
      }
    }, 100);
  } else {
    console.warn("[Chamber] Could not locate any Facebook post composer button.");
    alert("請先點擊臉書的『建立貼文』，我們將為您自動帶入圖文！");
  }
}
