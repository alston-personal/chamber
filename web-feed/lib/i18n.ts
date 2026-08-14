export const supportedLocales = ["zh-TW", "en"] as const;
export type Locale = (typeof supportedLocales)[number];

export const localeLabels: Record<Locale, string> = {
  "zh-TW": "繁體中文",
  en: "English",
};

export function normalizeLocale(value?: string | null): Locale {
  const locale = String(value || "").toLowerCase();
  if (locale === "zh-tw" || locale === "zh-hant" || locale.startsWith("zh-hant-") || locale.startsWith("zh")) return "zh-TW";
  return "en";
}

export const messages = {
  "zh-TW": {
    "language.label": "語言",
    "common.guide": "安裝與使用指南",
    "common.enter": "進入",
    "home.subtitle": "去中心化社交迴響室",
    "home.walletConnected": "已連結錢包",
    "home.connectWallet": "連結錢包登入",
    "home.connectSuccess": "連結成功！正在跳轉至您的個人動態牆...",
    "home.sandboxStarting": "啟動安全模擬錢包...",
    "home.metamaskConnecting": "正在連結 MetaMask...",
    "home.unknownError": "未知錯誤",
    "home.metamaskPending": "MetaMask 傳回未預期錯誤 (-32603)。通常是 MetaMask 中有尚未關閉的連線請求。請打開 MetaMask 手動確認，或使用測試模擬錢包。",
    "home.connectFailed": "連結失敗：{error}",
    "home.detecting": "正在偵測 Chamber 擴充功能與錢包...",
    "home.extensionDetected": "已偵測到 Chamber 擴充功能錢包！請在彈窗中選擇連結方式。",
    "home.extensionMissing": "未偵測到 Chamber 擴充功能，請選擇其他連結方式。",
    "home.useSandbox": "⚡ 使用測試模擬錢包直接進入",
    "home.hero": "您的社交資料，由您永久掌控",
    "home.heroBody": "Chamber 目前提供 Facebook 本人文章的加密備份測試。文字與支援的圖片會先在瀏覽器本機加密，再寫入 Irys Devnet；擁有者登入後會自動解鎖，也能在 Echo 核准其他 Chamber 使用者閱讀指定單篇，不必交出復原金鑰。",
    "home.privateEcho": "開啟私密 Echo",
    "home.privateEchoBody": "Chamber 擴充功能在本機完成身分驗證與 AES 解密；擁有者與獲准讀者登入後由 Echo 自動解鎖。",
    "home.connectOpen": "連結並開啟",
    "home.followCreator": "追蹤創作者",
    "home.followCreatorBody": "輸入創作者註冊的 Web3 暱稱或錢包地址，直接讀取其備份在去中心化網路上的文章動態。",
    "home.aliasPlaceholder": "暱稱（例如：sunlake）",
    "home.download": "下載瀏覽器擴充功能",
    "home.downloadBody": "安裝後從側欄明確選取自己的 Facebook 文章，再備份文字、支援的圖片與原文連結。",
    "home.downloadButton": "📥 下載 Extension 0.5.8（封測版）",
    "home.readGuide": "先看安裝與使用指南 →",
    "home.flow": "Chamber 去中心化社交架構流程",
    "home.select": "明確選取文章",
    "home.selectBody": "使用者在 Facebook 頁面選取一篇自己的文章，避免備份錯篇。",
    "home.encrypt": "本機加密",
    "home.encryptBody": "文字與圖片在擴充功能內以 AES-GCM 加密，金鑰留在使用者端。",
    "home.write": "API 寫入上鏈",
    "home.writeBody": "目前測試版透過 Chamber API 寫入 Irys Devnet，主網尚未啟用。",
    "home.echoPortal": "去中心化動態牆",
    "home.echoPortalBody": "Echo 自動向 Chamber 擴充功能請求本機解密，並集中處理單篇閱讀申請。",
    "home.chooseWallet": "選擇連結錢包",
    "home.chooseWalletBody": "選擇登入時光牆的 Web3 錢包，以讀取去中心化文章並解密私密備份。",
    "home.extensionWallet": "Chamber 擴充功能錢包",
    "home.detected": "已偵測到",
    "home.useExtensionWallet": "使用此外掛錢包進入",
    "home.extensionUnlockHint": "未偵測到 Chamber 擴充功能（若已安裝，請確認已啟用）",
    "home.browserWallet": "MetaMask／瀏覽器錢包",
    "home.browserWalletBody": "呼叫瀏覽器錢包進行多帳號切換與連結",
    "home.sandboxWallet": "模擬安全錢包（Sandbox）",
    "home.sandboxWalletBody": "免安裝錢包，使用沙盒模擬帳戶直接登入體驗",
    "home.or": "或",
    "home.readOnlyPlaceholder": "輸入創作者別名或錢包地址（唯讀模式）",
  },
  en: {
    "language.label": "Language",
    "common.guide": "Installation & User Guide",
    "common.enter": "Open",
    "home.subtitle": "Decentralized social echoes",
    "home.walletConnected": "Wallet connected",
    "home.connectWallet": "Connect wallet",
    "home.connectSuccess": "Connected. Opening your personal timeline...",
    "home.sandboxStarting": "Starting the secure sandbox wallet...",
    "home.metamaskConnecting": "Connecting MetaMask...",
    "home.unknownError": "Unknown error",
    "home.metamaskPending": "MetaMask returned error -32603, usually because a connection request is still pending. Open MetaMask to resolve it, or use the sandbox wallet.",
    "home.connectFailed": "Connection failed: {error}",
    "home.detecting": "Detecting Chamber Extension and wallets...",
    "home.extensionDetected": "Chamber Extension wallet detected. Choose how to connect in the dialog.",
    "home.extensionMissing": "Chamber Extension was not detected. Choose another connection method.",
    "home.useSandbox": "⚡ Continue with sandbox wallet",
    "home.hero": "Your social data, permanently under your control",
    "home.heroBody": "Chamber is testing encrypted backups of your own Facebook posts. Supported text and images are encrypted locally in your browser before being written to Irys Devnet. Owners unlock automatically in Echo and can approve another Chamber user to read a specific post without sharing the recovery key.",
    "home.privateEcho": "Open a private Echo",
    "home.privateEchoBody": "The Chamber Extension performs identity verification and AES decryption locally. Echo unlocks automatically for owners and approved readers.",
    "home.connectOpen": "Connect and open",
    "home.followCreator": "Follow a creator",
    "home.followCreatorBody": "Enter a creator's registered Web3 alias or wallet address to read posts they backed up to the decentralized network.",
    "home.aliasPlaceholder": "Alias (for example: sunlake)",
    "home.download": "Download the browser extension",
    "home.downloadBody": "Use the Side Panel to select your own Facebook post explicitly, then back up its text, supported images, and source link.",
    "home.downloadButton": "📥 Download Extension 0.5.8 (Closed Alpha)",
    "home.readGuide": "Read the installation and user guide →",
    "home.flow": "Chamber decentralized social flow",
    "home.select": "Explicit post selection",
    "home.selectBody": "Select one of your own Facebook posts to prevent backing up the wrong content.",
    "home.encrypt": "Local encryption",
    "home.encryptBody": "The Extension encrypts text and images with AES-GCM while keys remain under user control.",
    "home.write": "API write-through",
    "home.writeBody": "The test build writes through Chamber API to Irys Devnet. Mainnet is not enabled.",
    "home.echoPortal": "Decentralized timeline",
    "home.echoPortalBody": "Echo asks the Chamber Extension for local decryption and manages per-post reading requests.",
    "home.chooseWallet": "Choose a wallet",
    "home.chooseWalletBody": "Choose the Web3 wallet used to enter a timeline, read decentralized posts, and decrypt private backups.",
    "home.extensionWallet": "Chamber Extension wallet",
    "home.detected": "Detected",
    "home.useExtensionWallet": "Continue with Extension wallet",
    "home.extensionUnlockHint": "Chamber Extension was not detected. If installed, make sure it is enabled.",
    "home.browserWallet": "MetaMask / browser wallet",
    "home.browserWalletBody": "Use a browser wallet for account switching and connection",
    "home.sandboxWallet": "Secure sandbox wallet",
    "home.sandboxWalletBody": "Try Echo immediately with a simulated account and no wallet installation",
    "home.or": "or",
    "home.readOnlyPlaceholder": "Creator alias or wallet address (read-only)",
  },
} as const;

export type TranslationKey = keyof (typeof messages)["zh-TW"];

export function translate(locale: Locale, key: TranslationKey, variables: Record<string, string | number> = {}) {
  const template: string = messages[locale][key] || messages["zh-TW"][key] || key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  );
}
