# 🤝 Chamber Protocol - 專案交接與部署說明書 (Handoff)

本文件整理了 **Chamber Protocol（去中心化社交迴響室 - 原名 Anti-Zu 轉世系統）** 第一階段 MVP 的開發進度、伺服器部署狀態及後續開發指南，供您隨時查閱。

---

## 🧭 1. 專案基本資訊與目錄結構

*   **專案名稱**：Chamber Protocol (Chamber + Echo)
*   **本機工作目錄 (Logic Layer)**：`/home/ubuntu/agentmanager/workspace/metashield-protocol/`
*   **資料儲存目錄 (Data Layer)**：`/home/ubuntu/agent-data/projects/metashield-protocol/`
*   **官網主路徑**：`https://studio.milkcat.org/echo`

### 📁 目錄樹結構
```text
metashield-protocol/
├── STATUS.md (軟連結至資料層，記錄進度日誌)
├── memory/ (軟連結至資料層，記憶快照)
├── handoff.md (本交接說明書)
├── extension/                       # 瀏覽器外掛 (Chamber)
│   ├── manifest.json                # V3 配置，權限限制在 facebook.com
│   ├── inject.js                    # FB 網頁 GraphQL 監聽攔截器
│   ├── content.js                   # DOM 按鈕注入與貼文內容爬蟲
│   ├── background.js                # AES 本地加密、媒體快取轉存、Irys 上鏈 Rest API
│   ├── popup.html                   # 設定面板與「轉世宣告」編輯框
│   └── popup.js                     # 錢包設定與 HTML5 Canvas 轉世卡產生器
└── web-feed/                        # Next.js 去中心化時光軸 (Echo Portal)
    ├── app/
    │   ├── layout.tsx               # 全域 Layout 與 SEO 設定
    │   ├── globals.css              # Tailwind CSS
    │   ├── [wallet_address]/
    │   │   ├── page.tsx             # 伺服器端 Redirect (指向 /all)
    │   │   └── [platform]/
    │   │       └── page.tsx         # 時光軸主頁面（含平台分流、標籤過濾與簽署解密）
    ├── next.config.ts           # 配置 basePath: "/echo"
    └── package.json             # 依賴 ethers.js
```

---

## 🛠️ 2. 當前完成功能摘要

### A. 瀏覽器外掛：Chamber（回音密室）
1.  **自動攔截發文**：`inject.js` 攔截 `CometStoryCreateMutation`，背景即時擷取發文內容。
2.  **歷史貼文手動備份**：`content.js` 自動在 Facebook 文章旁注入 `[🔒 備份至 Web3]` 玻璃擬真按鈕，一鍵抓取 DOM 圖文內容送入上鏈流水線。
3.  **多媒體離線轉存 (Fallback Gateway)**：`background.js` 自動從快取下載媒體 Blob，上傳至 Imgur/R2 等離線空間取得 `fallback_backup` 備份連結。
4.  **轉世 ID 卡產生器**：`popup.js` 透過 HTML5 Canvas，根據使用者的錢包地址自動繪製專屬二維碼、文字與科技感邊框，並一鍵自動複製聲明文本到剪貼簿，同時觸發下載 `chamber-reborn-card.png`。
5.  **終極聲明文案（可編輯）**：預載「不自殺聲明 + Braveheart 自由咆哮 + 海賊王大秘寶」融合版經典迷因，使用者可在外掛內自由修改後一鍵發佈。

### B. 去中心化時光軸：Echo（回聲牆）
1.  **0-Backend 全鏈上架構**：前端直接向 Arweave GraphQL Indexer 撈取資料，不需要任何後端伺服器與資料庫。
2.  **雙層路徑與過濾**：
    *   `/[wallet]/all`：載入該錢包所有備份貼文。
    *   `/[wallet]/[platform]`（如 `/facebook`, `/threads`, `/x`, `/instagram`）：動態平台過濾。
    *   `/[wallet]/[platform]?tag=[標籤]`：聚合與過濾特定的標籤貼文。
3.  **個人簽署驗證與本地解密**：對於限友加密貼文，讀者連結錢包並進行簽名，前端比對作者的 Registry 名單後在瀏覽器本地以 AES-GCM 解密呈現。
4.  **圖片防封鎖機制**：`<img>` 內置 `onError` 機制，當原廠臉書 CDN 404 破圖時，會自動切換為 fallback_backup 的離線網關網址，保證重生牆永不破圖。

---

## 🚀 3. 服務部署與 Nginx 設定

我們已按照 `PORT_SOP` 標準將服務熱部署上線：
*   **Port 分配**：註冊使用 **`Port 3010`** (Echo 時光軸) 與 **`Port 3011`** (Chamber API)，已寫入 [/home/ubuntu/agent-data/PORT_SOP.md](file:///home/ubuntu/agent-data/PORT_SOP.md)。
*   **PM2 程序管理**：
    *   **`metashield-reborn`** (ID: 2)：運行於 `localhost:3010/echo` (Echo 前端時光軸)。
    *   **`chamber-api`** (ID: 3)：運行於 `localhost:3011/chamber-api` (Chamber 託管備份/查詢 API)。
*   **Nginx SSL 分流**：
    `/etc/nginx/sites-available/studio.milkcat.org` 已設定兩個 Location Block 指向對應服務並生效：
    *   `https://studio.milkcat.org/echo` 反向代理至 `localhost:3010`
    *   `https://studio.milkcat.org/chamber-api` 反向代理至 `localhost:3011`
    *   經測試，外部連線與 HTTPS 回傳正常。

---

## 🎯 4. 下一階段開發與改進重點

當您從公司回來或準備啟動下一輪開發時，可以聚焦以下幾點：

1.  **關係網綁定與激活 (Progressive Social Graph)**：
    *   實作 Alice 備份加密好友名單上鏈（Placeholder）與未來 Bob 錢包宣告（Binding）的碰撞機制，完成去中心化關係網的「漸進式激活」。
2.  **多平台 Scrapers 模組化**：
    *   在外掛中逐步加入 `threads.js`、`twitter_x.js` 的 DOM Scrapers，對接 `background.js` 的統一上鏈接口。
3.  **留言區「⚡一鍵貼上」輔助按鈕**：
    *   在 `content.js` 中實作 DOM 注入，當檢測到用戶發佈了轉世貼文並點開留言框時，直接在臉書留言框旁塞入一鍵貼上 Chamber 重生連結的輔助按鈕，達成「免權限、防降觸及、100% 絲滑」的留言第一樓體驗。
