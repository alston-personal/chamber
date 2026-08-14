# Chamber Protocol (回音室協定) - 測試人員指南

歡迎參與 **Chamber Protocol（去中心化社交迴響室）** 測試！
目前版本讓使用者明確選取自己的 Facebook 文章，在瀏覽器本機加密文字與支援的圖片，再備份至 Irys Devnet，並於 Echo 私密時光牆解密瀏覽。

---

## 📥 步驟 1: 下載並安裝瀏覽器外掛

1.  **下載外掛壓縮檔**：
    點擊下載並解壓縮固定版本：[chamber-extension-v0.6.0.zip](https://studio.milkcat.org/echo/releases/chamber-extension-v0.6.0.zip)
2.  **開啟 Chrome 擴充功能頁面**：
    在 Google Chrome 瀏覽器網址列輸入 `chrome://extensions/` 並斷行。
3.  **啟用開發人員模式**：
    開啟頁面右上角的**「開發人員模式」**（Developer mode）開關。
4.  **載入外掛**：
    點選左上角的**「載入未封裝項目」**（Load unpacked）按鈕，選擇剛才解壓縮出來的 `extension` 資料夾。
5.  **完成安裝**：
    安裝成功後，您會在 Chrome 工具列看見一個名為 **Chamber Protocol** 的外掛圖示（拼圖展開選單內）。

### 本地開發測試（推薦）

若要測試最新程式碼，不需要反覆下載 ZIP：

1. 本地開發請直接載入專案內的 `extension/` 資料夾；`python3 scripts/pack-extension.py` 只會產生 `dist/chamber-extension-dev.zip`，不會覆寫官網版本。
2. 只有完成測試後執行 `python3 scripts/pack-extension.py --release 0.6.0 --promote`，才會建立版本化 ZIP 並更新官網穩定下載別名。
2. 在 `chrome://extensions/` 點擊 Chamber 的 **Reload**。
3. 重新整理已開啟的 Facebook 分頁，讓新的 content script 生效。
4. 修改程式後重複第 2、3 步。

Chrome 不允許 MV3 外掛可靠地從自身讀取安裝目錄，因此 Chamber 不再執行背景自動檔案 watcher。

---

## 🔐 步驟 2：設定 Chamber 帳號

1. 點擊工具列的 Chamber 圖示開啟側欄。
2. 在「Chamber 帳號設定」完成暱稱 mapping；目前測試版固定使用一個 Chamber 帳號與一個 Facebook 帳號。
3. 擴充功能會建立本機擁有者金鑰。備份不會突然開啟下載視窗；尚未設定復原時，側欄會引導到 Echo。復原採 2-of-3：Extension 保存 A、Passkey 保護加密 Vault 中的 B、使用者離線保存 C。同裝置可用 A+C，新裝置通過 Passkey 後可用 B+C 還原。
4. Side Panel 的「建立轉世聲明」可編輯聲明文字、產生含 Chamber 暱稱與 Echo QR Code 的身分卡，並開啟 Facebook 發文框；實際送出前仍由使用者自行確認。

---

## 👥 步驟 3: 開始備份 Facebook 貼文

1. 開啟自己的 [Facebook 個人頁](https://www.facebook.com)。
2. 在 Chamber 側欄按「在 Facebook 選取文章」。
3. 點擊文章的主文字或主要圖片；留言與無法確認為本人的文章會被阻擋。
4. 確認側欄預覽、原文連結、發文時間與媒體數量，再按「備份這篇」。
5. 含「查看更多」的文章會先嘗試展開；相簿會載入照片並顯示進度。

目前版本不備份影片檔，只保存文章文字、Facebook 影片網址與可取得的封面。一般圖片或相簿媒體若上傳失敗，系統會停止備份，避免顯示假成功。

---

## 步驟 4：檢視 Echo 時光牆

1. 備份成功後可選「查看這篇備份」或「查看完整 Echo 時光牆」。
2. 使用相符的 Chamber 身分開啟 Echo 後，時光牆會由擴充功能自動解鎖；「重新解鎖」保留作失敗重試。
3. 大型相簿會分批解密並顯示進度；部分圖片失敗不會讓文字重新鎖住。
4. 同一篇文章再次備份會建立不可變的新版本；一般時光牆顯示最新版本，歷史模式保留所有版本。

### 私密文章閱讀申請

- 新版文章採每篇獨立金鑰，可將單篇 Echo 連結傳給另一位 Chamber 使用者。
- 對方按「向作者申請閱讀」後，作者可在 Echo 的「閱讀申請」通知中心允許單篇或拒絕。
- 核准時 Extension 只替對方建立該篇文章的加密授權信封，不會交出作者復原金鑰。
- 舊版文章需重新備份成新版修訂後才能分享。

### 測試網說明

- 目前版本固定使用 Irys Devnet，主網尚未啟用。
- 網址不需要 `?debug=true`，文章也不再顯示內部 DEBUG 標籤。
- Devnet 適合功能測試，不應視為正式永久保存承諾。
