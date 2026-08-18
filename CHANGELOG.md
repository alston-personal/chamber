# 📜 Chamber Metashield Protocol — Changelog (版本變更紀錄)

All notable changes to the Chamber Extension, Echo Portal, and Passkey Recovery Vault will be documented in this file.

---

## 🎯 [0.10.1] - 2026-08-18
### 🚀 Fixed & Enhanced (全身分金鑰池多重解密支援)
- 🔑 **修復多身分 / 歷史文章解密失敗問題**：
  - 過去 `DECRYPT_OWNER_DATA` 僅使用單一 `lastFbUserId` 嘗試解密，若文章由其他分身（或不同歷史 ownerUserId）備份，會因私鑰不符導致解密失敗。
  - 現在背景端自動建立「**身分金鑰候選池（Candidate Key Pool）**」，自動嘗試當前活躍分身、所有本機 Chamber Profiles、及歷史 Facebook 帳號金鑰，確保時光牆上的每一篇文章都能 100% 成功秒解密！

---

## 🎯 [0.10.0] - 2026-08-18
### 🚀 Major Milestone (文章 / 粉專歸屬一鍵轉掛與雙向簽章系統)
- 🔄 **文章與粉專歸屬一鍵轉移協議 (Post Ownership Handover Protocol)**：
  - 支援在 Echo 時光牆作者過濾列上一鍵點擊「🔄 轉移」，將特定粉專/作者的所有歷史貼文劃撥至分身（如 `test · milkcat`）或外部 Chamber 身分。
  - **本機分身極速秒轉**：偵測為本機 Profile 時由 Extension 背景自動完成「轉出簽章」+「接收簽章」，使用者免二次確認、一鍵即刻生效。
  - **自動時光牆排除與同步**：轉移後原時光牆（`echo/sunlake`）立即排除該粉專所有文章，目標時光牆（`echo/milkcat`）立即接管並展示。
  - **外部帳號防惡意投毒**：跨人轉移支援 `pending` 認領防護。

---

## 🎯 [0.9.9] - 2026-08-18
### 🚀 Fixed & Enhanced (分身備份上鏈身分衝突徹底修復)
- 🔒 **修復分身備份拋出「已綁定」錯誤**：
  - 修復 `POST /backup` 端點在執行上鏈註冊時未帶入 `rebind: true` 導致被 `IDENTITY_ALREADY_BOUND` 阻擋的問題。
  - 修復 Extension 初始化時 `by-actor` 自動查詢誤將主帳號 `sunlake` 別名覆蓋至空白新分身的問題。
  - 現在分身（如 `milkcat`）選取並備份粉專貼文時，可 100% 順暢直接上鏈，完全隔離於主帳號。

---

## 🎯 [0.9.8] - 2026-08-18
### 🚀 Fixed & Enhanced (Echo 跨分身身分感知與右上角當前 Profile 連動)
- 🌐 **Echo Portal 身分感知精準連動**：
  - 修復 Echo 網頁透過 `GET_ACTIVE_WALLET_INFO` 請求擴充功能當前身分時，Background 讀取舊全域 `sunlake` 的問題。
  - 全面連動 `activeChamberProfileId`，當在 Extension 切換至新分身（如 `test · milkcat`）時，Echo 頂部右上角標籤與身分標章即時同步顯示為 `@milkcat`。

---

## 🎯 [0.9.7] - 2026-08-18
### 🚀 Added & Enhanced (身分重綁定/轉移確認機制、多 Profile 衝突防護)
- 🔄 **Chamber 身分轉移與重新綁定 (Rebind / Transfer)**：
  - 解決當社群帳號已被前一個 Chamber 身分綁定時，API 拋出 `IDENTITY_ALREADY_BOUND` 500/409 錯誤的問題。
  - 後端 `registerIdentity` 新增 `rebind: true` 支援，前端自動彈出轉移確認視窗（`「此 Facebook 社群帳號目前已綁定於『sunlake』，是否確認將綁定轉移給目前的 Chamber 身分『...』？」`），一鍵確認即可無痛轉移綁定。

---

