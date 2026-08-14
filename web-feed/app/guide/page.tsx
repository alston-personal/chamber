import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "安裝與使用指南 | Chamber Protocol",
  description: "Chamber Chrome 擴充功能的安裝、Facebook 文章備份、Echo 解密、閱讀授權與 2-of-3 復原指南。",
};

const steps = [
  {
    number: "01",
    title: "下載並解壓縮",
    body: "下載 Chamber ZIP 後先完整解壓縮。請勿直接從 ZIP 內載入；最後選取的資料夾中必須直接看得到 manifest.json。",
  },
  {
    number: "02",
    title: "開啟 Chrome 擴充功能頁",
    body: "在網址列輸入 chrome://extensions/，打開頁面右上角的「開發人員模式」開關，再按「載入未封裝項目」。這只是 Chrome 的本機開關，不需要申請開發者帳號，也不需要付費。",
  },
  {
    number: "03",
    title: "選取 Chamber 資料夾",
    body: "選擇剛才解壓縮、含有 manifest.json 的 extension 資料夾。安裝完成後，可從 Chrome 工具列固定 Chamber 圖示並開啟側邊欄。",
  },
  {
    number: "04",
    title: "完成 Chamber 帳號設定",
    body: "保持正確的 Facebook 帳號登入並停留在 Facebook 頁面，從側邊欄開啟 Chamber 帳號設定，依下方 mapping 步驟綁定。",
  },
];

