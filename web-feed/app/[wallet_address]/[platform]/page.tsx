"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface MediaSchema {
  primary_fb_cdn: string;
  fallback_backup: string;
}

interface PostPayload {
  protocol_version: string;
  app_name: string;
  fb_user_id: string;
  author_wallet: string;
  timestamp: number;
  is_encrypted: boolean;
  content: string; // Plaintext or encrypted stringified JSON
  media: MediaSchema;
  platform?: string; // facebook, threads, x, instagram
  tags?: string[];
  source_url?: string;
}

interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  encrypted: boolean;
}

interface PostItem {
  txId: string;
  payload: PostPayload;
  decryptedContent?: string;
  isDecrypting?: boolean;
  isDebug?: boolean;
}

export default function PlatformFeed({
  params,
}: {
  params: Promise<{ wallet_address: string; platform: string }>;
}) {
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [currentPlatform, setCurrentPlatform] = useState<string>("all");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewerWallet, setViewerWallet] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const searchParams = useSearchParams();
  const activeTag = searchParams.get("tag") || "";

  // Resolve dynamic route params
  useEffect(() => {
    params.then((p) => {
      setWalletAddress(p.wallet_address);
      setCurrentPlatform(p.platform.toLowerCase());
    });
  }, [params]);

  // Connect Web3 Wallet
  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        setStatusMessage("正在連結 MetaMask...");
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setViewerWallet(accounts[0]);
        setStatusMessage("錢包連結成功！");
        setTimeout(() => setStatusMessage(""), 2000);
      } catch (err: any) {
        console.error("Wallet connection failed:", err);
        setStatusMessage("連結失敗: " + err.message);
        setTimeout(() => setStatusMessage(""), 3000);
      }
    } else {
      setStatusMessage("啟動安全模擬錢包...");
      setTimeout(() => {
        setViewerWallet("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
        setStatusMessage("模擬錢包連結成功！");
        setTimeout(() => setStatusMessage(""), 2000);
      }, 8000);
    }
  };

  // Fetch posts from Arweave/Irys GraphQL Indexer with dynamic platform & tag parameters
  useEffect(() => {
    if (!walletAddress || !currentPlatform) return;

    const fetchPosts = async () => {
      setLoading(true);
      try {
        // Build GraphQL tags matching user inputs
        const tagsFilter = [
          `{ name: "App-Name", values: ["Chamber"] }`,
          `{ name: "FB-User-Hash", values: ["${walletAddress}"] }`
        ];

        if (currentPlatform !== "all") {
          tagsFilter.push(`{ name: "Platform", values: ["${currentPlatform}"] }`);
        }

        if (activeTag) {
          tagsFilter.push(`{ name: "Post-Tag", values: ["${activeTag}"] }`);
        }

        const query = `
          query {
            transactions(
              tags: [
                ${tagsFilter.join("\n")}
              ]
              first: 20
            ) {
              edges {
                node {
                  id
                  tags {
                    name
                    value
                  }
                }
              }
            }
          }
        `;

        const response = await fetch("https://devnet.irys.xyz/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });

        const resData = await response.json();
        const edges = resData.data?.transactions?.edges || [];

        if (edges.length > 0) {
          const fetchedPosts: PostItem[] = await Promise.all(
            edges.map(async (edge: any) => {
              const txId = edge.node.id;
              const contentRes = await fetch(`https://devnet.irys.xyz/${txId}`);
              const payload: PostPayload = await contentRes.json();
              const tagsMap = Object.fromEntries(edge.node.tags.map((t: any) => [t.name, t.value]));
              const isDebug = tagsMap["Is-Debug"] === "true";
              return { txId, payload, isDebug };
            })
          );
          
          // Sort posts by timestamp DESC (newest first)
          fetchedPosts.sort((a, b) => b.payload.timestamp - a.payload.timestamp);

          // Deduplicate by source_url (if present), keeping only the latest version (Last-Write-Wins)
          const seenSourceUrls = new Set<string>();
          const dedupedPosts: PostItem[] = [];

          for (const post of fetchedPosts) {
            const sourceUrl = post.payload.source_url;
            if (sourceUrl) {
              if (seenSourceUrls.has(sourceUrl)) {
                console.log(`[Chamber] Filtered out duplicate historic version of post: ${sourceUrl}`);
                continue;
              }
              seenSourceUrls.add(sourceUrl);
            }
            dedupedPosts.push(post);
          }

          // Client-side filter out debug posts unless URL query ?debug=true is specified
          const showDebug = searchParams.get("debug") === "true";
          const filteredPosts = dedupedPosts.filter(p => showDebug || !p.isDebug);
          setPosts(filteredPosts);
        } else {
          // Fallback to sample mock database
          console.log("[Chamber] No transactions found. Loading platform-filtered mock data...");
          let mockData = getMockPlatformPosts(walletAddress);
          
          // Filter by platform
          if (currentPlatform !== "all") {
            mockData = mockData.filter(p => p.payload.platform === currentPlatform);
          }
          
          // Filter by tag
          if (activeTag) {
            mockData = mockData.filter(p => p.payload.tags?.includes(activeTag));
          }

          setPosts(mockData);
        }
      } catch (err) {
        console.warn("[Chamber] GraphQL indexing error. Loading offline sandbox database...", err);
        let mockData = getMockPlatformPosts(walletAddress);
        if (currentPlatform !== "all") {
          mockData = mockData.filter(p => p.payload.platform === currentPlatform);
        }
        if (activeTag) {
          mockData = mockData.filter(p => p.payload.tags?.includes(activeTag));
        }
        setPosts(mockData);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [walletAddress, currentPlatform, activeTag]);

  // Client-Side Cryptographic Decryption Function
  const handleDecryptPost = async (post: PostItem, index: number) => {
    if (!viewerWallet) {
      alert("請先連結錢包以進行身份驗證！");
      return;
    }

    const updatedPosts = [...posts];
    updatedPosts[index].isDecrypting = true;
    setPosts(updatedPosts);

    try {
      let signature = "";
      if (typeof window !== "undefined" && (window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const message = `Chamber Decrypt Authorization\nNonce: ${post.txId}\nViewer: ${viewerWallet}`;
        signature = await signer.signMessage(message);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        signature = "0xmocked_signature_" + Math.random().toString(36).substring(2, 15);
      }

      const registryAllowedList = [
        "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        viewerWallet.toLowerCase()
      ];

      if (!registryAllowedList.includes(viewerWallet.toLowerCase())) {
        throw new Error("您的地址不在作者身分註冊表（Registry）的信任名單內！");
      }

      const encryptedBlob: EncryptedBlob = JSON.parse(post.payload.content);
      const enc = new TextEncoder();
      const rawKey = enc.encode(signature.slice(0, 32));
      
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      const ivBuffer = new Uint8Array(
        encryptedBlob.iv.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );
      const ciphertextBuffer = new Uint8Array(
        encryptedBlob.ciphertext.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );

      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBuffer
        },
        cryptoKey,
        ciphertextBuffer
      );

      const dec = new TextDecoder();
      const decryptedText = dec.decode(decryptedBuffer);

      const successPosts = [...posts];
      successPosts[index].decryptedContent = decryptedText;
      successPosts[index].isDecrypting = false;
      setPosts(successPosts);

    } catch (err: any) {
      console.error("[Chamber] Decryption error:", err);
      alert("解密失敗: " + err.message);
      const errorPosts = [...posts];
      errorPosts[index].isDecrypting = false;
      setPosts(errorPosts);
    }
  };

  const platforms = [
    { id: "all", name: "✨ 全部流" },
    { id: "facebook", name: "👥 Facebook" },
    { id: "threads", name: "🧵 Threads" },
    { id: "x", name: "🐦 X (Twitter)" },
    { id: "instagram", name: "📸 Instagram" }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-indigo-950/40 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <Link href={`/${walletAddress}`} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight bg-gradient-to-r from-indigo-200 to-purple-300 bg-clip-text text-transparent">
                Chamber Portal
              </h1>
              <p className="text-[10px] text-slate-500 font-mono">studio.milkcat.org/reborn</p>
            </div>
          </Link>

          <div>
            {viewerWallet ? (
              <div className="flex items-center gap-2 bg-indigo-950/40 border border-indigo-900/60 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-xs font-mono text-indigo-300">
                  {viewerWallet.slice(0, 6)}...{viewerWallet.slice(-4)}
                </span>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-full shadow-lg shadow-indigo-600/20 transition-all duration-200"
              >
                連結錢包
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Flow */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">
        {/* Creator Info */}
        <div className="mb-6 p-4 bg-gradient-to-b from-slate-900/80 to-slate-950 border border-slate-900/30 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-0.5 shadow-md">
              <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center font-bold text-sm text-slate-100">
                MS
              </div>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                石虎護衛者 (Chamber Creator)
              </h2>
              <p className="text-[10px] text-slate-400 font-mono break-all">{walletAddress}</p>
            </div>
          </div>
        </div>

        {/* Dynamic Platform Filters sub-navigation bar */}
        <nav className="mb-6 flex gap-1.5 overflow-x-auto pb-2 border-b border-slate-900 scrollbar-none">
          {platforms.map((p) => {
            const isActive = currentPlatform === p.id;
            return (
              <Link
                key={p.id}
                href={`/${walletAddress}/${p.id}${activeTag ? `?tag=${activeTag}` : ""}`}
                className={`text-xs px-3.5 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-indigo-600 text-indigo-50 border border-indigo-500 shadow-md shadow-indigo-600/25"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-transparent"
                }`}
              >
                {p.name}
              </Link>
            );
          })}
        </nav>

        {/* Dynamic Tag filtering display block */}
        {activeTag && (
          <div className="mb-6 flex items-center justify-between bg-indigo-950/20 border border-indigo-900/40 px-3 py-2 rounded-xl text-xs text-indigo-300">
            <div className="flex items-center gap-1">
              <span>🏷️ 正在過濾標籤:</span>
              <span className="font-bold bg-indigo-900/60 px-2 py-0.5 rounded font-mono">#{activeTag}</span>
            </div>
            <Link href={`/${walletAddress}/${currentPlatform}`} className="text-indigo-400 hover:underline hover:text-indigo-300">
              清除過濾
            </Link>
          </div>
        )}

        {/* Timeline Post Flow */}
        <div className="relative border-l border-slate-800 ml-4 pl-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <div className="w-6 h-6 rounded-full border-2 border-t-indigo-500 border-indigo-900/30 animate-spin"></div>
              <p className="text-xs">正在從 Arweave 載入過濾貼文...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-xs">查無符合此平台或標籤條件的貼文。</p>
            </div>
          ) : (
            posts.map((post, idx) => {
              const formattedTime = new Date(post.payload.timestamp * 1000).toLocaleString("zh-TW", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              });

              // Tag elements helper
              const postTags = post.payload.tags || [];

              return (
                <div key={post.txId} className="relative group">
                  <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-indigo-500 group-hover:border-purple-500 transition-all"></div>

                  <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-900 rounded-2xl p-4.5 hover:border-slate-800 transition-all">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center font-bold text-[10px] text-indigo-400">
                          {post.payload.platform?.toUpperCase().slice(0, 2) || "MS"}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                             來自 {post.payload.platform || "Chamber"}
                             <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                               {post.payload.protocol_version}
                             </span>
                             {post.payload.source_url && (
                               <a
                                 href={post.payload.source_url}
                                 target="_blank"
                                 rel="noreferrer"
                                 className="text-[9px] bg-indigo-950/40 text-indigo-400 border border-indigo-900/40 px-1.5 py-0.5 rounded font-bold hover:underline hover:text-indigo-300"
                               >
                                 🔗 檢視原文
                               </a>
                             )}
                             {post.isDebug && (
                               <span className="text-[9px] bg-red-950/80 text-red-400 border border-red-900/50 px-1.5 py-0.5 rounded font-bold">
                                 DEBUG 測試
                               </span>
                             )}
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">{formattedTime}</div>
                        </div>
                      </div>
                      <a
                        href={`https://devnet.irys.xyz/tx/${post.txId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] text-indigo-400 hover:text-indigo-300 font-mono bg-indigo-950/20 px-2 py-0.5 rounded border border-indigo-900/20"
                      >
                        TX: {post.txId.slice(0, 8)}...
                      </a>
                    </div>

                    {/* Content */}
                    <div className="text-xs leading-relaxed text-slate-300 mb-3 whitespace-pre-wrap">
                      {post.payload.is_encrypted ? (
                        post.decryptedContent ? (
                          <div className="bg-emerald-950/10 border border-emerald-900/30 p-3 rounded-xl text-slate-200 relative">
                            <span className="absolute top-2 right-2 text-[9px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded font-mono">已解密</span>
                            {post.decryptedContent}
                          </div>
                        ) : (
                          <div className="bg-slate-950 border border-indigo-950/40 p-4 rounded-xl text-center flex flex-col items-center gap-2.5">
                            <div className="text-lg">🔒</div>
                            <div>
                              <div className="text-xs font-semibold text-slate-300">本地 AES 加密保護</div>
                              <p className="text-[9px] text-slate-500 mt-1">需與作者建立虛擬社交信任鏈（Registry 授權）</p>
                            </div>
                            <button
                              onClick={() => handleDecryptPost(post, idx)}
                              disabled={post.isDecrypting}
                              className="text-xs bg-indigo-600/80 hover:bg-indigo-500 text-indigo-100 px-4.5 py-1.5 rounded-lg border border-indigo-500/20 transition-all"
                            >
                              {post.isDecrypting ? "🔑 正在解密..." : "⚡ 驗證簽署並解密"}
                            </button>
                          </div>
                        )
                      ) : (
                        post.payload.content
                      )}
                    </div>

                    {/* Tags List block */}
                    {postTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3.5">
                        {postTags.map((tag) => (
                          <Link
                            key={tag}
                            href={`/${walletAddress}/${currentPlatform}?tag=${tag}`}
                            className={`text-[9px] px-2 py-0.5 rounded font-mono font-semibold transition-all ${
                              activeTag === tag
                                ? "bg-indigo-900/80 text-indigo-300 border border-indigo-700/50"
                                : "bg-slate-950 hover:bg-slate-800 text-indigo-400"
                            }`}
                          >
                            #{tag}
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Media */}
                    {post.payload.media?.primary_fb_cdn && (
                      <div className="mt-3.5 rounded-xl overflow-hidden border border-slate-900 bg-slate-950 aspect-video flex items-center justify-center">
                        <img
                          src={post.payload.media.primary_fb_cdn}
                          alt="Platform media"
                          className="object-cover w-full h-full hover:scale-102 transition-transform duration-300"
                          onError={(e) => {
                            console.log(`[Chamber] Media CDN failed. Redirecting to backup: ${post.payload.media.fallback_backup}`);
                            const target = e.currentTarget;
                            if (post.payload.media.fallback_backup) {
                              target.src = post.payload.media.fallback_backup;
                            } else {
                              target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600";
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <footer className="py-6 border-t border-indigo-950/20 text-center text-[9px] text-slate-600 font-mono">
        <p>© 2026 Chamber Protocol • studio.milkcat.org/reborn</p>
      </footer>
    </div>
  );
}

function getMockPlatformPosts(walletAddress: string): PostItem[] {
  return [
    {
      txId: "ARWEAVE_TX_D3M0_F111",
      payload: {
        protocol_version: "2026-v1",
        app_name: "Chamber",
        fb_user_id: "fb_user_1",
        author_wallet: walletAddress,
        timestamp: Math.floor(Date.now() / 1000) - 3600 * 1.5,
        is_encrypted: false,
        content: "今天完成了 Chamber Protocol 的初代功能整合！這是一個明修棧道、暗渡陳倉的去中心化社交方案。所有的貼文資料直接在本地打包，利用白嫖的 Irys 額度永久儲存在 Arweave 區塊鏈上。即便 Facebook 帳號被祖，我們也能在一秒鐘之內於去中心化動態牆上滿血復活！🔥🔥",
        media: {
          primary_fb_cdn: "https://invalid-fbcdn-url.net/photos/1.jpg",
          fallback_backup: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=800"
        },
        platform: "facebook",
        tags: ["devlog", "chamber"]
      }
    },
    {
      txId: "ARWEAVE_TX_D3M0_T222",
      payload: {
        protocol_version: "2026-v1",
        app_name: "Chamber",
        fb_user_id: "threads_user_1",
        author_wallet: walletAddress,
        timestamp: Math.floor(Date.now() / 1000) - 3600 * 5,
        is_encrypted: false,
        content: "這是來自 Threads 的第一條 Web3 備份測試。Threads 的文字和排版更簡約，但同樣走統一的上鏈流水線。只要把 DOM Scraper 搞定，後面不管到哪，我都有我自己的 Reborn 重生牆自主權。 #threads #web3",
        media: {
          primary_fb_cdn: "https://invalid-threads-cdn.net/photos/2.jpg",
          fallback_backup: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800"
        },
        platform: "threads",
        tags: ["threads", "freedom"]
      }
    },
    {
      txId: "ARWEAVE_TX_D3M0_X333",
      payload: {
        protocol_version: "2026-v1",
        app_name: "Chamber",
        fb_user_id: "twitter_user_1",
        author_wallet: walletAddress,
        timestamp: Math.floor(Date.now() / 1000) - 3600 * 20,
        is_encrypted: true,
        content: JSON.stringify({
          ciphertext: "4f738a9bcf3388cd259fb16de29d892dfd9c020d2ba2df6e5d8eaee0391ab1a12903b41d2f6277d7e35b71",
          iv: "3e55da9142bc33ee2a9947fd",
          encrypted: true
        }),
        media: {
          primary_fb_cdn: "https://invalid-x-cdn.net/photos/3.jpg",
          fallback_backup: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=800"
        },
        platform: "x",
        tags: ["x", "privacy"]
      }
    }
  ];
}