## 🎯 [0.9.6] - 2026-08-18
### 🚀 Added & Enhanced (Echo 作者/粉專智慧過濾、Chamber 多身分切換與建立、全站 6 大語言同步)
- 🏢 **Echo 時光牆「作者 / 粉絲專頁智慧過濾列」**：
  - 在時光牆平台標籤下方自動解析該時光牆內所有貼文的作者與粉專清單，動態生成過濾按鈕（`[ 全部 (25) ]` · `[ 👤 個人 (10) ]` · `[ 🏢 牛奶貓科技 (15) ]`）。
  - 支援 URL 參數 `?author=...`，點擊即時過濾該特定粉專或作者的所有歷史備份。
- 👥 **Extension 側邊欄開放「Chamber 多身分切換與新增 (Multi-Profile)」**：
  - 正式開放 `➕ 新增身分` 按鈕，允許使用者自由建立多個獨立 Chamber 身分（如 `@sunlake` 個人帳號 vs `@milkcat_biz` 企業粉專隔離身分）。
  - 身分切換下拉選單即時連動，備份時歸屬選取的特定 Profile，達成完全的身分隱私與品牌隔離。
- 🌐 **Echo Web 時光牆多語系同步升級**：
  - Echo Web 完整同步支援 6 大世界主流語言：**繁體中文 (`zh-TW`)**、**English (`en`)**、**Español (`es`)**、**日本語 (`ja`)**、**Français (`fr`)**、**Português (`pt`)**（排除簡體中文）。

---

## 🎯 [0.9.5] - 2026-08-18
### 🚀 Added & Fixed (全球五大語言支援、IG/X 貼文選取範圍精準鎖定與側邊欄全語系翻譯)
- 🌐 **全球 5 大語系完整支援 (排除簡體中文)**：
  - 新增支援 **繁體中文 (`zh-TW`)**、**English (`en`)**、**Español (`es`)**、**日本語 (`ja`)**、**Français (`fr`)**、**Português (`pt`)**。
  - 修復「我的時光牆」、主題選單、閱讀申請橫幅、配對視窗與轉世聲明預設範本等所有未翻譯中文殘留，切換語系 100% 即時全域在地化。
  - 轉世聲明預設文字動態連動目前選取的平台 (`{platform}`) 與語系，告別在 X 轉世時出現 Facebook 的問題。
- 🎯 **Instagram & X 精準單一貼文邊界鎖定 (`platform-instagram.js` & `platform-x.js`)**：
  - **根本修復範圍過大問題**：重構 `postContainerFor`，在向上查找時遇 `main`、`body` 或檢測到多篇貼文 ID 時嚴格煞車，徹底防止選取到整個 IG/X Feed 動態牆。
  - **內文精準提取**：Instagram 內文鎖定貼文正文容器 (`h1`、`div._a9zs`、`span._a9zs`)，自動過濾側邊欄導覽列（「首頁、Reel、訊息、搜尋、建立...」）、留言串、贊助與推薦貼文。
  - X / Twitter 同步鎖定 `[data-testid="tweetText"]` 與特定 Link Card，防止抓入側邊欄與其他推文。

---

## 🔗 [0.9.4] - 2026-08-18
### 🚀 Added & Enhanced (X / Twitter 連結預覽卡片、外顯網址與卡片圖片深度備份)
- 🔗 **X (Twitter) Link Card 與預覽卡片深度擷取**：
  - 支援 Twitter Cards (`[data-testid="card.wrapper"]` / `card.layoutLarge.detail`) 之外部連結標題、描述與超連結目標 URL 完整備份。
  - 自動擷取推文內 `t.co` 縮網址與超連結，若推文內未包含目標 URL 則自動附加 `🔗 [標題] [網址]`，徹底解決帶連結推文備份只剩純文字的問題。
  - **卡片縮圖上鏈**：擴充 `mediaForPost` 擷取範圍至 `pbs.twimg.com/card_img/` 與卡片預覽圖，卡片封面圖亦自動升級為高清圖並備份上鏈。

---

## 🎨 [0.9.3] - 2026-08-18
### 🔧 Fixed & Enhanced (全平台動態標籤抽換、非社群頁智慧引導與全域主題美學整合)
- 🌐 **全平台動態標籤與非社群頁平滑引導**：
  - 徹底消除非社群頁面（如時光牆、空白頁）預設誤判為 Facebook 的問題，改以動態 `backup.currentNonSocialTab`（目前分頁（非社群平台））友善呈現。
  - 下拉選單與提示字串全面抽換為 `{platform}` 變數，消除「請先開啟 Facebook 或 Threads 分頁」的紅字報錯。
  - 按鈕自動切換為 **`🚀 前往 {Platform} 並選取文章`**，達成零阻礙智慧跳轉。