const troubleshooting = [
  ["選不到文章", "請先進入自己的 Facebook 個人檔案頁，再點「在 Facebook 選取文章」。點文章本文、圖片或文章空白處，不要點留言。"],
  ["顯示非本人文章", "目前只允許備份與已 mapping Facebook 帳號相符的本人文章；分享自別人的原始內容可能被阻擋。"],
  ["文字未完整展開", "先按 Facebook 文章中的「查看更多」，待側邊欄預覽更新後再備份。相簿可能需要依提示載入完整內容。"],
  ["圖片或相簿上傳失敗", "測試網可能有容量或 Facebook 圖片存取限制。系統會停止備份，避免產生缺少媒體卻顯示成功的資料。"],
  ["Echo 無法解密", "確認 Chamber 擴充功能仍已啟用且使用原本的 Chamber 帳號。若曾移除重裝，請到 Echo 的金鑰復原設定，通過原 Passkey 後以 Vault B＋緊急復原碼 C 還原。"],
  ["Bitwarden 建立 Passkey 出現白窗", "金鑰復原畫面預設保留 Bitwarden／1Password 等標準 WebAuthn 流程；若提供者視窗異常，可切換「系統 Passkey」，由 Chamber Extension 隔離環境直接呼叫 Windows Hello／Chrome。建立與日後復原應選擇同一提供者。"],
];

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <header className="sticky top-0 z-50 border-b border-indigo-950/40 bg-slate-950/85 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
              🔒
            </span>
            <span>
              <span className="block text-sm font-bold text-indigo-200">Chamber Protocol</span>
              <span className="block text-[9px] font-mono text-slate-500">安裝與使用指南</span>
            </span>
          </Link>
          <Link href="/" className="text-xs font-semibold text-slate-400 hover:text-indigo-300">
            ← 返回 Echo 首頁
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <section className="mb-12 max-w-2xl">
          <div className="mb-4 inline-flex rounded-full border border-amber-800/50 bg-amber-950/30 px-3 py-1 text-[10px] font-semibold text-amber-300">
            公開測試版 · Irys Devnet
          </div>
          <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">從 Facebook 備份第一篇文章</h1>
          <p className="text-sm leading-7 text-slate-400">
            Chamber 會把你明確選取的本人 Facebook 文章先在瀏覽器本機加密，再備份至測試網路。
            目前支援文字、可取得的圖片／相簿與原文連結；影片只保存文字、影片網址及可取得的封面，不會備份影片檔案。
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="/echo/releases/chamber-extension-v0.5.8.zip"
              download="chamber-extension-v0.5.8.zip"
              className="rounded-xl bg-emerald-600 px-5 py-3 text-center text-sm font-bold text-white shadow-lg shadow-emerald-950/30 transition-colors hover:bg-emerald-500"
            >
              📥 下載 Chamber Extension 0.5.8
            </a>
            <a
              href="#mapping"
              className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-slate-300 transition-colors hover:border-indigo-700 hover:text-white"
            >
              查看 mapping 步驟
            </a>
          </div>
        </section>

        <section id="install" className="scroll-mt-24 border-t border-slate-900 pt-10">
          <h2 className="mb-2 text-xl font-bold text-white">安裝 Chrome 擴充功能</h2>
          <p className="text-xs leading-6 text-slate-500">目前尚未上架 Chrome 線上應用程式商店，因此使用 Chrome 的「載入未封裝項目」安裝。</p>
          <div className="my-5 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 text-xs leading-6 text-emerald-100">
            <strong>不需要 Chrome 開發者帳號：</strong>不必註冊開發者、不必支付上架費用。這裡的「開發人員模式」只是你自己電腦中 Chrome 擴充功能頁右上角的一個開關，打開後才能選擇下載的 Chamber 資料夾。
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {steps.map((step) => (
              <article key={step.number} className="rounded-2xl border border-slate-850 bg-slate-900/50 p-5">
                <div className="mb-3 font-mono text-xs font-bold text-indigo-400">STEP {step.number}</div>
                <h3 className="mb-2 text-sm font-bold text-slate-100">{step.title}</h3>
                <p className="text-xs leading-6 text-slate-400">{step.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4 text-xs leading-6 text-indigo-200">
            Chrome 內部網址不能由一般網頁直接開啟。請複製 <code className="rounded bg-slate-950 px-1.5 py-1 font-mono text-indigo-300">chrome://extensions/</code> 到 Chrome 網址列，按 Enter，再打開右上角的「開發人員模式」。
          </div>
        </section>

        <section id="mapping" className="mt-14 scroll-mt-24 border-t border-slate-900 pt-10">
          <h2 className="mb-2 text-xl font-bold text-white">完成 Facebook mapping</h2>
          <p className="max-w-3xl text-sm leading-7 text-slate-400">
            Mapping 是把「目前登入的 Facebook 帳號」、「你的 Chamber 暱稱」和「備份使用的 Chamber 儲存帳號」登記成同一個身分。
            Chamber 會用它判斷文章是不是本人發布，並決定備份要出現在哪一個 Echo 時光牆。它不會取得你的 Facebook 密碼，也不需要你手動提供 Facebook token。
          </p>

          <div className="mt-7 space-y-4">
            {[
              {
                title: "先登入要綁定的 Facebook 帳號",
                body: "開啟 facebook.com，確認右上角頭像與個人檔案確實是你要備份的帳號，並讓目前分頁停留在 Facebook。Chamber 會從這個登入狀態讀取 Facebook 帳號識別碼。",
              },
              {
                title: "在 Chamber 側邊欄開啟帳號設定",
                body: "按「開啟 Chamber 帳號設定」。若畫面顯示「尚未 mapping」，這正是第一次設定時的正常狀態。",
              },
              {
                title: "輸入身份暱稱",
                body: "在「身份暱稱 / mapping」輸入容易辨識的英文或數字名稱，例如 sunlake。這個名稱會成為 Echo 網址的一部分，例如 /echo/sunlake/fb。",
              },
              {
                title: "檢查暱稱",
                body: "按「檢查暱稱」。看到「暱稱可以使用」才能繼續；若已被使用，請更換另一個名稱。",
              },
              {
                title: "決定是否填寫自訂 Web3 錢包",
                body: "目前測試可先留空，Chamber 會使用擴充功能建立的儲存帳號。只有已經清楚知道要使用哪個 Web3 錢包時才填入地址；這裡不需要輸入私鑰。",
              },
              {
                title: "儲存並確認成功",
                body: "按「儲存並套用」。成功後會顯示「已完成 mapping」，並自動回到文章備份畫面；上方 Chamber 帳號應顯示你的暱稱，「在 Facebook 選取文章」按鈕也會恢復可用。",
              },
            ].map((item, index) => (
              <article key={item.title} className="flex gap-4 rounded-2xl border border-slate-850 bg-slate-900/45 p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">{index + 1}</span>
                <div>
                  <h3 className="mb-1.5 text-sm font-bold text-slate-100">{item.title}</h3>
                  <p className="text-xs leading-6 text-slate-400">{item.body}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/15 p-4">
              <h3 className="mb-2 text-xs font-bold text-emerald-200">如何確認 mapping 正確？</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-xs leading-5 text-slate-400">
                <li>Chamber 帳號選單顯示你設定的暱稱，而不是「尚未 mapping」。</li>
                <li>「在 Facebook 選取文章」按鈕可以按。</li>
                <li>選取本人文章時不會出現「無法備份非本人文章」。</li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/15 p-4">
              <h3 className="mb-2 text-xs font-bold text-amber-200">偵測到錯的 Facebook 帳號？</h3>
              <p className="text-xs leading-6 text-slate-400">
                先在 Facebook 切回正確帳號，再按側邊欄的「重新讀取目前 Facebook 帳號」。目前測試版固定一個 Chamber 帳號對應一個 Facebook 帳號；請不要用同一個 Chamber 帳號輪流綁定多人帳號。
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-rose-900/50 bg-rose-950/15 p-4 text-xs leading-6 text-rose-100">
            <strong>重要：</strong>mapping 只負責身分與時光牆歸屬；真正解密備份的是本機金鑰。完成 mapping 後，請從 Echo 的錢包選單開啟「金鑰復原設定」，按「建立復原設定並產生 C」：A 留在 Extension、Passkey 保護 Vault 的 B、C 由你離線保存。Passkey 私鑰由密碼管理器或系統保管，Chamber 不會顯示；C 只在建立期間顯示，確認保存後不會再次取回。
          </div>
        </section>

        <section className="mt-14 border-t border-slate-900 pt-10">
          <h2 className="mb-7 text-xl font-bold text-white">備份一篇 Facebook 文章</h2>
          <ol className="space-y-4">
            {[
              "登入 Facebook，進入已完成 mapping 的本人個人檔案頁。",
              "開啟 Chamber 側邊欄，確認目前 Chamber 帳號與 Facebook 帳號正確。",
              "按「在 Facebook 選取文章」，再點要備份文章的本文、圖片或文章空白處。按 Esc 可退出選取模式。",
              "在側邊欄核對文字、圖片、發文時間與「查看這篇原文」連結。若文章有「查看更多」或相簿，依提示先完成展開。",
              "按「備份這篇」。看到成功訊息後，可開啟單篇 Echo 或完整 Echo 時光牆。",
            ].map((item, index) => (
              <li key={item} className="flex gap-4 rounded-2xl border border-slate-900 bg-slate-900/25 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{index + 1}</span>
                <p className="pt-0.5 text-sm leading-6 text-slate-300">{item}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14 border-t border-slate-900 pt-10">
          <h2 className="mb-2 text-xl font-bold text-white">建立 Web3 轉世聲明</h2>
          <p className="text-sm leading-7 text-slate-400">
            完成 mapping 後，從 Chamber Side Panel 首頁按「建立轉世聲明」。你可以先編輯聲明文字，再產生包含 Chamber 暱稱與 Echo QR Code 的轉世卡。Chamber 會開啟 Facebook 發文框並填入圖文，實際送出前仍由你自行確認；轉世卡不會包含私鑰、Passkey 或復原碼 C。
          </p>
        </section>

        <section className="mt-14 grid gap-6 border-t border-slate-900 pt-10 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-6">
            <h2 className="mb-3 text-base font-bold text-emerald-200">在 Echo 閱讀備份</h2>
            <p className="text-xs leading-6 text-slate-400">
              使用相符的 Chamber 身分開啟 Echo 後，時光牆會自動解鎖，不必逐篇操作。相簿可點圖片後左右瀏覽；若自動解鎖未完成，仍可按「重新解鎖」。
            </p>
          </div>
          <div className="rounded-2xl border border-rose-900/40 bg-rose-950/10 p-6">
            <h2 className="mb-3 text-base font-bold text-rose-200">務必保存緊急復原碼 C</h2>
            <p className="text-xs leading-6 text-slate-400">
              Chamber 採 2-of-3：目前 Extension 保存 A、Passkey 保護加密 Vault 中的 B、你離線保存 C。同裝置可用 A+C；移除 Extension 後，通過 Passkey 取得 B 再用 B+C。請把 C 放在密碼管理器、手機安全區或紙本，不要只留在目前電腦。「貼上 C」欄位位於折疊的還原工具內，只在日後遺失 Extension 或更換裝置時使用，建立時不需要填寫。
              若 C 遺失或疑似外洩，可在已完成狀態展開「產生新的 C」，通過現有 Passkey 後輪替 A、Vault B 與 C；新 C 顯示後，舊 C 不再能搭配 Vault 還原。
            </p>
          </div>
        </section>

        <section className="mt-14 border-t border-slate-900 pt-10">
          <h2 className="mb-2 text-xl font-bold text-white">不透過 Echo 也能取得備份嗎？</h2>
          <p className="text-sm leading-7 text-slate-400">
            可以。Echo 是 Chamber 官方閱讀器，不是資料本體。每次成功備份都會回傳交易 ID 與 Web3 原始資料網址；測試網可直接開啟
            <code className="mx-1 rounded bg-slate-900 px-1.5 py-1 font-mono text-indigo-300">https://devnet.irys.xyz/&lt;TX_ID&gt;</code>
            取得文章 JSON，媒體則由 JSON 中的 media 項目分別取得。
          </p>
          <div className="mt-4 rounded-xl border border-amber-900/50 bg-amber-950/15 p-4 text-xs leading-6 text-amber-100">
            原始網址看到的是加密資料，不等於任何人都能閱讀。要顯示文字與圖片，閱讀器仍須取得擁有者或獲准收件者的文章金鑰，依 Chamber 格式解開文字與媒體。現在 Echo 是完整實作這套流程的閱讀器；未來會提供公開 schema、測試向量與獨立／離線閱讀器，避免被單一網站綁住。
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-500">
            開發者所需的交易欄位、GraphQL 標籤與解密順序記錄於專案的 Data Portability 規格。
          </p>
        </section>

        <section className="mt-14 border-t border-slate-900 pt-10">
          <h2 className="mb-2 text-xl font-bold text-white">分享私密文章</h2>
          <p className="mb-6 text-sm leading-7 text-slate-400">
            新版備份使用每篇獨立文章金鑰。你可以把單篇 Echo 連結傳給其他 Chamber 使用者，對方登入後按「向作者申請閱讀」；作者在自己 Echo 頁面的「閱讀申請」通知中心核准。
          </p>
          <ol className="grid gap-3 sm:grid-cols-2">
            <li className="rounded-xl border border-slate-850 bg-slate-900/40 p-4 text-xs leading-6 text-slate-300">1. B 開啟 A 分享的單篇 Echo，連結自己的 Chamber Extension。</li>
            <li className="rounded-xl border border-slate-850 bg-slate-900/40 p-4 text-xs leading-6 text-slate-300">2. B 按「向作者申請閱讀」，Echo 顯示等待核准。</li>
            <li className="rounded-xl border border-slate-850 bg-slate-900/40 p-4 text-xs leading-6 text-slate-300">3. A 在 Echo 點「閱讀申請」，選擇「允許這一篇」或「拒絕」。</li>
            <li className="rounded-xl border border-slate-850 bg-slate-900/40 p-4 text-xs leading-6 text-slate-300">4. B 按「已獲准？重新解鎖」，Extension 只解開該篇文章。</li>
          </ol>
          <div className="mt-4 rounded-xl border border-amber-900/50 bg-amber-950/15 p-4 text-xs leading-6 text-amber-100">
            授權不會把作者的復原金鑰交給對方，但對方解密後仍可能截圖或另存。舊版文章沒有獨立文章金鑰，必須由作者重新備份成新版修訂後才能分享。
          </div>
        </section>

        <section className="mt-14 border-t border-slate-900 pt-10">
          <h2 className="mb-2 text-xl font-bold text-white">更新擴充功能</h2>
          <p className="text-sm leading-7 text-slate-400">
            下載新版 ZIP、解壓縮並以新版檔案取代原資料夾內容，再到 <code className="font-mono text-indigo-300">chrome://extensions/</code> 按 Chamber 的重新載入按鈕，最後重新整理 Facebook 與 Echo。不要為了更新而移除重裝；若不得不重裝，先確認 Passkey Vault 已設定，且 C 已保存到其他安全位置。
          </p>
        </section>

        <section className="mt-14 border-t border-slate-900 pt-10">
          <h2 className="mb-7 text-xl font-bold text-white">常見問題</h2>
          <div className="space-y-3">
            {troubleshooting.map(([title, body]) => (
              <details key={title} className="group rounded-xl border border-slate-850 bg-slate-900/40 p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-200 marker:hidden">
                  <span className="mr-2 text-indigo-400">＋</span>{title}
                </summary>
                <p className="mt-3 border-t border-slate-800 pt-3 text-xs leading-6 text-slate-400">{body}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-2xl border border-amber-900/40 bg-amber-950/10 p-6">
          <h2 className="mb-3 text-base font-bold text-amber-200">目前測試版限制</h2>
          <ul className="list-disc space-y-2 pl-5 text-xs leading-6 text-slate-400">
            <li>目前只支援 Facebook 本人文章，其他平台仍在規劃中。</li>
            <li>資料寫入 Irys Devnet，不是正式主網；測試資料與服務可用性不保證永久。</li>
            <li>影片檔案尚未備份，只保存可取得的本文、原文網址與封面。</li>
            <li>Facebook 頁面改版可能影響文章辨識；遇到錯誤時請保留畫面與文章類型資訊。</li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-indigo-950/20 py-8 text-center text-[10px] font-mono text-slate-600">
        © 2026 Chamber Protocol · <Link href="/" className="text-indigo-500 hover:text-indigo-300">返回 Echo</Link>
      </footer>
    </div>
  );
}
