import type { Locale } from "./i18n";

type Item = { title: string; body: string };
type GuideCopy = {
  title: string; backHome: string; badge: string; hero: string; intro: string; download: string; mappingJump: string;
  installTitle: string; installIntro: string; developerNoteTitle: string; developerNote: string; installSteps: Item[]; chromeNoteBefore: string; chromeNoteAfter: string;
  mappingTitle: string; mappingIntro: string; mappingSteps: Item[]; mappingCheckTitle: string; mappingChecks: string[]; wrongAccountTitle: string; wrongAccount: string; mappingImportant: string;
  backupTitle: string; backupSteps: string[];
  declarationTitle: string; declarationBody: string;
  echoTitle: string; echoBody: string; recoveryTitle: string; recoveryBody: string;
  portabilityTitle: string; portabilityBodyBefore: string; portabilityBodyAfter: string; portabilityWarning: string; portabilityDev: string;
  sharingTitle: string; sharingIntro: string; sharingSteps: string[]; sharingWarning: string;
  updateTitle: string; updateBody: string;
  faqTitle: string; faq: Item[];
  limitsTitle: string; limits: string[]; footerBack: string;
};

const zhTW: GuideCopy = {
  title: "安裝與使用指南", backHome: "← 返回 Echo 首頁", badge: "公開測試版 · Irys Devnet", hero: "從 Facebook 備份第一篇文章",
  intro: "Chamber 會把你明確選取的本人 Facebook 文章先在瀏覽器本機加密，再備份至測試網路。目前支援文字、可取得的圖片／相簿與原文連結；影片只保存文字、影片網址及可取得的封面，不會備份影片檔案。",
  download: "📥 下載 Chamber Extension 0.6.0", mappingJump: "查看 mapping 步驟",
  installTitle: "安裝 Chrome 擴充功能", installIntro: "目前尚未上架 Chrome 線上應用程式商店，因此使用 Chrome 的「載入未封裝項目」安裝。",
  developerNoteTitle: "不需要 Chrome 開發者帳號：", developerNote: "不必註冊開發者、不必支付上架費用。「開發人員模式」只是你自己電腦中 Chrome 擴充功能頁右上角的開關。",
  installSteps: [
    { title: "下載並解壓縮", body: "下載 Chamber ZIP 後完整解壓縮。請勿直接從 ZIP 內載入；選取的資料夾中必須直接看得到 manifest.json。" },
    { title: "開啟 Chrome 擴充功能頁", body: "在網址列輸入 chrome://extensions/，打開右上角的「開發人員模式」，再按「載入未封裝項目」。" },
    { title: "選取 Chamber 資料夾", body: "選擇剛才解壓縮、含有 manifest.json 的 extension 資料夾。安裝後可固定 Chamber 圖示並開啟側邊欄。" },
    { title: "完成 Chamber 帳號設定", body: "保持正確的 Facebook 帳號登入並停留在 Facebook，從側邊欄開啟 Chamber 帳號設定，依下方 mapping 步驟綁定。" },
  ],
  chromeNoteBefore: "Chrome 內部網址不能由一般網頁直接開啟。請複製", chromeNoteAfter: "到 Chrome 網址列，按 Enter，再開啟右上角的「開發人員模式」。",
  mappingTitle: "完成 Facebook mapping", mappingIntro: "Mapping 把目前登入的 Facebook 帳號、Chamber 暱稱和備份使用的儲存帳號登記成同一身分。Chamber 用它判斷文章是不是本人發布，並決定備份出現在哪個 Echo 時光牆；它不會取得 Facebook 密碼，也不需要 Facebook token。",
  mappingSteps: [
    { title: "登入要綁定的 Facebook 帳號", body: "開啟 facebook.com，確認右上角頭像與個人檔案是要備份的帳號，並讓目前分頁停留在 Facebook。" },
    { title: "開啟 Chamber 帳號設定", body: "在 Chamber 側邊欄按「開啟 Chamber 帳號設定」。第一次設定顯示「尚未 mapping」是正常狀態。" },
    { title: "輸入身份暱稱", body: "輸入容易辨識的英文或數字名稱，例如 sunlake。這會成為 Echo 網址的一部分，例如 /echo/sunlake/fb。" },
    { title: "檢查暱稱", body: "按「檢查」。看到暱稱可以使用才能繼續；若已被使用，請更換名稱。" },
    { title: "決定是否填寫自訂 Web3 錢包", body: "測試期間可留空，Chamber 會使用擴充功能建立的儲存帳號。這裡永遠不需要輸入私鑰。" },
    { title: "儲存並確認", body: "按「儲存並套用」。成功後會回到文章備份畫面，上方顯示暱稱，文章選取按鈕恢復可用。" },
  ],
  mappingCheckTitle: "如何確認 mapping 正確？", mappingChecks: ["Chamber 帳號顯示設定的暱稱。", "「在 Facebook 選取文章」可以按。", "選取本人文章時不會顯示非本人文章。"],
  wrongAccountTitle: "偵測到錯的 Facebook 帳號？", wrongAccount: "先在 Facebook 切回正確帳號，再按「重新讀取目前 Facebook 帳號」。目前版本固定一個 Chamber 帳號對應一個 Facebook 帳號。",
  mappingImportant: "重要：mapping 只負責身分與時光牆歸屬；真正解密的是本機金鑰。完成 mapping 後，請在 Echo 建立 2-of-3 復原設定：A 留在 Extension、Passkey 保護 Vault B、C 由你離線保存。C 只在建立期間顯示。",
  backupTitle: "備份一篇 Facebook 文章", backupSteps: ["登入 Facebook，進入已完成 mapping 的本人個人檔案頁。", "開啟 Chamber 側邊欄，確認 Chamber 與 Facebook 帳號正確。", "按「在 Facebook 選取文章」，再點文章本文、圖片或空白處；按 Esc 可退出。", "核對文字、圖片、時間與原文連結；依提示展開文字或完整載入相簿。", "按「備份這篇」。成功後可開啟單篇 Echo 或完整時光牆。"],
  declarationTitle: "建立 Web3 轉世聲明", declarationBody: "完成 mapping 後，可從 Side Panel 建立轉世聲明，編輯文字並產生含 Chamber 暱稱與 Echo QR Code 的卡片。Facebook 發文送出前仍由你確認；卡片不包含私鑰、Passkey 或復原碼 C。",
  echoTitle: "在 Echo 閱讀備份", echoBody: "使用相符 Chamber 身分開啟 Echo 後，時光牆會自動解鎖，不必逐篇操作。相簿可左右瀏覽；若自動解鎖未完成，可重新解鎖。",
  recoveryTitle: "務必保存緊急復原碼 C", recoveryBody: "Chamber 採 2-of-3：Extension 保存 A、Passkey 保護 Vault B、你離線保存 C。同裝置可用 A+C；Extension 遺失後以 Passkey 取得 B，再用 B+C。不要只把 C 留在目前電腦。若 C 遺失或疑似外洩，可通過現有 Passkey 輪替 A、B、C，舊 C 隨即失效。",
  portabilityTitle: "不透過 Echo 也能取得備份嗎？", portabilityBodyBefore: "可以。Echo 是官方閱讀器，不是資料本體。成功備份會回傳交易 ID 與原始資料網址；測試網可開啟", portabilityBodyAfter: "取得文章 JSON，媒體由 JSON 的 media 項目分別取得。",
  portabilityWarning: "原始網址是加密資料。閱讀器仍須取得擁有者或獲准收件者的文章金鑰，依 Chamber 格式解開文字與媒體。未來會提供公開 schema、測試向量與獨立／離線閱讀器。", portabilityDev: "交易欄位、GraphQL 標籤與解密順序記錄於 Data Portability 規格。",
  sharingTitle: "分享私密文章", sharingIntro: "新版備份使用每篇獨立文章金鑰。把單篇 Echo 連結傳給其他 Chamber 使用者，對方可申請閱讀，作者在 Echo 的閱讀申請中心核准。",
  sharingSteps: ["B 開啟 A 分享的單篇 Echo，連結自己的 Chamber Extension。", "B 按「向作者申請閱讀」，等待核准。", "A 在 Echo 的「閱讀申請」選擇允許或拒絕。", "B 重新解鎖；Extension 只解開獲准的該篇文章。"],
  sharingWarning: "授權不會交出作者復原金鑰，但收件者解密後仍可截圖或另存。舊版文章必須由作者重新備份成新版修訂才能分享。",
  updateTitle: "更新擴充功能", updateBody: "下載新版 ZIP、解壓縮並取代原資料夾內容，再到 chrome://extensions/ 按 Chamber 的重新載入，最後重新整理 Facebook 與 Echo。不要為更新而移除重裝；若必須重裝，先確認 Vault 已設定且 C 已保存到其他安全位置。",
  faqTitle: "常見問題", faq: [
    { title: "選不到文章", body: "先進入自己的 Facebook 個人檔案頁，再按文章選取。點本文、圖片或文章空白處，不要點留言。" },
    { title: "顯示非本人文章", body: "目前只允許備份與已 mapping Facebook 帳號相符的本人文章；分享自別人的原始內容可能被阻擋。" },
    { title: "文字未完整展開", body: "先按 Facebook 的「查看更多」，待側邊欄預覽更新後再備份。相簿可能需要依提示載入完整內容。" },
    { title: "圖片或相簿上傳失敗", body: "測試網可能有容量或 Facebook 圖片存取限制。系統會停止備份，避免缺少媒體卻顯示成功。" },
    { title: "Echo 無法解密", body: "確認 Chamber Extension 已啟用且使用原 Chamber 帳號。若曾移除重裝，通過原 Passkey 後以 Vault B＋C 還原。" },
    { title: "密碼管理器的 Passkey 視窗異常", body: "可切換系統 Passkey，由 Chamber Extension 呼叫 Windows Hello／Chrome。建立與日後復原應使用同一提供者。" },
  ],
  limitsTitle: "目前測試版限制", limits: ["目前只支援 Facebook 本人文章，其他平台仍在規劃。", "資料寫入 Irys Devnet，不是正式主網；測試資料與服務不保證永久。", "影片檔案尚未備份，只保存本文、原文網址與可取得的封面。", "Facebook 改版可能影響文章辨識；遇到錯誤請保留畫面與文章類型資訊。"], footerBack: "返回 Echo",
};

