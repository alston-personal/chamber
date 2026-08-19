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
  const platform = post.payload.platform || "threads";

  return (
    <div
      className="cat-character-card relative max-w-xl mx-auto my-10 select-none group"
      onMouseEnter={() => setIsWinking(true)}
      onMouseLeave={() => setIsWinking(false)}
    >
      {/* 🐾 1. UPPER CAT HEAD & SNOUT (SVG) */}
      <div className="relative z-30 drop-shadow-2xl">
        <svg
          viewBox="0 0 500 160"
          className="w-full h-auto block overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="catSkinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="60%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#090d16" />
            </linearGradient>
            <linearGradient id="catEarPink" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" />
              <stop offset="100%" stopColor="#be185d" />
            </linearGradient>
            <radialGradient id="catEyeColor" cx="45%" cy="45%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="60%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#030712" />
            </radialGradient>
            <filter id="glowFeline" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Left Ear */}
          <g className="transition-transform duration-300 origin-[50px_90px] group-hover:-rotate-8">
            <polygon points="50,90 20,10 90,40" fill="#1e1b4b" stroke="#38bdf8" strokeWidth="3" strokeLinejoin="round" />
            <polygon points="46,80 30,22 80,46" fill="url(#catEarPink)" />
          </g>

          {/* Right Ear */}
          <g className="transition-transform duration-300 origin-[450px_90px] group-hover:rotate-8">
            <polygon points="450,90 480,10 410,40" fill="#1e1b4b" stroke="#38bdf8" strokeWidth="3" strokeLinejoin="round" />
            <polygon points="454,80 470,22 420,46" fill="url(#catEarPink)" />
          </g>

          {/* Head & Cheek Outline */}
          <path
            d="M 50 90 Q 250 20 450 90 Q 470 120 440 150 Q 250 155 60 150 Q 30 120 50 90 Z"
            fill="url(#catSkinGrad)"
            stroke="#38bdf8"
            strokeWidth="3"
          />

          {/* Leopard Stripes on Forehead */}
          <path d="M 230 50 L 250 70 L 270 50" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
          <path d="M 238 65 L 250 78 L 262 65" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

          {/* Left Eye */}
          <g className="cursor-pointer" onClick={() => setIsWinking(!isWinking)}>
            <ellipse cx="160" cy="95" rx="22" ry="16" fill="#030712" stroke="#38bdf8" strokeWidth="2" />
            <ellipse
              cx="160"
              cy="95"
              rx={isWinking ? "20" : "14"}
              ry={isWinking ? "2" : "13"}
              fill="url(#catEyeColor)"
              filter="url(#glowFeline)"
              className="transition-all duration-150"
            />
            {!isWinking && (
              <>
                <ellipse cx="160" cy="95" rx="4" ry="10" fill="#020617" />
                <circle cx="156" cy="90" r="3.5" fill="#ffffff" />
              </>
            )}
          </g>

          {/* Right Eye */}
          <g className="cursor-pointer">
            <ellipse cx="340" cy="95" rx="22" ry="16" fill="#030712" stroke="#38bdf8" strokeWidth="2" />
            <ellipse cx="340" cy="95" rx="14" ry="13" fill="url(#catEyeColor)" filter="url(#glowFeline)" />
            <ellipse cx="340" cy="95" rx="4" ry="10" fill="#020617" />
            <circle cx="336" cy="90" r="3.5" fill="#ffffff" />
          </g>

          {/* Cute Pink Nose */}
          <polygon points="243,118 257,118 250,126" fill="#f472b6" />

          {/* Upper Whiskers */}
          <path d="M 190 120 L 90 110" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 185 127 L 80 127" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 190 134 L 95 145" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />

          <path d="M 310 120 L 410 110" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 315 127 L 420 127" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M 310 134 L 405 145" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />

          {/* Cat Upper Muzzle Lip Line (ω Shape) */}
          <path
            d="M 210 142 Q 230 152 250 138 Q 270 152 290 142"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Upper Fangs (visible when mouth is open or closed) */}
          <polygon points="225,145 231,145 228,154" fill="#ffffff" />
          <polygon points="269,145 275,145 272,154" fill="#ffffff" />
        </svg>

        {/* Floating Platform Tag */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-950/90 border border-sky-500/50 px-3.5 py-1 rounded-full text-[11px] text-sky-200 backdrop-blur shadow-xl">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="font-bold uppercase tracking-wider">{platform} 備份</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono text-[10px]">{formattedPublishedTime}</span>
        </div>
      </div>

      {/* 📜 2. THE ORGANIC MOUTH CAVITY (Opens & Closes) */}
      <div
        className={`relative z-20 mx-4 sm:mx-6 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden ${
          isExpanded
            ? "max-h-[3000px] opacity-100 py-6 my-2 border-l-[3px] border-r-[3px] border-b-[3px] border-sky-400"
            : "max-h-0 opacity-0 py-0 my-0 border-none"
        }`}
        style={{
          background: "radial-gradient(ellipse at center, #2e081f 0%, #150512 60%, #080208 100%)",
          borderRadius: "0 0 45px 45px",
          boxShadow: isExpanded
            ? "inset 0 20px 40px rgba(0,0,0,0.9), 0 0 30px rgba(244,114,182,0.15)"
            : "none",
        }}
      >
        {/* Soft Pink Throat Arc (Inner Mouth Depth) */}
        <div className="absolute top-0 inset-x-8 h-8 bg-gradient-to-b from-rose-500/20 to-transparent pointer-events-none rounded-b-full" />

        {/* EXPANDED STATE: The Full Unfolded Scroll on the Tongue */}
        {isExpanded && (
          <div className="px-6 sm:px-8 space-y-4">
            {/* The Ancient Scroll Background for text */}
            <div className="relative p-5 rounded-2xl bg-slate-900/95 border border-slate-700/70 shadow-2xl backdrop-blur">
              {/* Top status bar in the scroll */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/50">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span>🐾</span> <span>貓咪回聲卷軸</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-sky-500/30">
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
                    <div className="text-sm font-bold text-slate-200">私密文章（由貓咪守護）</div>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {isPostOwner ? "使用您的 Chamber 身分即可一鍵解鎖" : "需獲得作者核准授權方可閱讀"}
                    </p>
                    {isPostOwner ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDecrypt(); }}
                        disabled={isDecrypting}
                        className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
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
                        onClick={(e) => { e.stopPropagation(); onOpenAlbum(mediaUrls, i, "貓咪相簿"); }}
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

            {/* Pink Cat Tongue resting at the bottom of the mouth */}
            <div className="flex justify-center">
              <div className="w-32 h-5 rounded-b-full bg-gradient-to-b from-rose-400 to-rose-600 shadow-md flex items-center justify-center text-[10px] text-rose-950 font-black">
                👅 貓舌頭
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 🐾 3. LOWER JAW & CHIN (Seamlessly Closes with Upper Head) */}
      <div
        className={`relative z-30 drop-shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isExpanded ? "mt-0" : "-mt-10 sm:-mt-12"
        }`}
      >
        <svg
          viewBox="0 0 500 90"
          className="w-full h-auto block overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Lower Jaw Curve */}
          <path
            d="M 50 10 Q 250 85 450 10 Q 420 85 250 90 Q 80 85 50 10 Z"
            fill="url(#catSkinGrad)"
            stroke="#38bdf8"
            strokeWidth="3"
          />

          {/* Lower Center Fangs */}
          <polygon points="238,10 244,10 241,1" fill="#ffffff" />
          <polygon points="256,10 262,10 259,1" fill="#ffffff" />

          {/* Red Collar Band */}
          <path d="M 130 55 Q 250 85 370 55" fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />

          {/* Golden Bell (Arweave TX Link) */}
          <g
            className="cursor-pointer hover:scale-125 transition-transform origin-[250px_72px]"
            onClick={() => window.open(`${irysHost}/${post.txId}`, "_blank")}
          >
            <title>點擊查看 Arweave 鏈上存證</title>
            <circle cx="250" cy="72" r="14" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
            <circle cx="250" cy="74" r="3" fill="#78350f" />
            <line x1="250" y1="77" x2="250" y2="84" stroke="#78350f" strokeWidth="1.5" />
          </g>
        </svg>

        {/* 🐾 Tactile Mouth Toggle Button below Chin */}
        <div className="flex justify-center -mt-2 pb-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="px-6 py-2 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-orange-500/25 flex items-center gap-2 cursor-pointer transform active:scale-95 transition-all"
          >
            <span>🐾</span>
            <span>{isExpanded ? "喵！咬合收嘴 ▲" : "喵！大口張開看全文 ▼"}</span>
            <span>🐾</span>
          </button>
        </div>
      </div>
    </div>
  );
}
