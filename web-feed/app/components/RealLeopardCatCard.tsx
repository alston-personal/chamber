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
      <div className="flex justify-center mb-3">
        <div className="inline-flex items-center gap-2 bg-slate-950/90 border border-amber-500/40 px-4 py-1.5 rounded-full text-xs text-amber-200 backdrop-blur shadow-2xl whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="font-bold tracking-wider">🐾 台灣石虎 · {platform.toUpperCase()} 備份</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono text-[11px]">{formattedPublishedTime}</span>
        </div>
      </div>

      {/* 🐯 1. SITTING ALERT LEOPARD CAT (Shown when collapsed) */}
      {!isExpanded ? (
        <div
          className="relative z-30 rounded-3xl overflow-hidden border-2 border-amber-500/40 bg-slate-950/80 shadow-[0_20px_50px_rgba(0,0,0,0.8)] cursor-pointer transition-all duration-200 hover:border-amber-400 hover:shadow-[0_0_30px_rgba(245,158,11,0.25)]"
          onClick={onToggleExpand}
        >
          {/* Sitting Cat Photo */}
          <div className="relative aspect-square w-full overflow-hidden bg-slate-900">
            <img
              src="/echo/leopardcat/sitting.jpg"
              alt="Sitting Taiwan Leopard Cat"
              className="w-full h-full object-cover select-none pointer-events-none"
            />
            {/* Soft Ambient Vignette */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

            {/* Teaser Pill at Chest */}
            <div className="absolute bottom-6 inset-x-4 flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/90 border border-amber-500/50 text-amber-200 text-xs font-semibold backdrop-blur shadow-lg">
                <span>📜</span>
                <span className="truncate max-w-[260px]">
                  {post.payload.is_encrypted ? "🔒 私密回聲（點擊翻肚肚解鎖）" : (post.payload.content?.slice(0, 32) || "點擊石虎翻肚看全文")}
                </span>
              </div>

              {/* Bottom Tactile Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/30 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
              >
                <span>🐾</span>
                <span>喵！摸摸我翻肚肚看全文 ▼</span>
                <span>🐾</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 🐯 2. BELLY-UP FLIPPED LEOPARD CAT (Shown when expanded) */
        <div className="relative z-30 rounded-3xl overflow-hidden border-2 border-amber-500/50 bg-slate-950 shadow-[0_25px_60px_rgba(245,158,11,0.2)] transition-all duration-500 animate-in fade-in zoom-in-95">
          {/* Top Banner: Happy Belly-up Leopard Cat Header */}
          <div className="relative aspect-video sm:aspect-[16/10] w-full overflow-hidden bg-slate-900">
            <img
              src="/echo/leopardcat/belly_up.jpg"
              alt="Belly-up Taiwan Leopard Cat"
              className="w-full h-full object-cover select-none pointer-events-none"
            />
            {/* Gradient blending into the fluffy belly content container */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-90" />

            {/* Happy Purring Badge */}
            <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-bold backdrop-blur">
              <span className="animate-pulse">💖</span>
              <span>呼嚕嚕~ 翻肚信任中</span>
            </div>
          </div>

          {/* 📜 3. THE FLUFFY BELLY ARTICLE CONTENT CONTAINER */}
          <div className="px-6 sm:px-8 py-6 space-y-5 -mt-6 relative z-10">
            <div className="relative p-6 rounded-2xl bg-slate-900/95 border border-amber-500/30 shadow-2xl backdrop-blur">
              {/* Header status bar */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/50">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span>🐾</span> <span>石虎肚皮上的密室回聲</span>
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
                    <div className="text-sm font-bold text-slate-200">私密文章（由石虎肚皮守護）</div>
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

              {/* Photo Gallery inside the belly */}
              {mediaUrls.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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

            {/* Bottom Collapse Button */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={onToggleExpand}
                className="px-8 py-3 rounded-full bg-slate-900 hover:bg-slate-800 border border-amber-500/50 text-amber-200 font-bold text-xs shadow-xl flex items-center gap-2 cursor-pointer transform active:scale-95 transition-all"
              >
                <span>🐾</span>
                <span>喵！翻回來坐好收合 ▲</span>
                <span>🐾</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