const en: GuideCopy = {
  title: "Installation & User Guide", backHome: "← Back to Echo", badge: "Closed Alpha · Irys Devnet", hero: "Back up your first Facebook post",
  intro: "Chamber encrypts an explicitly selected post that you authored locally in your browser, then backs it up to the test network. It supports text, available images and albums, and the source link. For video posts, this version stores text, the video URL, and an available poster—not the video file.",
  download: "📥 Download Chamber Extension 0.6.0", mappingJump: "View mapping steps",
  installTitle: "Install the Chrome Extension", installIntro: "Chamber is not yet in the Chrome Web Store, so the Closed Alpha is installed with Chrome's Load unpacked feature.",
  developerNoteTitle: "No Chrome developer account is required: ", developerNote: "You do not need to register or pay a store fee. Developer mode is only a local switch in Chrome's Extensions page.",
  installSteps: [
    { title: "Download and extract", body: "Download the Chamber ZIP and extract it completely. Do not load it from inside the ZIP. manifest.json must be directly visible in the selected folder." },
    { title: "Open Chrome Extensions", body: "Enter chrome://extensions/ in the address bar, enable Developer mode at the top right, then press Load unpacked." },
    { title: "Select the Chamber folder", body: "Choose the extracted extension folder containing manifest.json. You can then pin Chamber and open its Side Panel." },
    { title: "Set up your Chamber account", body: "Stay signed in to the correct Facebook account, open Chamber account settings in the Side Panel, and complete the mapping steps below." },
  ],
  chromeNoteBefore: "Web pages cannot open Chrome internal URLs. Copy", chromeNoteAfter: "into Chrome's address bar, press Enter, and enable Developer mode.",
  mappingTitle: "Complete Facebook mapping", mappingIntro: "Mapping registers the signed-in Facebook account, your Chamber alias, and the storage account as one identity. Chamber uses it to verify authorship and choose the Echo timeline. It never receives your Facebook password and does not require a Facebook token.",
  mappingSteps: [
    { title: "Sign in to the Facebook account", body: "Open facebook.com and confirm the profile avatar belongs to the account whose posts you want to back up. Keep the active tab on Facebook." },
    { title: "Open Chamber account settings", body: "Press Open Chamber account settings in the Side Panel. Not mapped is expected during first-time setup." },
    { title: "Enter an identity alias", body: "Choose a recognizable Latin-letter or numeric name such as sunlake. It becomes part of your Echo URL, for example /echo/sunlake/fb." },
    { title: "Check the alias", body: "Press Check. Continue only when Chamber confirms the alias is available; otherwise choose another one." },
    { title: "Decide whether to enter a Web3 wallet", body: "You may leave it blank during testing and use the Extension-created storage account. Never enter a private key here." },
    { title: "Save and verify", body: "Press Save and apply. Chamber returns to backup view, shows your alias, and enables post selection." },
  ],
  mappingCheckTitle: "How do I know mapping worked?", mappingChecks: ["Your Chamber account shows the chosen alias.", "Select a post on Facebook is enabled.", "Selecting your own post is not rejected as another person's post."],
  wrongAccountTitle: "Wrong Facebook account detected?", wrongAccount: "Switch to the correct account on Facebook, then press Refresh current Facebook account. This version maps one Chamber account to one Facebook account.",
  mappingImportant: "Important: mapping controls identity and timeline ownership; local keys perform decryption. After mapping, configure 2-of-3 recovery in Echo: A remains in the Extension, a passkey protects Vault B, and you store C offline. C is displayed only during setup.",
  backupTitle: "Back up a Facebook post", backupSteps: ["Sign in to Facebook and open your mapped personal profile.", "Open the Chamber Side Panel and confirm both accounts are correct.", "Press Select a post on Facebook, then click the post text, image, or empty post area. Esc exits selection.", "Verify text, images, publication time, and source link. Expand text or load the full album when prompted.", "Press Back up this post. After success, open the single-post Echo or full timeline."],
  declarationTitle: "Create a Web3 Reborn Declaration", declarationBody: "After mapping, create a reborn declaration in the Side Panel, edit its text, and generate a card containing your Chamber alias and Echo QR code. You review the Facebook post before publishing. The card contains no private key, passkey, or recovery code C.",
  echoTitle: "Read backups in Echo", echoBody: "When Echo opens with the matching Chamber identity, it unlocks the visible timeline automatically. Albums support left/right navigation. Retry unlock if automatic decryption does not finish.",
  recoveryTitle: "Keep emergency recovery code C safe", recoveryBody: "Chamber uses 2-of-3 recovery: the Extension stores A, a passkey protects Vault B, and you keep C offline. The same device can use A+C; after losing the Extension, authenticate the passkey to obtain B and use B+C. Do not keep C only on this computer. If C is lost or exposed, authenticate the existing passkey to rotate A, B, and C; the old C then stops working.",
  portabilityTitle: "Can I retrieve a backup without Echo?", portabilityBodyBefore: "Yes. Echo is the official reader, not the stored data. A successful backup returns a transaction ID and raw Web3 URL. On devnet, open", portabilityBodyAfter: "to fetch the article JSON; its media entries identify separate media objects.",
  portabilityWarning: "The raw URL contains encrypted data. A compatible reader still needs an authorized post key and must implement Chamber text and media decryption. Public schemas, test vectors, and an independent/offline reader are planned before mainnet.", portabilityDev: "Transaction fields, GraphQL tags, and the decryption sequence are documented in the Data Portability specification.",
  sharingTitle: "Share a private post", sharingIntro: "New backups use a separate content key per post. Send a single-post Echo link to another Chamber user; they request access and the author approves it in Echo's reading-request inbox.",
  sharingSteps: ["B opens A's single-post Echo and connects their Chamber Extension.", "B presses Request access and waits for approval.", "A opens Reading requests in Echo and allows or rejects that post.", "B retries unlock; the Extension decrypts only the approved post."],
  sharingWarning: "Approval never gives away the author's recovery key, but a recipient can still save or capture plaintext after decryption. Legacy posts require a new backup revision before sharing.",
  updateTitle: "Update the Extension", updateBody: "Download and extract the new ZIP over the existing folder, press Reload for Chamber at chrome://extensions/, then refresh Facebook and Echo. Do not uninstall merely to update. If reinstalling is unavoidable, first confirm the Vault is configured and C is stored elsewhere.",
  faqTitle: "Troubleshooting", faq: [
    { title: "A post cannot be selected", body: "Open your own Facebook profile first. Click post text, an image, or empty post space—not a comment." },
    { title: "Chamber says this is not my post", body: "Only posts authored by the mapped Facebook account are allowed. Original content reshared from another person may be blocked." },
    { title: "Text is not fully expanded", body: "Press See more on Facebook and wait for the Side Panel preview to update. Albums may need to load all items when prompted." },
    { title: "Image or album upload failed", body: "Devnet quota or Facebook media access may be unavailable. Chamber stops instead of falsely reporting a complete backup." },
    { title: "Echo cannot decrypt", body: "Confirm the Chamber Extension is enabled and uses the original account. After reinstalling, authenticate the original passkey and restore with Vault B plus C." },
    { title: "The password manager passkey window is blank", body: "Switch to System passkey so Chamber can invoke Windows Hello or Chrome directly. Use the same provider for setup and later recovery." },
  ],
  limitsTitle: "Current test-build limitations", limits: ["Only your own Facebook posts are supported; other platforms are planned.", "Data is written to Irys Devnet, not mainnet. Test data and service availability are not guaranteed permanently.", "Video files are not backed up; only available text, source URL, and poster are stored.", "Facebook layout changes can affect detection. Keep screenshots and post-type details when reporting errors."], footerBack: "Back to Echo",
};

export const guideCopy: Record<Locale, GuideCopy> = { "zh-TW": zhTW, en, es: en, ja: en, fr: en, pt: en };
