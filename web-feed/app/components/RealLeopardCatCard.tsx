"use client";

import React, { useState } from "react";

interface RealLeopardCatCardProps {
  post: any;
  isPostOwner: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDecrypt: () => void;
  onRequestAccess: () => void;
  isDecrypting?: boolean;
  accessBusy?: boolean;
  irysHost: string;
  ft: any;
  locale: string;
  onOpenAlbum: (urls: string[], index: number, title: string) => void;
}

export default function RealLeopardCatCard({
  post,
  isPostOwner,
  isExpanded,
  onToggleExpand,
  onDecrypt,
  onRequestAccess,
  isDecrypting,
  accessBusy,
  irysHost,
  ft,
  locale,
  onOpenAlbum,
}: RealLeopardCatCardProps) {
  const originalTime = post.payload.published_at || post.payload.timestamp;
  const formattedPublishedTime = originalTime
    ? new Date(originalTime * 1000).toLocaleString(locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const storedMediaUrls = Array.isArray(post.payload.media?.urls) && post.payload.media.urls.length > 0
    ? post.payload.media.urls.filter(Boolean)
    : [post.payload.media?.primary_fb_cdn, post.payload.media?.fallback_backup].filter(Boolean) as string[];
  const mediaUrls = post.payload.is_encrypted ? (post.decryptedMedia || []) : storedMediaUrls;
  const platform = post.payload.platform || "threads";

  return (
    <div className="real-leopard-card relative max-w-lg mx-auto my-12 select-none group">
      {/* 🏷️ Top Platform Tag Header */}
      <div className="flex justify-center mb-2">
        <div className="inline-flex items-center gap-2 bg-slate-950/90 border border-amber-500/40 px-4 py-1 rounded-full text-[11px] text-amber-200 backdrop-blur shadow-2xl whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="font-bold uppercase tracking-wider">🐾 台灣石虎 · {platform} 備份</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono text-[10px]">{formattedPublishedTime}</span>
        </div>
      </div>

      {/* 🐯 1. UPPER LEOPARD CAT HEAD (Hyper-Realistic Photo Layer) */}
      <div
        className="relative z-30 drop-shadow-[0_15px_35px_rgba(0,0,0,0.8)] cursor-pointer"
        onClick={() => !isExpanded && onToggleExpand()}
      >
        <img
          src="/leopardcat/upper_head.png"
          alt="Taiwan Leopard Cat Head"
          className="w-full h-auto block select-none pointer-events-none rounded-t-3xl"
          style={{
            filter: "drop-shadow(0 4px 15px rgba(251, 191, 36, 0.15))",
          }}
        />
      </div>

      {/* 📜 2. THE ORGANIC MOUTH CAVITY (Opens & Closes) */}
      <div
        className={`relative z-20 mx-4 sm:mx-6 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden ${
          isExpanded
            ? "max-h-[3000px] opacity-100 py-6 my-2 border-l-[3px] border-r-[3px] border-b-[3px] border-amber-500/50"
            : "max-h-0 opacity-0 py-0 my-0 border-none"
        }`}
        style={{
          background: "radial-gradient(ellipse at center, #2e1005 0%, #150802 60%, #050201 100%)",
          borderRadius: "0 0 45px 45px",
          boxShadow: isExpanded
            ? "inset 0 20px 40px rgba(0,0,0,0.9), 0 0 30px rgba(245, 158, 11, 0.18)"
            : "none",
        }}
      >
        {/* Soft Amber Throat Arc */}
        <div className="absolute top-0 inset-x-8 h-8 bg-gradient-to-b from-amber-500/20 to-transparent pointer-events-none rounded-b-full" />

        {/* EXPANDED STATE: The Full Unfolded Scroll on the Tongue */}
        {isExpanded && (
          <div className="px-6 sm:px-8 space-y-4">
            {/* The Ancient Scroll Background for text */}
            <div className="relative p-5 rounded-2xl bg-slate-900/95 border border-amber-900/40 shadow-2xl backdrop-blur">
              {/* Top status bar in the scroll */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/50">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span>📜</span> <span>石虎守護 · 密室回聲卷軸</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-500/30">
                  {post.payload.is_encrypted ? "ENCRYPTED" : "PUBLIC"}
                </span>
              </div>

              {/* Decrypted or Plain Content */}
              {post.payload.is_encrypted ? (
                post.decryptedContent ? (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50">
                    <div className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1">
                      <span>🔓</span> <span>已解密內容：</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-slate-100 text-sm sm:text-[15px] leading-relaxed">
                      {post.decryptedContent}
                    </div>
                  </div>
                ) : (
                  <div className="py-6 px-4 rounded-xl bg-slate-950/80 border border-slate-800 text-center flex flex-col items-center gap-3">
                    <div className="text-3xl animate-bounce">🔒</div>
                    <div className="text-sm font-bold text-slate-200">私密文章（由石虎守護）</div>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {isPostOwner ? "使用您的 Chamber 身分即可一鍵解鎖" : "需獲得作者核准授權方可閱讀"}
                    </p>
                    {isPostOwner ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDecrypt(); }}
                        disabled={isDecrypting}
                        className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                      >
                        {isDecrypting ? "🔑 正在解密中..." : "🔓 點擊解密閱讀"}
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); onDecrypt(); }}
                          disabled={isDecrypting}
                          className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                        >
                          {isDecrypting ? "🔑 正在驗證授權..." : "🔓 點擊解密閱讀 (若已獲准)"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onRequestAccess(); }}
                          disabled={accessBusy}
                          className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                        >
                          {accessBusy ? "送出中..." : "向作者申請閱讀 →"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="whitespace-pre-wrap break-words text-slate-100 text-sm sm:text-[15px] leading-relaxed tracking-wide">
                  {post.payload.content}
                </div>
              )}

              {/* Photo Gallery inside the mouth */}
              {mediaUrls.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-700/50">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {mediaUrls.map((url: string, i: number) => (
                      <div
                        key={i}
                        onClick={(e) => { e.stopPropagation(); onOpenAlbum(mediaUrls, i, "石虎珍藏相簿"); }}
                        className="relative aspect-square rounded-xl overflow-hidden border border-slate-700/60 shadow group/img cursor-zoom-in"
                      >
                        <img
                          src={url}
                          alt="Gallery"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pink Cat Tongue resting at the bottom of the mouth */}
            <div className="flex justify-center">
              <div className="w-36 h-6 rounded-b-full bg-gradient-to-b from-rose-400 to-rose-600 shadow-md flex items-center justify-center text-[10px] text-rose-950 font-black">
                👅 石虎之舌 · 承載回憶
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 🐯 3. LOWER LEOPARD CAT JAW (Hyper-Realistic Photo Layer) */}
      <div
        className={`relative z-30 drop-shadow-[0_15px_35px_rgba(0,0,0,0.8)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isExpanded ? "mt-0" : "-mt-6 sm:-mt-8"
        }`}
      >
        <img
          src="/leopardcat/lower_jaw.png"
          alt="Taiwan Leopard Cat Jaw"
          className="w-full h-auto block select-none pointer-events-none rounded-b-3xl"
          style={{
            filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.9))",
          }}
        />

        {/* 🐾 Tactile Mouth Toggle Button below Chin */}
        <div className="flex justify-center -mt-4 pb-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="px-7 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-2xl shadow-amber-500/30 flex items-center gap-2 cursor-pointer transform active:scale-95 transition-all"
          >
            <span>🐾</span>
            <span>{isExpanded ? "🐯 咬合收嘴 ▲" : "🐯 石虎大口張開看全文 ▼"}</span>
            <span>🐾</span>
          </button>
        </div>
      </div>
    </div>
  );
}
