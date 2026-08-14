"use client";

import React, { useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/locale-provider";

export default function Home() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const guideHref = locale === "en" ? "/en/guide" : "/guide";
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
    setStatusMessage(t("home.connectSuccess"));
    setIsModalOpen(false);
    setTimeout(() => {
      router.push(`/${address}/all`);
    }, 1200);
  };

  const connectSandboxWallet = () => {
    setStatusMessage(t("home.sandboxStarting"));
    const mockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    setWalletAddress(mockAddress);
    enterWithWallet(mockAddress);
  };

  const connectMetaMask = async () => {
    setIsConnecting(true);
    setStatusMessage(t("home.metamaskConnecting"));
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts[0];
        setWalletAddress(address);
        enterWithWallet(address);
      } catch (err: any) {
        console.error("MetaMask connection failed:", err);
        let errorMsg = err.message || t("home.unknownError");
        if (errorMsg.includes("Unexpected error") || (err.code && String(err.code) === "-32603")) {
          errorMsg = t("home.metamaskPending");
        } else {
          errorMsg = t("home.connectFailed", { error: errorMsg });
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
    setStatusMessage(t("home.detecting"));
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
          setStatusMessage(t("home.extensionDetected"));
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
      setStatusMessage(t("home.extensionMissing"));
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
              <p className="text-[9px] text-slate-500 font-mono">{t("home.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={guideHref}
              className="hidden sm:inline-flex text-xs font-semibold text-slate-300 hover:text-white px-3 py-2.5 rounded-full hover:bg-slate-900 transition-colors"
            >
              {t("common.guide")}
            </Link>
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-full shadow-lg shadow-indigo-600/30 transition-all duration-200"
            >
              {walletAddress ? t("home.walletConnected") : t("home.connectWallet")}
            </button>
            <LanguageSwitcher compact routeAware />
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
                {t("home.useSandbox")}
              </button>
            )}
          </div>
        )}

        {/* Hero Headline */}
        <div className="text-center max-w-2xl mb-12">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 to-indigo-200 bg-clip-text text-transparent mb-4 leading-tight">
            {t("home.hero")}
          </h2>
          <p className="text-sm md:text-base text-slate-400 leading-relaxed">
            {t("home.heroBody")}
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
              <h3 className="text-base font-bold text-slate-100 mb-2">{t("home.privateEcho")}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t("home.privateEchoBody")}
              </p>
            </div>
            <button
              onClick={connectWallet}
              className="mt-6 w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-950 hover:bg-slate-800 border border-slate-850 hover:border-indigo-500 text-indigo-300 transition-all duration-200"
            >
              {t("home.connectOpen")}
            </button>
          </div>

          {/* Card 2: Lookup */}
          <div className="p-6 bg-slate-900/40 border border-slate-900 rounded-3xl flex flex-col justify-between hover:border-slate-800 transition-all">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4 font-bold text-lg">
                🔍
              </div>
              <h3 className="text-base font-bold text-slate-100 mb-2">{t("home.followCreator")}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t("home.followCreatorBody")}
              </p>
            </div>
            <form onSubmit={handleSearchSubmit} className="mt-6 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("home.aliasPlaceholder")}
                className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 text-slate-200"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-purple-50 rounded-xl text-xs font-semibold transition-all"
              >
                {t("common.enter")}
              </button>
            </form>
          </div>

          {/* Card 3: Extension download */}
          <div className="p-6 bg-slate-900/40 border border-slate-900 rounded-3xl flex flex-col justify-between hover:border-slate-800 transition-all">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 font-bold text-lg">
                📦
              </div>
              <h3 className="text-base font-bold text-slate-100 mb-2">{t("home.download")}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t("home.downloadBody")}
              </p>
            </div>
            <a
              href="/echo/releases/chamber-extension-v0.6.0.zip"
              download="chamber-extension-v0.6.0.zip"
              className="mt-6 w-full text-center py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-emerald-50 transition-all duration-200 shadow-md shadow-emerald-900/20"
            >
              {t("home.downloadButton")}
            </a>
            <Link
              href={guideHref}
              className="mt-3 text-center text-xs font-semibold text-emerald-300 hover:text-emerald-200 hover:underline"
            >
              {t("home.readGuide")}
            </Link>
          </div>

        </div>

        {/* Protocol Visual Architecture Diagram */}
        <section className="w-full max-w-3xl p-8 bg-slate-900/20 border border-slate-900 rounded-3xl backdrop-blur-sm">
          <h3 className="text-sm font-bold text-slate-300 text-center mb-6">{t("home.flow")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            
            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">01 / Select</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">{t("home.select")}</h4>
              <p className="text-[10px] text-slate-500">{t("home.selectBody")}</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">02 / Encrypt</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">{t("home.encrypt")}</h4>
              <p className="text-[10px] text-slate-500">{t("home.encryptBody")}</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">03 / Write-Through</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">{t("home.write")}</h4>
              <p className="text-[10px] text-slate-500">{t("home.writeBody")}</p>
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
              <div className="text-indigo-400 text-xs font-bold font-mono mb-1">04 / Echo Portal</div>
              <h4 className="text-xs font-bold text-slate-200 mb-1">{t("home.echoPortal")}</h4>
              <p className="text-[10px] text-slate-500">{t("home.echoPortalBody")}</p>
            </div>

          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-indigo-950/20 text-center text-xs text-slate-650 font-mono font-sans">
        <p>© 2026 Chamber Protocol • studio.milkcat.org/echo</p>
        <Link href={guideHref} className="inline-block mt-2 text-indigo-400 hover:text-indigo-300 hover:underline">
          {t("common.guide")}
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
              🔑 {t("home.chooseWallet")}
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              {t("home.chooseWalletBody")}
            </p>

            <div className="space-y-4">
              {/* Option 1: Chamber Extension (if detected) */}
              {detectedExtWallet ? (
                <div className="p-4 bg-indigo-950/30 border border-indigo-500/40 hover:border-indigo-500 rounded-2xl transition-all">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      {t("home.extensionWallet")}
                    </span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
                      {t("home.detected")}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-300 mb-3 truncate">
                    {detectedExtWallet}
                  </p>
                  <button
                    onClick={() => enterWithWallet(detectedExtWallet)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    {t("home.useExtensionWallet")}
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl">
                  <p className="text-xs text-slate-500 text-center py-2">
                    {t("home.extensionUnlockHint")}
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
                      {t("home.browserWallet")}
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      {t("home.browserWalletBody")}
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
                      {t("home.sandboxWallet")}
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      {t("home.sandboxWalletBody")}
                    </p>
                  </div>
                </div>
                <span className="text-slate-550 group-hover:text-indigo-400 transition-colors text-xs">➔</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-800"></span></div>
              <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-slate-900 px-2 text-slate-500 font-mono">{t("home.or")}</span></div>
            </div>

            {/* Read-only Query */}
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("home.readOnlyPlaceholder")}
                className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold transition-all"
              >
                {t("common.enter")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