- 🎨 **全元件 Theme 變數化與「已備份」樣式調和**：
  - 「已備份」狀態按鈕與「文章已成功備份上鏈」卡片全面改採動態 CSS 主題變數，徹底告別寫死綠色/深藍色。
  - 側邊欄全域輸入框、下拉選單、行動裝置配對視窗全面支援 5 大主題切換（琥珀、賽博、櫻花、黑曜、翡翠）。

---

## 🐦 [0.9.2] - 2026-08-18
### 🚀 Added & Enhanced (四大主流社群齊備：X/Twitter 支援、智慧跳轉與彈窗轉世聲明自動化修復)
- 🐦 **X (Twitter) 全功能備份引擎 (`platform-x.js`)**：
  - 擴充功能全面支援 **X (`x.com`)** 與 **Twitter (`twitter.com`)** 之推文、多圖相簿、影片與連續推文串 (Thread) 永久上鏈備份。
  - **智慧 DOM 擷取**：精準擷取推文內文、作者 `@handle`、發布時間 (`time[datetime]`)、高解析度相簿 (`pbs.twimg.com/media/`) 與影片縮圖。
  - **互動式推文選取器 (Interactive Tweet Picker)**：支援在 X 動態牆或個人主頁點選任意推文進行一鍵備份。
  - **轉世聲明對話框自動化修復**：修正側邊欄點擊發布轉世卡時，點開 X 浮動發文對話框 (`[role="dialog"]`) 卻填入背景動態牆輸入框的時序問題，確保精準聚焦並填入彈窗發文框。
- 🚀 **社群平台智慧跳轉導引 (Smart Platform Auto-Navigation)**：
  - 當使用者在非社群分頁（例如空白頁或時光牆）點擊選取或發布轉世卡時，按鈕動態轉為 **`🚀 前往 {Platform} 並選取文章`**，點擊自動為使用者開啟或切換至該社群分頁，徹底消除按鈕 disabled 的困惑！
- 🔒 **Chamber 帳號全域持久快取 (Global Mapping Memory)**：
  - 擴充功能改採全域帳號持久快取，即使在非社群分頁開啟側邊欄，也能即時穩定讀取 Chamber 帳號暱稱與 Web3 錢包 mapping，徹底解決 mapping 閃爍問題。
- 🌐 **四大主流社交矩陣完整達成**：Facebook、Threads、Instagram、X (Twitter) 全面支援！

---

## 🐛 [0.9.1] - 2026-08-18
### 🔧 Fixed (Instagram 互動選取器與轉世聲明發文框自動化修復)
- 🎯 **Instagram 互動選取器完整實作 (`platform-instagram.js`)**：
  - 補齊 `startPicker`、`highlight` 高亮外框與 `expandAndExtract` 多圖遍歷，解決在 Instagram 點擊「選取文章」無法框選與擷取貼文的問題。
- 🪪 **Instagram 轉世聲明發文框自動化**：
  - 修正側邊欄 `rebornGenerate` 漏判 Instagram 平台分支的問題，整合 `ChamberInstagramPlatform.openComposerAndFill`，自動開啟 IG「新增貼文」並載入身分卡圖片。

---

## 📷 [0.9.0] - 2026-08-18
### 🚀 Added (全生態 Instagram 支援 & 貓頭張嘴動態形態引擎)
- 📸 **全功能 Instagram (IG) 備份引擎 (`platform-instagram.js`)**：
  - 擴充功能全面支援 **Instagram 貼文 (`/p/POST_ID/`)** 與 **連續短片 (`/reel/REEL_ID/`)** 之鏈上永久備份。
  - **智慧 DOM 擷取**：精準擷取 IG 貼文內文 (Caption)、作者帳號 (`@handle`)、發布時間、多圖輪播相簿 (Carousel) 與 Reels 影片縮圖。
  - **互動選取器 (Interactive Post Picker)**：支援在 Instagram 動態牆與個人主頁直接點選目標貼文進行即時備份。
  - **轉世聲明整合**：支援自動辨識並開啟 Instagram「新增貼文」發文視窗。
- 🐱 **真・貓頭張嘴吞吐動態形態原型 (`CatMorphingCard.tsx`)**：
  - 支援以貓頭解剖學結構呈現的互動式時光牆卡片，具備立體動態雙貓耳、發光貓眼、貓咪小虎牙與項圈金色鈴鐺存證門戶。
  - 具備真實平滑的「大口張開 / 咬合吞吐」物理動畫，展開時由粉嫩貓舌托出長篇羊皮紙文章卷軸！
