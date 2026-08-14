"use client";

import React, { useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Web3 Wallet Connect Function
  const [showFallbackBtn, setShowFallbackBtn] = useState<boolean>(false);
  const [detectedExtWallet, setDetectedExtWallet] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const enterWithWallet = (address: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("chamber_logged_in_wallet", address);
    }
    setStatusMessage("連結成功！正在跳轉至您的個人動態牆...");
    setIsModalOpen(false);
    setTimeout(() => {
      router.push(`/${address}/all`);
    }, 1200);
  };

  const connectSandboxWallet = () => {
    setStatusMessage("啟動安全模擬錢包...");
    const mockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    setWalletAddress(mockAddress);
    enterWithWallet(mockAddress);
  };

  const connectMetaMask = async () => {
    setIsConnecting(true);
    setStatusMessage("正在連結 MetaMask...");
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts[0];
        setWalletAddress(address);
        enterWithWallet(address);
      } catch (err: any) {
        console.error("MetaMask connection failed:", err);
        let errorMsg = err.message || "未知錯誤";
        if (errorMsg.includes("Unexpected error") || (err.code && String(err.code) === "-32603")) {
          errorMsg = "MetaMask 傳回未預期錯誤 (-32603)。通常是由於 MetaMask 中有尚未關閉的懸置連線請求。請打開 MetaMask 插件手動確認，或點選下方按鈕使用測試模擬錢包進入。";
        } else {
          errorMsg = "連結失敗: " + errorMsg;
        }
        setStatusMessage(errorMsg);
        setShowFallbackBtn(true);
      } finally {
        setIsConnecting(false);
      }
    } else {
      connectSandboxWallet();
      setIsConnecting(false);
    }
  };

  const connectWallet = async () => {
    setIsConnecting(true);
    setShowFallbackBtn(false);
    setStatusMessage("正在偵測 Chamber 擴充功能與錢包...");
    setDetectedExtWallet("");

    let extensionActive = false;

    // Set up a listener for the Chamber Extension response
    const handleExtensionWallet = (event: MessageEvent) => {
      if (event.data && event.data.source === "chamber-extension" && event.data.type === "EXTENSION_WALLET_RESPONSE") {
        const extWallet = event.data.walletAddress;
        if (extWallet) {
          extensionActive = true;
          window.removeEventListener("message", handleExtensionWallet);
          clearTimeout(extensionTimeout);
          setDetectedExtWallet(extWallet);
          setIsModalOpen(true);
          setStatusMessage("已偵測到 Chamber 擴充功能錢包！請在彈窗中選擇連結方式。");
          setIsConnecting(false);
        }
      }
    };
    
    window.addEventListener("message", handleExtensionWallet);
    
    // Broadcast the query to the extension content script with location origin restriction
    window.postMessage({ source: "echo-portal", type: "GET_EXTENSION_WALLET" }, window.location.origin);

    // Fallback to standard MetaMask after 400ms if no extension responds
    const extensionTimeout = setTimeout(async () => {
      window.removeEventListener("message", handleExtensionWallet);
      if (extensionActive) return;

      // No extension detected, open modal to let user connect MetaMask or read-only mode
      setIsModalOpen(true);
      setStatusMessage("未偵測到 Chamber 擴充功能外掛，請選擇其它連結方式。");
      setIsConnecting(false);
    }, 400);
  };

  // Search/Lookup redirect
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    router.push(`/${encodeURIComponent(query)}/all`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-indigo-950/40 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-indigo-200 to-purple-300 bg-clip-text text-transparent">
                Chamber Protocol
              </h1>
              <p className="text-[9px] text-slate-500 font-mono">去中心化社交迴響室</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/guide"
              className="hidden sm:inline-flex text-xs font-semibold text-slate-300 hover:text-white px-3 py-2.5 rounded-full hover:bg-slate-900 transition-colors"
            >
              安裝與使用指南
            </Link>
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-full shadow-lg shadow-indigo-600/30 transition-all duration-200"
            >
              {walletAddress ? "已連結錢包" : "連結錢包登入"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16 flex flex-col items-center justify-center relative z-10">
        
        {/* Status Messages */}
        {statusMessage && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-xs text-indigo-300 max-w-xl text-center">
            <p className="leading-relaxed">{statusMessage}</p>
            {showFallbackBtn && (
              <button
                onClick={connectSandboxWallet}
                className="mt-3 inline-block text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-all duration-200"
              >
                ⚡ 使用測試模擬錢包直接進入
              </button>
            )}
          </div>
        )}

        {/* Hero Headline */}
        <div className="text-center max-w-2xl mb-12">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 to-indigo-200 bg-clip-text text-transparent mb-4 leading-tight">
            您的社交數據，由您永久掌控
          </h2>
          <p className="text-sm md:text-base text-slate-400 leading-relaxed">
            Chamber 目前提供 Facebook 本人文章的加密備份測試。
            文字與支援的圖片會先在瀏覽器本機加密，再寫入 Irys Devnet；
            擁有者登入後會自動解鎖，也能在 Echo 核准其他 Chamber 使用者閱讀指定單篇，不必交出復原金鑰。
          </p>
        </div>

        {/* Action Panel Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mb-16">
          
          {/* Card 1: Wallet Connection */}
          <div className="p-6 bg-slate-900/40 border border-slate-900 rounded-3xl flex flex-col justify-between hover:border-slate-800 transition-all">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4 font-bold text-lg">
                🔑
              </div>
              <h3 className="text-base font-bold text-slate-100 mb-2">開啟私密 Echo</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Chamber 擴充功能在本機完成身分驗證與 AES 解密；擁有者與獲准讀者登入後由 Echo 自動解鎖。
              </p>
            </div>
            <button
              onClick={connectWallet}
              className="mt-6 w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-950 hover:bg-slate-800 border border-slate-850 hover:border-indigo-500 text-indigo-300 transition-all duration-200"
            >
              連結並開啟
            </button>
          </div>

          {/* Card 2: Lookup */}
          <div className="p-6 bg-slate-900/40 border border-slate-900 rounded-3xl flex flex-col justify-between hover:border-slate-800 transition-all">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4 font-bold text-lg">
                🔍
              </div>
              <h3 className="text-base font-bold text-slate-100 mb-2">追蹤創作者</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                輸入創作者註冊的 Web3 暱稱或其錢包地址，直接讀取其永久備份在去中心化網路上的文章動態。
              </p>
            </div>
            <form onSubmit={handleSearchSubmit} className="mt-6 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="暱稱 (例如: sunlake)"
                className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 text-slate-200"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-purple-50 rounded-xl text-xs font-semibold transition-all"
              >
                進入
              </button>
            </form>
          </div>

          {/* Card 3: Extension download */}
          <div className="p-6 bg-slate-900/40 border border-slate-900 rounded-3xl flex flex-col justify-between hover:border-slate-800 transition-all">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 font-bold text-lg">
                📦
              </div>
              <h3 className="text-base font-bold text-slate-100 mb-2">下載瀏覽器擴充功能</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                安裝後從側欄明確選取自己的 Facebook 文章，再備份文字、支援的圖片與原文連結。
              </p>
            </div>
            <a
              href="/echo/releases/chamber-extension-v0.5.8.zip"
              download="chamber-extension-v0.5.8.zip"
              className="mt-6 w-full text-center py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-emerald-50 transition-all duration-200 shadow-md shadow-emerald-900/20"
            >
              📥 下載 Extension 0.5.8（封測版）
            </a>
            <Link
              href="/guide"
              className="mt-3 text-center text-xs font-semibold text-emerald-300 hover:text-emerald-200 hover:underline"
            >
              先看安裝與使用指南 →
            </Link>
          </div>

        </div>

        {/* Protocol Visual Architecture Diagram */}
        <section className="w-full max-w-3xl p-8 bg-slate-900/20 border border-slate-900 rounded-3xl backdrop-blur-sm">
          <h3 className="text-sm font-bold text-slate-300 text-center mb-6">Chamber 去中心化社交架構流程</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            
            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">01 / Select</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">明確選取文章</h4>
              <p className="text-[10px] text-slate-500">使用者在 Facebook 頁面選取一篇自己的文章，避免備份錯篇。</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">02 / Encrypt</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">本機加密</h4>
              <p className="text-[10px] text-slate-500">文字與圖片在擴充功能內以 AES-GCM 加密，金鑰留在使用者端。</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">03 / Write-Through</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">API 寫入上鏈</h4>
              <p className="text-[10px] text-slate-500">目前測試版透過 Chamber API 寫入 Irys Devnet，主網尚未啟用。</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">04 / Echo Portal</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">去中心化動態牆</h4>
              <p className="text-[10px] text-slate-500">Echo 自動向 Chamber 擴充功能請求本機解密，並集中處理單篇閱讀申請。</p>
            </div>

          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-indigo-950/20 text-center text-xs text-slate-650 font-mono font-sans">
        <p>© 2026 Chamber Protocol • studio.milkcat.org/echo</p>
        <Link href="/guide" className="inline-block mt-2 text-indigo-400 hover:text-indigo-300 hover:underline">
          安裝與使用指南
        </Link>
      </footer>

      {/* Wallet Connection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors text-lg font-bold"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-100 mb-2 flex items-center gap-2">
              🔑 選擇連結錢包
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              選擇登入時光軸的 Web3 錢包，以讀取去中心化文章並解密私密備份。
            </p>

            <div className="space-y-4">
              {/* Option 1: Chamber Extension (if detected) */}
              {detectedExtWallet ? (
                <div className="p-4 bg-indigo-950/30 border border-indigo-500/40 hover:border-indigo-500 rounded-2xl transition-all">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Chamber 擴充功能錢包
                    </span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
                      已偵測到
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-300 mb-3 truncate">
                    {detectedExtWallet}
                  </p>
                  <button
                    onClick={() => enterWithWallet(detectedExtWallet)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    使用此外掛錢包進入
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl">
                  <p className="text-xs text-slate-500 text-center py-2">
                    未偵測到 Chamber 擴充功能外掛 (若您已安裝請解鎖)
                  </p>
                </div>
              )}

              {/* Option 2: MetaMask / Browser Wallet */}
              <button
                onClick={connectMetaMask}
                className="w-full p-4 bg-slate-950 hover:bg-slate-950/80 border border-slate-850 hover:border-indigo-500/50 rounded-2xl flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="text-lg">🦊</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">
                      MetaMask / 瀏覽器錢包
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      調用瀏覽器擴充錢包以進行多帳號切換與連結
                    </p>
                  </div>
                </div>
                <span className="text-slate-550 group-hover:text-indigo-400 transition-colors text-xs">➔</span>
              </button>

              {/* Option 3: Sandbox/Mock Wallet */}
              <button
                onClick={connectSandboxWallet}
                className="w-full p-4 bg-slate-950 hover:bg-slate-950/80 border border-slate-850 hover:border-indigo-500/50 rounded-2xl flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="text-lg">⚡</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">
                      模擬安全錢包 (Sandbox)
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      免安裝錢包，使用沙盒模擬帳戶直接登入體驗
                    </p>
                  </div>
                </div>
                <span className="text-slate-550 group-hover:text-indigo-400 transition-colors text-xs">➔</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-800"></span></div>
              <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-slate-900 px-2 text-slate-500 font-mono">或</span></div>
            </div>

            {/* Read-only Query */}
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="輸入創作者別名或錢包地址 (唯讀模式)"
                className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold transition-all"
              >
                進入
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
