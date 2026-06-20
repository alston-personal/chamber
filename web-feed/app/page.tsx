"use client";

import React, { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Web3 Wallet Connect Function
  const [showFallbackBtn, setShowFallbackBtn] = useState<boolean>(false);

  const connectSandboxWallet = () => {
    setStatusMessage("啟動安全模擬錢包...");
    const mockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    setWalletAddress(mockAddress);
    setStatusMessage("安全模擬錢包已啟動！正在跳轉至個人動態牆...");
    setTimeout(() => {
      router.push(`/${mockAddress}/all`);
    }, 1500);
  };

  const connectWallet = async () => {
    setIsConnecting(true);
    setShowFallbackBtn(false);
    setStatusMessage("正在連結 MetaMask...");
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts[0];
        setWalletAddress(address);
        setStatusMessage("錢包連結成功！正在跳轉至您的個人動態牆...");
        setTimeout(() => {
          router.push(`/${address}/all`);
        }, 1500);
      } catch (err: any) {
        console.error("MetaMask connection failed:", err);
        let errorMsg = err.message || "未知錯誤";
        if (errorMsg.includes("Unexpected error") || (err.code && String(err.code) === "-32603")) {
          errorMsg = "MetaMask 傳回未預期錯誤 (-32603)。通常是由於 MetaMask 中有尚未關閉的懸置連線請求，或 MetaMask 尚未輸入密碼解鎖。請打開 MetaMask 插件手動確認，或點選下方按鈕使用測試模擬錢包進入。";
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
    }
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
          <div>
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
            MetaShield Chamber 是一套為您在社交平台（Facebook/Threads）提供數據自主權的安全防護工具。
            在本地端安全打包您的貼文與媒體資源，並備份至去中心化永久儲存網絡（IPFS / Arweave），
            確保您的社交記憶與創作主權永不熄滅。
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
              <h3 className="text-base font-bold text-slate-100 mb-2">Web3 錢包登入</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                使用錢包登入以存取您的去中心化動態牆，並對已進行 AES 加密防護的私密貼文進行本地簽名解密。
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
                安裝 Chamber Chrome 擴充功能，在您點擊臉書發佈時自動防護，將媒體連結與文章完整上鏈。
              </p>
            </div>
            <a
              href="/chamber-extension.zip"
              download="chamber-extension.zip"
              className="mt-6 w-full text-center py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-emerald-50 transition-all duration-200 shadow-md shadow-emerald-900/20"
            >
              📥 下載 Extension (.zip)
            </a>
          </div>

        </div>

        {/* Protocol Visual Architecture Diagram */}
        <section className="w-full max-w-3xl p-8 bg-slate-900/20 border border-slate-900 rounded-3xl backdrop-blur-sm">
          <h3 className="text-sm font-bold text-slate-300 text-center mb-6">Chamber 去中心化社交架構流程</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            
            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">01 / Intercept</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">瀏覽器攔截</h4>
              <p className="text-[10px] text-slate-500">擴充功能在 Web2 平台發文時自動進行 DOM/API 攔截。</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">02 / Unified Package</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">多媒體封裝</h4>
              <p className="text-[10px] text-slate-500">將文字、備份圖床連結及影音檔案綁定為單一 IPFS JSON 結構。</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">03 / Write-Through</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">API 寫入上鏈</h4>
              <p className="text-[10px] text-slate-500">透過 Chamber API 寫入，經 Irys 永久儲存至 Arweave 區塊鏈。</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">04 / Echo Portal</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">去中心化動態牆</h4>
              <p className="text-[10px] text-slate-500">Echo 官網直接自區塊鏈讀取內容，並以 Web3 錢包登入動態牆。</p>
            </div>

          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-indigo-950/20 text-center text-xs text-slate-650 font-mono">
        <p>© 2026 Chamber Protocol • studio.milkcat.org/echo</p>
      </footer>
    </div>
  );
}