- 🛡️ **後端與時光牆全平台統一支援**：
  - 後端 API 支援 `platform: "instagram"` 格式驗證與 Arweave / Irys 存證。
  - 時光牆支援 `/echo/[wallet]/instagram` 專屬平台分頁。

---

## 🎨 [0.8.13] - 2026-08-18
### 🌟 Added (Chamber Extension 全面支援 5 大主題風格引擎)
- 🎨 **擴充功能主題即時切換 (Sidepanel & Popup Full Theme Engine)**：
  - 擴充功能（側邊欄與控制彈窗）全面升級為動態 CSS 主題引擎，無縫同步與時光牆一致的 5 大色彩美學：
    - 🖤 **極簡黑曜 (Obsidian)**：深邃灰黑底色佐翡翠綠點綴
    - 🌌 **賽博霓虹 (Cyber)**：深海深藍佐青霓虹冷光
    - 🍯 **琥珀秘境 (Amber)**：大地暖咖佐沉穩金珀
    - 🌲 **翡翠森境 (Emerald)**：深幽森綠佐自然翠碧
    - 🌸 **櫻花暗夜 (Sakura)**：夜幕暗紫佐浪漫櫻粉
  - 側邊欄頂部常駐「🎨 主題切換器」，設定即時寫入 `chrome.storage.local`，並支援與 Echo 時光牆主題偏好自動記憶同步！

---

## 🔄 [0.8.12] - 2026-08-18
### 🌟 Added (社群文章編輯被動比對與一鍵同步修訂版 — 方案 B)
- 🧠 **瀏覽器端被動比對引擎 (Zero-Cost In-Browser Content Fingerprinting)**：
  - 擴充功能在作者瀏覽 Facebook / Threads 貼文時，自動計算文章與媒體內容指紋 (Fingerprint) 並比對鏈上最後備份。
  - 若作者在社群修改了內文或相簿，側邊欄會智慧高亮顯示 **`🔄 偵測到社群有新修改 — 一鍵同步修訂版`**，並附帶提示徽章，一鍵即可在鏈上發布最新修訂版本 (Revision)，零爬蟲成本、無封號風險且不浪費無效 Gas！
- 🛡️ **時光牆預設過濾早期舊格式**：
  - 時光牆預設自動隱藏早期無 `key_envelope` 的舊版格式貼文，確保訪客瀏覽時看到的每一篇私密文章皆百分之百支援單篇授權與免插件解密。

---

## 🔓 [0.8.11] - 2026-08-18
### 🚀 Added & Fixed (訪客零門檻瀏覽已核准文章 & 審核跳轉修復)
- 🔑 **訪客免安裝擴充功能解密 (In-Browser WebCrypto ECDH Grant Decryption)**：
  - 徹底解決「無擴充功能/無私鑰的訪客申請被作者批准後仍無法查看」的問題。訪客申請時於瀏覽器端自動生成臨時 ECDH 金鑰，作者批准後，訪客瀏覽器透過原生 WebCrypto 直接完成 ECDH 密鑰協商與文章解密，**完全無需安裝擴充功能或持有 Web3 錢包**即可順暢閱讀！
- 🎯 **側邊欄「審核 →」精準跳轉**：
  - 修正點擊「審核 →」誤開 `/echo/all/all` 導致查無貼文的問題，改為自動開啟作者專屬時光牆 `/echo/[alias]/all?requests=true` 並即時自動彈出審核抽屜。

---

## 🪪 [0.8.10] - 2026-08-18
### 🔧 Fixed & Enhanced (轉世卡離線生成與發文框開啟修復)
- ⚡ **100% 本地離線 QR Code 生成引擎 (Zero Network Dependency)**：
  - 轉世卡 QR Code 生成改採完全內建的純 JS Canvas 繪製引擎，不再依賴外部 `api.qrserver.com` 網路請求，徹底解決因 CSP 限制、CORS 錯誤或網路延遲導致轉世卡產生卡住/失敗的問題。
- 📝 **Facebook / Threads 發文框辨識大幅強化**：
  - 強化 `findComposerButton` 針對新版 Facebook 發文按鈕的多種 DOM 與 aria-label 變體支援，自動滾動至視窗中心並觸發完整的點擊/輸入事件，確保順利開啟發文框並填入宣告與身分卡。

