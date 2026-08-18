# 📜 Chamber Metashield Protocol — Changelog (版本變更紀錄)

All notable changes to the Chamber Extension, Echo Portal, and Passkey Recovery Vault will be documented in this file.

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
