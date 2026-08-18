"use client";

import React, { useState } from "react";

interface CatMorphingCardProps {
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

export default function CatMorphingCard({
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
}: CatMorphingCardProps) {
  const [isWinking, setIsWinking] = useState(false);

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
  const contentText = post.payload.is_encrypted ? (post.decryptedContent || "") : (post.payload.content || "");
  const hasLongText = (contentText || "").length > 140 || ((contentText || "").split("\n").length > 3);
  const isCollapsible = hasLongText || mediaUrls.length > 0;

  const platform = post.payload.platform || "threads";

  return (
    <div
      className="cat-morphing-wrapper relative group my-8 transition-all duration-500 max-w-2xl mx-auto"
      onMouseEnter={() => setIsWinking(true)}
      onMouseLeave={() => setIsWinking(false)}
    >
      {/* 1. UPPER CAT HEAD (SVG) */}
      <div className="relative z-20 select-none drop-shadow-2xl">
        <svg
          viewBox="0 0 600 135"
          className="w-full h-auto block overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="catHeadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="catEarInner" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#db2777" stopOpacity="0.5" />
            </linearGradient>
            <radialGradient id="catEyeGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="70%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#082f49" />
            </radialGradient>
            <filter id="eyeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Left Cat Ear */}
          <path
            d="M 65 95 L 30 15 Q 40 5 95 35 Z"
            fill="#1e1b4b"
            stroke="#38bdf8"
            strokeWidth="3"
            className="transition-transform duration-300 origin-[65px_95px] group-hover:-rotate-6"
          />
          <path d="M 60 85 L 40 28 Q 48 22 85 45 Z" fill="url(#catEarInner)" />

          {/* Right Cat Ear */}
          <path
            d="M 535 95 L 570 15 Q 560 5 505 35 Z"
            fill="#1e1b4b"
            stroke="#38bdf8"
            strokeWidth="3"
            className="transition-transform duration-300 origin-[535px_95px] group-hover:rotate-6"
          />
          <path d="M 540 85 L 560 28 Q 552 22 515 45 Z" fill="url(#catEarInner)" />

          {/* Cat Forehead & Upper Cranium */}
          <path
            d="M 60 95 Q 300 45 540 95 L 540 135 L 60 135 Z"
            fill="url(#catHeadGrad)"
            stroke="#38bdf8"
            strokeWidth="3"
          />

          {/* Leopard Cat Forehead Tiger Stripes */}
          <path d="M 275 62 L 300 82 L 325 62" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
          <path d="M 285 75 L 300 90 L 315 75" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

          {/* Left Cat Eye */}
          <g className="cursor-pointer" onClick={() => setIsWinking(!isWinking)}>
            <ellipse cx="190" cy="100" rx="22" ry="15" fill="#030712" stroke="#38bdf8" strokeWidth="2" />
            <ellipse
              cx="190"
              cy="100"
              rx={isWinking ? "20" : "14"}
              ry={isWinking ? "2" : "13"}
              fill="url(#catEyeGrad)"
              filter="url(#eyeGlow)"
              className="transition-all duration-200"
            />
            {!isWinking && (
              <>
                <ellipse cx="190" cy="100" rx="4" ry="11" fill="#020617" />
                <circle cx="186" cy="95" r="3.5" fill="#ffffff" />
              </>
            )}
          </g>

          {/* Right Cat Eye */}
          <g className="cursor-pointer">
            <ellipse cx="410" cy="100" rx="22" ry="15" fill="#030712" stroke="#38bdf8" strokeWidth="2" />
            <ellipse
              cx="410"
              cy="100"
              rx="14"
              ry="13"
              fill="url(#catEyeGrad)"
              filter="url(#eyeGlow)"
            />
            <ellipse cx="410" cy="100" rx="4" ry="11" fill="#020617" />
            <circle cx="406" cy="95" r="3.5" fill="#ffffff" />
          </g>

          {/* Nose */}
          <polygon points="293,116 307,116 300,125" fill="#f472b6" />

          {/* Whiskers (Left & Right) */}
          <path d="M 230 115 L 120 105" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 225 122 L 110 122" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 230 129 L 125 138" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />

          <path d="M 370 115 L 480 105" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 375 122 L 490 122" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 370 129 L 475 138" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />

          {/* Upper Cute Little Fangs */}
          <polygon points="278,135 284,135 281,142" fill="#ffffff" />
          <polygon points="316,135 322,135 319,142" fill="#ffffff" />
        </svg>

        {/* Platform Badge overlay on cat head */}
        <div className="absolute top-9 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 border border-sky-500/40 px-3 py-1 rounded-full text-[11px] text-sky-200 backdrop-blur shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>來自 {platform}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-400">{formattedPublishedTime}</span>
        </div>
      </div>

      {/* 2. THE EXPANDABLE MOUTH CAVITY (Where article lives) */}
      <div
        className={`relative z-10 -mt-1 bg-gradient-to-b from-[#0f172a] via-[#111827] to-[#0b0f19] border-x-[3px] border-sky-500/80 px-6 sm:px-9 py-6 transition-all duration-500 overflow-hidden shadow-[inset_0_20px_30px_rgba(0,0,0,0.8)] ${
          !isExpanded && isCollapsible ? "max-h-[220px]" : "max-h-[4000px]"
        }`}
      >
        {/* Soft Pink Throat / Scroll Inner Glow */}
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-rose-500/10 to-transparent pointer-events-none" />

        {/* Content Render */}
        <div className="relative z-10">
          {post.payload.is_encrypted ? (
            post.decryptedContent ? (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50 shadow-inner">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-emerald-500/30 text-xs text-emerald-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>🔓</span> <span>喵！私密卷軸已解密</span>
                  </span>
                  <span className="bg-emerald-600 text-white text-[9px] px-2 py-0.5 rounded font-mono">
                    VERIFIED
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words text-slate-100 text-sm leading-relaxed">
                  {post.decryptedContent}
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-700/60 text-center flex flex-col items-center gap-3">
                <div className="text-3xl animate-bounce">🔒</div>
                <div className="text-sm font-bold text-slate-200">私密加密文章 (貓咪守護中)</div>
                <p className="text-xs text-slate-400 max-w-sm">
                  {isPostOwner ? "正在使用您的 Chamber 身分準備解密" : "此文章已上鎖，需由作者核准身分後方可閱讀"}
                </p>
                {isPostOwner ? (
                  <button
                    onClick={onDecrypt}
                    disabled={isDecrypting}
                    className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 transition-all cursor-pointer"
                  >
                    {isDecrypting ? "🔑 正在解密中..." : "🔓 點擊自動解密"}
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={onDecrypt}
                      disabled={isDecrypting}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                    >
                      {isDecrypting ? "🔑 正在驗證授權..." : "🔓 點擊解密閱讀 (若已獲作者核准)"}
                    </button>
                    <button
                      onClick={onRequestAccess}
                      disabled={accessBusy}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-slate-600 cursor-pointer"
                    >
                      {accessBusy ? "送出申請中..." : "尚未申請？點此向作者申請閱讀 →"}
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="whitespace-pre-wrap break-words text-slate-100 text-sm sm:text-base leading-relaxed tracking-wide">
              {post.payload.content}
            </div>
          )}

          {/* Photo Gallery inside the mouth */}
          {mediaUrls.length > 0 && (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {mediaUrls.slice(0, isExpanded ? 99 : 3).map((url: string, i: number) => (
                  <div
                    key={i}
                    onClick={() => onOpenAlbum(mediaUrls, i, "貓咪時光相簿")}
                    className="relative aspect-square rounded-xl overflow-hidden border border-slate-700/60 shadow group/img cursor-zoom-in"
                  >
                    <img
                      src={url}
                      alt="Cat gallery"
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gradient shadow for collapsed mouth slit */}
        {!isExpanded && isCollapsible && (
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/80 to-transparent pointer-events-none flex items-end justify-center pb-2" />
        )}
      </div>

      {/* 3. LOWER JAW & CHIN (SVG with Collar Bell) */}
      <div className="relative z-20 -mt-1 select-none drop-shadow-2xl">
        <svg
          viewBox="0 0 600 85"
          className="w-full h-auto block overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Lower Jaw & Chin Container */}
          <path
            d="M 60 0 L 540 0 L 540 25 Q 300 85 60 25 Z"
            fill="url(#catHeadGrad)"
            stroke="#38bdf8"
            strokeWidth="3"
          />

          {/* Lower Fangs */}
          <polygon points="288,0 294,0 291,-6" fill="#ffffff" />
          <polygon points="306,0 312,0 309,-6" fill="#ffffff" />

          {/* Pink Tongue Peak in center */}
          <path d="M 290 8 Q 300 24 310 8 Z" fill="#f472b6" />

          {/* Collar Band */}
          <path d="M 180 32 Q 300 62 420 32" fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />

          {/* Golden Collar Bell (TX Link) */}
          <g
            className="cursor-pointer hover:scale-110 transition-transform origin-[300px_48px]"
            onClick={() => window.open(`${irysHost}/${post.txId}`, "_blank")}
          >
            <circle cx="300" cy="48" r="14" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
            <circle cx="300" cy="50" r="3" fill="#78350f" />
            <line x1="300" y1="53" x2="300" y2="60" stroke="#78350f" strokeWidth="1.5" />
          </g>
        </svg>

        {/* Interactive Mouth Open/Close Controller Button */}
        {isCollapsible && (
          <div className="flex justify-center -mt-4 pb-2">
            <button
              type="button"
              onClick={onToggleExpand}
              className="px-6 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-xl shadow-orange-500/30 flex items-center gap-2 cursor-pointer transform active:scale-95 transition-all"
            >
              <span>🐾</span>
              <span>{isExpanded ? "喵！咬合收緊 ▲" : "喵！大口張開看全文 ▼"}</span>
              <span>🐾</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