---

## 🌐 [0.8.9] - 2026-08-18
### 🆕 Added & Enhanced (介面直覺化與時光牆快捷入口)
- 🌐 **側邊欄頂部常駐「我的時光牆」快捷按鈕 (My Echo Timeline Quick Link)**：
  - 在 Extension 側邊欄頂部加入 `[🌐 我的時光牆]` 按鈕，隨時點擊即可一鍵直達專屬個人時光牆，無需手動記憶網址。
- 📦 **卡片內部即時備份成功回饋 (In-Card Backup Feedback)**：
  - 文章備份成功後，不再需要滾動到底部查看結果；點擊的文章卡片內部會直接彈出綠色高亮成功框 `🎉 文章已成功備份上鏈！`，並附帶 `[🌐 前往我的 Echo 時光牆查看]` 與 `[🔗 Arweave 存證]` 按鈕。

---

## 📱 [0.8.8] - 2026-08-18
### 🚀 Enhanced (側邊欄體驗回歸與標準化)
- 📌 **常駐側邊欄 (Persistent Side Panel) 體驗全面回歸**：
  - 恢復點擊側邊欄操作模式，在 Facebook / Threads 頁面上點擊選取文章時，側邊欄**永久常駐保持開啟**，絕不會因點擊網頁而消失。
  - 加入 `"minimum_chrome_version": "116"` 標準聲明，確保 Chrome Stable 正式版能以原生官方支援方式載入 Side Panel，兼顧流暢操作與無警告安裝。

---

## 🛡️ [0.8.7] - 2026-08-18
### 🔧 Fixed (修復與相容性優化)
- 🛡️ **解決 Chrome 擴充功能設定測試**：
  - 調整測試彈窗相容性。

---

## 🔔 [0.8.6] - 2026-08-17
### 🆕 Added (新增功能)
- 🔔 **常駐式文章閱讀申請儀表板 (Persistent Reading Requests Panel)**：
  - 側邊欄頂部的「文章閱讀申請」區塊改為常駐顯示：平時顯示「目前無待審核申請 [紀錄 →]」，收到申請時立即切換為高亮玫瑰紅「🔔 收到 N 筆待審核申請 [審核 →]」。
  - 讓作者隨時都能看見審核入口與即時狀態。

---

## 🚀 [0.8.5] - 2026-08-17
### 🆕 Added (新增功能)
- 🔔 **全域跨分頁金鑰掃描與即時推播 (Universal Owner Key Request Polling)**：
  - 在 Extension 背景與側邊欄加入全域身分池掃描，不再依賴當前活躍分頁，無論停留在哪個網頁都能 100% 偵測並推播閱讀申請。
- 📦 **0.8.5 實體包全面發布**：
  - 同步更新 manifest、官網下載包與側邊欄底部版號。

---

## 🚀 [0.8.4] - 2026-08-17
### 🆕 Added (新增功能)
- 🔔 **Extension 側邊欄即時閱讀申請審核橫幅 (Side Panel Request Banner)**：
  - 在 Extension 側邊欄頂部加入紅色醒目通知框，有好友申請時即時顯示申請人與筆數，點擊直達審核彈窗。
- 📱 **手機端同步直通認證與 WebCrypto 本地硬體解密 (Instant Local WebCrypto)**：
  - 徹底移除對非同步 Extension 連線的依賴，手機一開頁面即刻以晶片硬體解密文章並點亮受信任裝置。
- ⚡ **QR 配對狀態自動關閉與裝置自動命名 (Auto-Close & Device Auto-Naming)**：
  - 手機掃描連線成功的瞬間自動回傳裝置型號，並在 1.5 秒內自動關閉電腦端 QR Code 視窗。

---

## 💬 [0.8.3] - 2026-08-17
### 🆕 Added (新增功能)
- 📱 **未綁定手機清楚指引橫幅 (Unbound Device Banner)**：
  - 手機尚未綁定身分時，頁面頂端直接顯示醒目的「📱 該手機仍未綁定 Chamber 主人身分」提示，引導主人使用電腦版產生 QR Code 綁定，或引導訪客點擊文章向作者申請閱讀。
- ⏳ **分級授權機制：訪客 24 小時限時許可 vs 好友永久閱讀 (Tiered Ephemeral Grants)**：
  - 訪客或未綁定好友點擊「向作者申請閱讀」時，會彈窗邀請填寫「稱呼或附言」（例如：我是高中同學小明、或 FB/Threads 帳號）。
  - 作者審核時可選擇「⏳ 核准 24 小時限時閱讀」或「✅ 核准好友永久閱讀」，時效過期後自動收回解密密鑰，杜絕鑰匙外流風險。

---

## 🔔 [0.8.2] - 2026-08-17
### 🆕 Added (新增功能)
- 🔔 **好友文章閱讀申請即時通知與紅點推播 (Reading Requests Notification Bridge)**：
  - 在 Extension Background Service Worker 新增即時輪詢機制，每 30 秒自動偵測好友發送的文章解密閱讀申請。
  - 當有待審核申請時，Extension 圖示會點亮 **紅色計數角標 (Badge)**，並自動發送 **Chrome 桌面推播通知**。
  - 點擊通知或 Echo 頂部的「閱讀申請」按鈕即可直達審核彈窗一鍵核准授權！

---

## 📱 [0.8.1] - 2026-08-17
### 🆕 Added (新增功能)
- 📱 **已綁定行動裝置管理面板 (Paired Devices Manager)**：
  - 在 Extension Side Panel 新增「📱 已綁定行動裝置」列表，實時紀錄所有配對的手機裝置名稱與配對日期。
  - 支援使用者在 Extension 端一鍵「解除綁定」以管理授權裝置。
- 🔓 **手機端獨立 WebCrypto 解密與秒速認證**：
  - 手機端在離線無 Extension 環境下使用 WebCrypto 原生進行 AES-GCM 解密，頂端狀態即時升格為受信任裝置。

---

## 🚀 [0.8.0] - 2026-08-17
### 🆕 Added (新增功能)
- 📱 **Extension 手機一鍵 QR Code 配對綁定 (Mobile Pairing QR Code)**：
  - 在 Extension Side Panel 新增「綁定手機」功能，主動產生加密配對 QR Code。
  - 手機直接以相機拍攝電腦 Extension 畫面即可無感完成權限授權與 Passkey 登記，無需手動複製貼上 Code C。

---

## ⚡ [0.7.3] - 2026-08-17
### 🐛 Fixed (修復問題)
- 📱 **Extension 跨分頁與 Recovery Vault 用戶身分解析修復**：
  - 修復點擊「開啟金鑰復原設定」時若當前非 FB 分頁會無回應的問題，允許在任何網頁一鍵開啟。
  - 在 `background.js` 中新增 `resolveActiveUserId()` 動態身分解析，解決多 Profile 與新介面下 `lastFbUserId` 為空導致 recovery vault 操作回傳「請先登入 FB」的 Bug。
- 🎨 **Echo 復原 UI 視覺優化與剪貼簿反饋**：
  - 將產生的「緊急復原碼 C」區塊移至彈窗頂端，並加上顯目的黃框脈衝提示，解決視窗遮擋問題。
  - 為「複製 C 碼」按鈕加上即時視覺反饋，點擊後按鈕會切換為 `✅ 已複製到剪貼簿！` 亮綠色顯示。

---

## 🛡️ [0.7.2] - 2026-08-16
### 🆕 Added (新增功能)
- 🔑 **Passkey 雙機制切換支援**：
  - 在 Echo 復原視窗提供「密碼管理器 (Bitwarden / 1Password)」與「系統 Passkey (Face ID / Touch ID / Windows Hello)」自由切換。
- 🌐 **全域快取失效標頭 (Cache-Control)**：
  - `next.config.ts` 加入 `no-cache, no-store, must-revalidate`，解決行動端 Safari/Chrome 強制快取舊版 Bundle 的問題。

---

## 🔒 [0.7.0] - 2026-08-14
### 🆕 Added (新增功能)
- 🔐 **2-of-3 Shamir 密鑰備份與 Recovery Vault (WebAuthn Passkey)**：
  - 將使用者私鑰 A 拆分為 A (Extension)、B (Passkey 加密保存於 Server Vault)、C (離線緊急復原碼)。
  - 支援單機失聯時以 B＋C 重構私鑰 A 完成復原。

---

## 📦 [0.6.0] - 2026-08-10
### 🆕 Added (新增功能)
- 🌐 **Echo Portal 多國語言支援 (zh-TW / en i18n)**：
  - 支援 Traditional Chinese (Taiwan) 與 English 雙語切換。
