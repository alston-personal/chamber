"use client";

import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

interface MediaSchema {
  primary_fb_cdn?: string;
  fallback_backup?: string;
  urls?: string[];
  items?: Array<{ url: string; iv?: string; contentType?: string; encrypted?: boolean }>;
  album?: boolean;
  album_complete?: boolean;
  album_loaded_count?: number;
  album_expected_count?: number | null;
  album_source_url?: string | null;
  video?: boolean;
  video_source_type?: string | null;
  video_backup_status?: "link_only" | "poster_only" | "file_attempted" | "complete" | null;
  video_source_url?: string | null;
}

interface PostPayload {
  protocol_version: string;
  extension_version?: string | null;
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
  logical_source_id?: string;
  network?: "devnet" | "mainnet";
  backup_timestamp?: number;
  identity_key?: string;
  identity_alias?: string | null;
  encryption_version?: string | null;
  key_envelope?: Record<string, unknown> | null;
}

interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  encrypted: boolean;
}

interface PostItem {
  txId: string;
  payload: PostPayload;
  backupTime?: number;
  decryptedContent?: string;
  isDecrypting?: boolean;
  isDebug?: boolean;
  decryptedMedia?: string[];
  mediaDecryptTotal?: number;
  mediaDecryptCompleted?: number;
  mediaDecryptFailed?: number;
}

interface ExtensionIdentity {
  walletAddress: string;
  identityAlias: string;
  identityDisplayName: string;
  sharingKeyId: string;
  sharingPublicKey: JsonWebKey;
  accessCapability: string;
}

interface ReadingRequest {
  id: string;
  postTxId: string;
  requesterWallet: string;
  requesterAlias?: string;
  requesterKeyId: string;
  requesterPublicKey: JsonWebKey;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  createdAt: string;
}

interface PendingRecovery {
  setId: string;
  recoveryCodeC: string;
}

function canonicalSourceKey(value?: string) {
  try {
    const url = new URL(value || "");
    const params = ["story_fbid", "fbid", "set", "v"]
      .filter((key) => url.searchParams.has(key))
      .map((key) => `${key}=${url.searchParams.get(key)}`)
      .join("&");
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "").toLowerCase()}${params ? `?${params}` : ""}`;
  } catch (_) {
    return value || "";
  }
}

function normalizeIdentityAlias(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "");
}

export default function PlatformFeed({
  params,
}: {
  params: Promise<{ wallet_address: string; platform: string }>;
}) {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [resolvedIdentityKey, setResolvedIdentityKey] = useState<string>("");
  const [currentPlatform, setCurrentPlatform] = useState<string>("all");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewerWallet, setViewerWallet] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isHeaderDropdownOpen, setIsHeaderDropdownOpen] = useState<boolean>(false);
  const [albumViewer, setAlbumViewer] = useState<{ urls: string[]; index: number; title: string } | null>(null);
  const [isDecryptingAll, setIsDecryptingAll] = useState<boolean>(false);
  const [decryptProgress, setDecryptProgress] = useState<string>("");
  const [ownerWallet, setOwnerWallet] = useState<string>("");
  const [ownerDisplayName, setOwnerDisplayName] = useState<string>("");
  const [extensionIdentity, setExtensionIdentity] = useState<ExtensionIdentity | null>(null);
  const [readingRequests, setReadingRequests] = useState<ReadingRequest[]>([]);
  const [showReadingRequests, setShowReadingRequests] = useState<boolean>(false);
  const [accessBusyId, setAccessBusyId] = useState<string>("");
  const [showRecovery, setShowRecovery] = useState<boolean>(false);
  const [recoveryBusy, setRecoveryBusy] = useState<boolean>(false);
  const [recoveryStatus, setRecoveryStatus] = useState<string>("");
  const [recoveryCodeInput, setRecoveryCodeInput] = useState<string>("");
  const [pendingRecovery, setPendingRecovery] = useState<PendingRecovery | null>(null);
  const [passkeyProvider, setPasskeyProvider] = useState<"password-manager" | "system">("password-manager");
  const [recoveryConfigured, setRecoveryConfigured] = useState<boolean>(false);
  const albumTouchStartX = useRef<number | null>(null);
  const albumLastWheelAt = useRef<number>(0);
  const autoUnlockKey = useRef<string>("");

  const searchParams = useSearchParams();
  const activeTag = searchParams.get("tag") || "";
  const network = searchParams.get("network") === "mainnet" ? "mainnet" : "devnet";
  const irysHost = network === "mainnet" ? "https://arweave.net" : "https://devnet.irys.xyz";
  const showHistory = searchParams.get("history") === "true";
  const focusTxId = searchParams.get("post") || "";
  const queryPlatform = currentPlatform === "fb"
    ? "facebook"
    : currentPlatform === "ig"
      ? "instagram"
      : currentPlatform;

  const requestExtensionIdentity = () => new Promise<ExtensionIdentity>((resolve, reject) => {
    const requestId = `identity_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("未偵測到 Chamber Extension"));
    }, 2500);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "EXTENSION_WALLET_RESPONSE") return;
      if (event.data.requestId && event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!event.data.walletAddress || !event.data.sharingKeyId || !event.data.sharingPublicKey) {
        reject(new Error("Chamber Extension 尚未建立分享金鑰"));
        return;
      }
      resolve({
        walletAddress: event.data.walletAddress,
        identityAlias: event.data.identityAlias || "",
        identityDisplayName: event.data.identityDisplayName || event.data.identityAlias || "",
        sharingKeyId: event.data.sharingKeyId,
        sharingPublicKey: event.data.sharingPublicKey,
        accessCapability: event.data.accessCapability || "",
      });
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "echo-portal", type: "GET_EXTENSION_WALLET", requestId }, window.location.origin);
  });

  const requestExtensionRecovery = <T extends Record<string, any>>(type: string, payload: Record<string, any> = {}) => new Promise<T>((resolve, reject) => {
    const requestId = `recovery_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const responseType = `${type}_RESPONSE`;
    const timeoutMs = type.startsWith("NATIVE_PASSKEY_") ? 70_000 : 10_000;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(type.startsWith("NATIVE_PASSKEY_") ? "系統 Passkey 操作已取消或逾時" : "Chamber Extension 沒有回應，請確認已安裝並重新載入"));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== responseType || event.data?.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!event.data.success) reject(new Error(event.data.error || "Extension 復原操作失敗"));
      else resolve(event.data as T);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "echo-portal", type, requestId, ...payload }, window.location.origin);
  });

  const runPasswordManagerPasskey = async <T,>(operation: () => Promise<T>): Promise<T> => {
    let timeoutId = 0;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            WebAuthnAbortService.cancelCeremony();
            reject(new Error("密碼管理器在 60 秒內沒有完成 Passkey。若出現空白視窗，可改選「Windows Hello／Chrome」。"));
          }, 60_000);
        }),
      ]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const registerPasskey = async (optionsJSON: any) => {
    if (passkeyProvider === "system") {
      const result = await requestExtensionRecovery<any>("NATIVE_PASSKEY_REGISTER", { optionsJSON });
      return result.credential;
    }
    return runPasswordManagerPasskey(() => startRegistration({ optionsJSON }));
  };

  const authenticatePasskey = async (optionsJSON: any) => {
    if (passkeyProvider === "system") {
      const result = await requestExtensionRecovery<any>("NATIVE_PASSKEY_AUTHENTICATE", { optionsJSON });
      return result.credential;
    }
    return runPasswordManagerPasskey(() => startAuthentication({ optionsJSON }));
  };

  useEffect(() => {
    if (!showRecovery) return;
    requestExtensionRecovery<any>("GET_RECOVERY_VAULT_STATUS")
      .then((status) => {
        setRecoveryConfigured(Boolean(status.confirmed));
        if (status.pendingRecoveryCodeC && status.setId) {
          setPendingRecovery({ setId: status.setId, recoveryCodeC: status.pendingRecoveryCodeC });
          setRecoveryStatus("Passkey 與 Vault B 已建立。請保存下方 C，再按確認完成設定。");
        } else if (status.confirmed) {
          setRecoveryStatus("✅ 復原設定已完成。Passkey 私鑰由所選提供者保管，不會交給 Chamber；離線復原碼 C 不會再次顯示。");
        }
      })
      .catch((error) => setRecoveryStatus(`無法讀取復原狀態：${error.message}`));
  }, [showRecovery]);

  const setupRecoveryVault = async () => {
    let registrationSession: { accountId: string; setupToken: string } | null = null;
    let registrationVerified = false;
    setRecoveryBusy(true);
    setRecoveryStatus("正在由 Extension 建立 A、B、C 三份復原資料...");
    try {
      const prepared = await requestExtensionRecovery<any>("PREPARE_RECOVERY_VAULT");
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareB: prepared.shareB }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || "無法建立 Passkey 設定");
      registrationSession = {
        accountId: optionsData.registration.accountId,
        setupToken: optionsData.registration.setupToken,
      };
      setRecoveryStatus(passkeyProvider === "system"
        ? "等待你在 Windows Hello 或 Chrome 中確認建立系統 Passkey（最多 60 秒）..."
        : "等待你在 Bitwarden／1Password／瀏覽器密碼管理器中確認建立 Passkey（最多 60 秒）...");
      const passkeyResponse = await registerPasskey(optionsData.registration.options);
      const verifyResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: optionsData.registration.accountId,
          setupToken: optionsData.registration.setupToken,
          response: passkeyResponse,
        }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.registration?.verified) throw new Error(verifyData.error || "Passkey 驗證失敗");
      registrationVerified = true;
      const finalized = await requestExtensionRecovery<any>("FINALIZE_RECOVERY_VAULT", {
        setId: prepared.setId,
        accountId: optionsData.registration.accountId,
      });
      setPendingRecovery({ setId: finalized.setId, recoveryCodeC: finalized.recoveryCodeC });
      setRecoveryStatus("✅ A 已留在 Extension、B 已進入 Recovery Vault。請把 C 保存到另一個安全位置，再按確認。");
    } catch (error: any) {
      setRecoveryStatus(`設定失敗：${error.message}`);
    } finally {
      if (registrationSession && !registrationVerified) {
        fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/register/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registrationSession),
        }).catch(() => {});
      }
      setRecoveryBusy(false);
    }
  };

  const confirmRecoverySaved = async () => {
    if (!pendingRecovery) return;
    setRecoveryBusy(true);
    try {
      await requestExtensionRecovery("CONFIRM_RECOVERY_VAULT", { setId: pendingRecovery.setId });
      setRecoveryStatus("✅ 2-of-3 金鑰復原設定完成。A 在 Extension、B 在 Vault、C 由您離線保存。");
      setPendingRecovery(null);
      setRecoveryConfigured(true);
    } catch (error: any) {
      setRecoveryStatus(`確認失敗：${error.message}`);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const rotateRecoveryCode = async () => {
    if (!window.confirm("將建立新的 A／B／C 復原組，並以新的 B 取代 Vault 內的舊 B。完成後，舊 C 將無法再搭配 Vault 還原。確定繼續？")) return;
    setRecoveryBusy(true);
    setRecoveryStatus("正在驗證現有 Passkey，準備輪替復原組...");
    try {
      const status = await requestExtensionRecovery<any>("GET_RECOVERY_VAULT_STATUS");
      if (!status.confirmed || !status.hasLocalA || !status.accountId) throw new Error("目前沒有可輪替的完整復原設定");
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || "無法讀取 Passkey 設定");
      const passkeyResponse = await authenticatePasskey(optionsData.authentication.options);
      const verifyResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId, response: passkeyResponse }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.authentication?.verified) throw new Error(verifyData.error || "Passkey 驗證失敗");

      await requestExtensionRecovery("RESTORE_RECOVERY_AB", { shareB: verifyData.authentication.shareB });
      const prepared = await requestExtensionRecovery<any>("PREPARE_RECOVERY_VAULT");
      const rotateResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/vault/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: status.accountId,
          sessionToken: verifyData.authentication.sessionToken,
          shareB: prepared.shareB,
        }),
      });
      const rotateData = await rotateResponse.json();
      if (!rotateResponse.ok) throw new Error(rotateData.error || "Vault 份額 B 輪替失敗");
      const finalized = await requestExtensionRecovery<any>("FINALIZE_RECOVERY_VAULT", {
        setId: prepared.setId,
        accountId: status.accountId,
      });
      setPendingRecovery({ setId: finalized.setId, recoveryCodeC: finalized.recoveryCodeC });
      setRecoveryConfigured(false);
      setRecoveryStatus("✅ Vault B 已輪替。請立即保存下方新的 C 並確認；舊 C 已失效。");
    } catch (error: any) {
      setRecoveryStatus(`輪替失敗：${error.message}`);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const restoreWithLocalAAndVaultB = async () => {
    setRecoveryBusy(true);
    setRecoveryStatus("正在確認本機 A 與 Passkey Vault B...");
    try {
      const status = await requestExtensionRecovery<any>("GET_RECOVERY_VAULT_STATUS");
      if (!status.hasLocalA || !status.accountId) throw new Error("本機沒有可用的 A 或尚未連結 Recovery Vault");
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || "無法讀取 Passkey 設定");
      const passkeyResponse = await authenticatePasskey(optionsData.authentication.options);
      const verifyResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId, response: passkeyResponse }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.authentication?.verified) throw new Error(verifyData.error || "Passkey 驗證失敗");
      await requestExtensionRecovery("RESTORE_RECOVERY_AB", { shareB: verifyData.authentication.shareB });
      setRecoveryStatus("✅ 已使用本機 A＋Passkey Vault B 完成金鑰修復。");
    } catch (error: any) {
      setRecoveryStatus(`A＋B 修復失敗：${error.message}`);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const restoreRecoveryVault = async () => {
    if (!recoveryCodeInput.trim()) {
      setRecoveryStatus("請先貼上緊急復原碼 C。");
      return;
    }
    setRecoveryBusy(true);
    setRecoveryStatus("正在檢查本機 A 是否能與 C 直接還原...");
    try {
      try {
        const localRestored = await requestExtensionRecovery<any>("RESTORE_RECOVERY_VAULT", { recoveryCodeC: recoveryCodeInput.trim() });
        if (localRestored.local) {
          setRecoveryCodeInput("");
          setRecoveryStatus("✅ 已使用本機 A＋緊急復原碼 C 完成還原，不需要讀取 Vault。");
          return;
        }
      } catch (_) {
        // A is absent or belongs to another set; continue with Passkey + B+C.
      }
      const normalizedRecoveryCode = recoveryCodeInput.trim();
      if (!normalizedRecoveryCode.startsWith("CHAMBER-C1.")) throw new Error("緊急復原碼 C 格式不正確");
      const encoded = normalizedRecoveryCode.slice("CHAMBER-C1.".length).replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
      const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
      if (!decoded.accountId) throw new Error("緊急復原碼 C 內容不完整");
      setRecoveryStatus("請使用原本建立的 Passkey 驗證，以取回 Vault 份額 B...");
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: decoded.accountId }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || "無法讀取 Passkey 設定");
      const passkeyResponse = await authenticatePasskey(optionsData.authentication.options);
      const verifyResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: decoded.accountId, response: passkeyResponse }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.authentication?.verified) throw new Error(verifyData.error || "Passkey 驗證失敗");
      const restored = await requestExtensionRecovery<any>("RESTORE_RECOVERY_VAULT", {
        shareB: verifyData.authentication.shareB,
        recoveryCodeC: recoveryCodeInput.trim(),
      });
      const finalized = await requestExtensionRecovery<any>("FINALIZE_RECOVERY_VAULT", { setId: restored.setId, accountId: decoded.accountId });
      setPendingRecovery({ setId: finalized.setId, recoveryCodeC: finalized.recoveryCodeC });
      const rotateResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/vault/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: decoded.accountId, sessionToken: verifyData.authentication.sessionToken, shareB: restored.shareB }),
      });
      const rotateData = await rotateResponse.json();
      if (!rotateResponse.ok) throw new Error(rotateData.error || "Vault 份額 B 輪替失敗");
      setRecoveryCodeInput("");
      setRecoveryStatus("✅ 金鑰已還原並完成輪替。請保存下方新的 C；舊的 C 已失效。");
    } catch (error: any) {
      setRecoveryStatus(`還原失敗：${error.message}`);
    } finally {
      setRecoveryBusy(false);
    }
  };

  // Resolve dynamic route params and load persistent session
  useEffect(() => {
    params.then((p) => {
      setWalletAddress(p.wallet_address);
      setCurrentPlatform(p.platform.toLowerCase());
    });

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chamber_logged_in_wallet");
      if (saved) {
        setViewerWallet(saved);
      }
    }
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    const syncExtensionIdentity = () => requestExtensionIdentity().then((identity) => {
      if (!cancelled) setExtensionIdentity(identity);
    }).catch(() => {
      if (!cancelled) setExtensionIdentity(null);
    });
    syncExtensionIdentity();
    window.addEventListener("focus", syncExtensionIdentity);
    const timer = window.setInterval(syncExtensionIdentity, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncExtensionIdentity);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("recovery") === "true") setShowRecovery(true);
  }, [searchParams]);

  useEffect(() => {
    if (!albumViewer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAlbumViewer(null);
      if (event.key === "ArrowLeft") {
        setAlbumViewer((current) => current ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length } : null);
      }
      if (event.key === "ArrowRight") {
        setAlbumViewer((current) => current ? { ...current, index: (current.index + 1) % current.urls.length } : null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [albumViewer]);

  useEffect(() => {
    if (!walletAddress) return;

    const looksLikeStableHash = walletAddress.startsWith("0x") || /^[a-f0-9]{32,64}$/i.test(walletAddress);
    if (looksLikeStableHash) {
      return;
    }

    const resolveAlias = async () => {
      try {
        const response = await fetch(`https://studio.milkcat.org/chamber-api/identity/resolve?alias=${encodeURIComponent(walletAddress)}&platform=${encodeURIComponent(queryPlatform)}`);
        if (!response.ok) {
          setResolvedIdentityKey(walletAddress);
          return;
        }
        const data = await response.json();
        setResolvedIdentityKey(data.contentKey || walletAddress);
        setOwnerWallet(data.currentWallet || "");
        setOwnerDisplayName(data.displayName || data.alias || walletAddress);
      } catch (err) {
        console.warn("[Chamber] Alias resolution failed, falling back to route param:", err);
        setResolvedIdentityKey(walletAddress);
      }
    };

    resolveAlias();
  }, [walletAddress, currentPlatform]);

  // Connect Web3 Wallet
  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        setStatusMessage("正在連結 MetaMask...");
        const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts[0];
        setViewerWallet(address);
        localStorage.setItem("chamber_logged_in_wallet", address);
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
        const mockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        setViewerWallet(mockAddress);
        localStorage.setItem("chamber_logged_in_wallet", mockAddress);
        setStatusMessage("模擬錢包連結成功！");
        setTimeout(() => setStatusMessage(""), 2000);
      }, 1500);
    }
  };

  const disconnectWallet = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chamber_logged_in_wallet");
    }
    setViewerWallet("");
    setStatusMessage("已斷開錢包連結。正在返回首頁...");
    setTimeout(() => {
      router.push("/");
    }, 1200);
  };

  // Fetch posts from Arweave/Irys GraphQL Indexer with dynamic platform & tag parameters
  useEffect(() => {
    const looksLikeStableHash = walletAddress.startsWith("0x") || /^[a-f0-9]{32,64}$/i.test(walletAddress);
    const queryIdentityKey = looksLikeStableHash ? walletAddress : (resolvedIdentityKey || walletAddress);
    const queryTagName = looksLikeStableHash ? "FB-User-Hash" : "Identity-Key";
    if (!queryIdentityKey || !currentPlatform) return;

    let cancelled = false;
    const fetchPosts = async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        // Build GraphQL tags matching user inputs
        const tagsFilter = [
          `{ name: "App-Name", values: ["Chamber"] }`,
          `{ name: "${queryTagName}", values: ["${queryIdentityKey}"] }`
        ];

        if (queryPlatform !== "all") {
          tagsFilter.push(`{ name: "Platform", values: ["${queryPlatform}"] }`);
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

        const response = await fetch(`${irysHost}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ query })
        });

        const resData = await response.json();
        const edges = resData.data?.transactions?.edges || [];

        if (edges.length > 0) {
          const fetchedPosts: PostItem[] = await Promise.all(
            edges.map(async (edge: any) => {
              const txId = edge.node.id;
              const contentRes = await fetch(`${irysHost}/${txId}`, { cache: "no-store" });
              const payload: PostPayload = await contentRes.json();
              // Older/newer payloads use different media shapes. Normalize
              // the Irys `media.urls[]` shape to the renderer's legacy fields.
              const mediaUrls = Array.isArray(payload.media?.urls) ? payload.media.urls.filter(Boolean) : [];
              if (!payload.media?.primary_fb_cdn && mediaUrls.length > 0) {
                payload.media = {
                  ...payload.media,
                  primary_fb_cdn: mediaUrls[0],
                  fallback_backup: mediaUrls[0],
                };
              }
              const tagsMap = Object.fromEntries(edge.node.tags.map((t: any) => [t.name, t.value]));
              const isDebug = tagsMap["Is-Debug"] === "true";
              return { txId, payload, isDebug, backupTime: Number(tagsMap["Backup-Time"] || payload.backup_timestamp || 0) };
            })
          );
          
          // Sort posts by timestamp DESC (newest first)
          fetchedPosts.sort((a, b) =>
            (b.backupTime || 0) - (a.backupTime || 0) ||
            b.payload.timestamp - a.payload.timestamp
          );

          // Same source URL means the same logical post. Keep only the latest
          // revision by default; `history=true` is the explicit audit view.
          if (focusTxId) {
            setPosts(fetchedPosts.filter((post) => post.txId === focusTxId));
            return;
          }
          const latestBySource = new Map<string, PostItem>();
          const dedupedPosts: PostItem[] = [];
          for (const post of fetchedPosts) {
            const sourceUrl = post.payload.logical_source_id || canonicalSourceKey(post.payload.source_url);
            if (!sourceUrl || showHistory) {
              dedupedPosts.push(post);
              continue;
            }
            const previous = latestBySource.get(sourceUrl);
            if (!previous ||
                (post.backupTime || 0) >= (previous.backupTime || 0) ||
                (!(post.backupTime || 0) && !(previous.backupTime || 0))) {
              latestBySource.set(sourceUrl, post);
            }
          }
          if (!showHistory) dedupedPosts.push(...latestBySource.values());

          // Devnet is the storage network for the current test release.
          // Legacy Is-Debug tags are not a user-facing visibility boundary.
          if (cancelled) return;
          setPosts(dedupedPosts);
          if (!ownerWallet && dedupedPosts[0]?.payload.author_wallet) setOwnerWallet(dedupedPosts[0].payload.author_wallet);
        } else {
          // Fallback to sample mock database (only in development)
          const isProd = process.env.NODE_ENV === "production";
          if (isProd) {
            console.log("[Chamber] No transactions found. Prod mode: showing empty state.");
            if (!cancelled) setPosts([]);
          } else {
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
        }
      } catch (err) {
        const isProd = process.env.NODE_ENV === "production";
        if (isProd) {
          console.warn("[Chamber] GraphQL indexing error. Prod mode: showing empty state.", err);
          if (!cancelled) setPosts([]);
        } else {
          console.warn("[Chamber] GraphQL indexing error. Loading offline sandbox database...", err);
          let mockData = getMockPlatformPosts(walletAddress);
          if (currentPlatform !== "all") {
            mockData = mockData.filter(p => p.payload.platform === currentPlatform);
          }
          if (activeTag) {
            mockData = mockData.filter(p => p.payload.tags?.includes(activeTag));
          }
          setPosts(mockData);
        }
      } finally {
        if (showSpinner && !cancelled) setLoading(false);
      }
    };

    fetchPosts();
    const refresh = () => {
      if (document.visibilityState === "visible") fetchPosts(false);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [walletAddress, resolvedIdentityKey, currentPlatform, activeTag, searchParams]);

  // Client-Side Cryptographic Decryption Function
  const requestExtensionDecrypt = (
    ciphertext: string,
    iv: string,
    mode: "text" | "bytes" = "text",
    keyAccess: { ownerKeyEnvelope?: Record<string, unknown> | null; recipientKeyEnvelope?: Record<string, unknown> | null } = {}
  ) => new Promise<{ plaintext: string; data: string }>((resolve, reject) => {
    const requestId = `decrypt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => { window.removeEventListener("message", onMessage); reject(new Error("Chamber Extension 解密逾時")); }, 30000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "DECRYPT_ECHO_CONTENT_RESPONSE" || event.data.requestId !== requestId) return;
      window.clearTimeout(timeout); window.removeEventListener("message", onMessage);
      if (!event.data.success) reject(new Error(event.data.error || "Owner 解密失敗"));
      else resolve({ plaintext: event.data.plaintext || "", data: event.data.data || "" });
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "echo-portal", type: "DECRYPT_ECHO_CONTENT", requestId, ciphertext, iv, mode, ...keyAccess }, window.location.origin);
  });

  // Alias/content-key identifies the stable Chamber timeline. Wallet addresses
  // may rotate during recovery, so they cannot be the sole ownership signal.
  // Actual access is still cryptographically enforced when the Extension tries
  // to unwrap the article envelope with its local owner key.
  const extensionOwnsTimeline = Boolean(extensionIdentity && (
    (normalizeIdentityAlias(extensionIdentity.identityAlias) &&
      normalizeIdentityAlias(extensionIdentity.identityAlias) === normalizeIdentityAlias(walletAddress)) ||
    (extensionIdentity.walletAddress && ownerWallet &&
      extensionIdentity.walletAddress.toLowerCase() === ownerWallet.toLowerCase())
  ));

  const isPostOwner = (post: PostItem) => Boolean(extensionOwnsTimeline && (
    !post.payload.identity_key ||
    post.payload.identity_key === resolvedIdentityKey ||
    normalizeIdentityAlias(post.payload.identity_alias) === normalizeIdentityAlias(walletAddress)
  ));

  const resolvePostKeyAccess = async (post: PostItem) => {
    if (!post.payload.key_envelope) {
      if (!isPostOwner(post)) throw new Error("這是舊版私密備份，目前只有擁有者可解密；作者需建立新版修訂後才能分享。");
      return {};
    }
    if (!extensionIdentity?.sharingKeyId) {
      if (isPostOwner(post)) return { ownerKeyEnvelope: post.payload.key_envelope };
      throw new Error("請先安裝並連結 Chamber Extension。");
    }
    const response = await fetch(`https://studio.milkcat.org/chamber-api/access/grants?postTxId=${encodeURIComponent(post.txId)}&requesterKeyId=${encodeURIComponent(extensionIdentity.sharingKeyId)}`, { cache: "no-store" });
    if (response.status === 404 && isPostOwner(post)) {
      return { ownerKeyEnvelope: post.payload.key_envelope };
    }
    if (!response.ok) throw new Error(response.status === 404 ? "尚未取得作者閱讀授權。" : "無法讀取文章授權。");
    const data = await response.json();
    return { recipientKeyEnvelope: data.grant?.recipientKeyEnvelope || null };
  };

  const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const bytesToBase64 = (bytes: Uint8Array) => { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };

  const reportDecryptIssue = (post: PostItem, message: string, details: Record<string, unknown> = {}) => {
    fetch("https://studio.milkcat.org/chamber-api/dev-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "echo:decrypt",
        message,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        details: { txId: post.txId, ...details }
      }),
      keepalive: true
    }).catch(() => {});
  };

  const decryptPostData = async (
    post: PostItem,
    onText: (text: string) => void,
    onMediaProgress: (completed: number, total: number, failed: number) => void
  ) => {
    const keyAccess = await resolvePostKeyAccess(post);
    const encryptedBlob: EncryptedBlob = JSON.parse(post.payload.content);
    const decryptedText = (await requestExtensionDecrypt(encryptedBlob.ciphertext, encryptedBlob.iv, "text", keyAccess)).plaintext;
    onText(decryptedText);

    const encryptedItems = (post.payload.media?.items || []).filter((item) => item.encrypted && item.iv);
    const decryptedByIndex: Array<string | null> = new Array(encryptedItems.length).fill(null);
    let nextIndex = 0;
    let completed = 0;
    let failed = 0;
    onMediaProgress(0, encryptedItems.length, 0);

    const worker = async () => {
      while (nextIndex < encryptedItems.length) {
        const itemIndex = nextIndex;
        nextIndex += 1;
        const item = encryptedItems[itemIndex];
        try {
          const response = await fetch(item.url, { cache: "force-cache" });
          if (!response.ok) throw new Error(`媒體下載失敗 (${response.status})`);
          const encryptedBytes = new Uint8Array(await response.arrayBuffer());
          const result = await requestExtensionDecrypt(bytesToBase64(encryptedBytes), item.iv || "", "bytes", keyAccess);
          const blob = new Blob([base64ToBytes(result.data)], { type: item.contentType || "image/jpeg" });
          decryptedByIndex[itemIndex] = URL.createObjectURL(blob);
        } catch (error) {
          failed += 1;
          reportDecryptIssue(post, error instanceof Error ? error.message : String(error), {
            mediaIndex: itemIndex + 1,
            mediaTotal: encryptedItems.length
          });
        } finally {
          completed += 1;
          onMediaProgress(completed, encryptedItems.length, failed);
        }
      }
    };

    const workerCount = Math.min(4, encryptedItems.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return {
      decryptedText,
      decryptedMedia: decryptedByIndex.filter((url): url is string => Boolean(url)),
      mediaFailed: failed,
      mediaTotal: encryptedItems.length
    };
  };

  const handleDecryptPost = async (post: PostItem, index: number) => {
    setPosts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, isDecrypting: true } : item));

    try {
      const { decryptedText, decryptedMedia, mediaFailed, mediaTotal } = await decryptPostData(
        post,
        (text) => setPosts((current) => current.map((item) => item.txId === post.txId ? { ...item, decryptedContent: text } : item)),
        (completed, total, failed) => setPosts((current) => current.map((item) => item.txId === post.txId
          ? { ...item, mediaDecryptCompleted: completed, mediaDecryptTotal: total, mediaDecryptFailed: failed }
          : item))
      );

      setPosts((current) => current.map((item) => item.txId === post.txId
        ? { ...item, decryptedContent: decryptedText, decryptedMedia, isDecrypting: false, mediaDecryptFailed: mediaFailed, mediaDecryptTotal: mediaTotal }
        : item));
      if (mediaFailed) setStatusMessage(`文章已解密；${mediaTotal - mediaFailed}/${mediaTotal} 張圖片成功，${mediaFailed} 張失敗。`);

    } catch (err: any) {
      console.error("[Chamber] Decryption error:", err);
      alert("解密失敗: " + err.message);
      setPosts((current) => current.map((item) => item.txId === post.txId ? { ...item, isDecrypting: false } : item));
    }
  };

  const handleDecryptAll = async () => {
    const targets = posts.filter((post) => post.payload.is_encrypted && !post.decryptedContent);
    if (!targets.length || isDecryptingAll) return;
    setIsDecryptingAll(true);
    let failures = 0;
    let mediaFailures = 0;
    let mediaTotal = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      setDecryptProgress(`${index + 1} / ${targets.length}`);
      setPosts((current) => current.map((item) => item.txId === target.txId ? { ...item, isDecrypting: true } : item));
      try {
        const result = await decryptPostData(
          target,
          (text) => setPosts((current) => current.map((item) => item.txId === target.txId ? { ...item, decryptedContent: text } : item)),
          (completed, total, failed) => setPosts((current) => current.map((item) => item.txId === target.txId
            ? { ...item, mediaDecryptCompleted: completed, mediaDecryptTotal: total, mediaDecryptFailed: failed }
            : item))
        );
        mediaFailures += result.mediaFailed;
        mediaTotal += result.mediaTotal;
        setPosts((current) => current.map((item) => item.txId === target.txId
          ? { ...item, decryptedContent: result.decryptedText, decryptedMedia: result.decryptedMedia, isDecrypting: false, mediaDecryptFailed: result.mediaFailed, mediaDecryptTotal: result.mediaTotal }
          : item));
      } catch (error) {
        failures += 1;
        console.error(`[Chamber] Failed to decrypt ${target.txId}:`, error);
        setPosts((current) => current.map((item) => item.txId === target.txId ? { ...item, isDecrypting: false } : item));
      }
    }
    setDecryptProgress("");
    setIsDecryptingAll(false);
    setStatusMessage(
      failures
        ? `已解密 ${targets.length - failures} 篇，${failures} 篇文字解密失敗。`
        : mediaFailures
          ? `已解密 ${targets.length} 篇；相簿圖片成功 ${mediaTotal - mediaFailures}/${mediaTotal} 張。`
          : `已解密目前時光軸的 ${targets.length} 篇備份。`
    );
  };

  const effectiveOwnerIdentityKey = posts.find((post) => post.payload.identity_key)?.payload.identity_key || resolvedIdentityKey || walletAddress;

  const createRecipientGrant = (
    ownerKeyEnvelope: Record<string, unknown>,
    recipientPublicKey: JsonWebKey,
    recipientKeyId: string
  ) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const requestId = `grant_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Chamber Extension 建立授權逾時"));
    }, 15000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "CREATE_ECHO_READING_GRANT_RESPONSE" || event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!event.data.success || !event.data.recipientKeyEnvelope) reject(new Error(event.data.error || "無法建立閱讀授權"));
      else resolve(event.data.recipientKeyEnvelope);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({
      source: "echo-portal",
      type: "CREATE_ECHO_READING_GRANT",
      requestId,
      ownerKeyEnvelope,
      recipientPublicKey,
      recipientKeyId
    }, window.location.origin);
  });

  const requestReadingAccess = async (post: PostItem) => {
    setAccessBusyId(post.txId);
    try {
      const identity = extensionIdentity || await requestExtensionIdentity();
      setExtensionIdentity(identity);
      const response = await fetch("https://studio.milkcat.org/chamber-api/access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postTxId: post.txId,
          ownerIdentityKey: post.payload.identity_key || effectiveOwnerIdentityKey,
          ownerAlias: walletAddress,
          requesterWallet: identity.walletAddress,
          requesterAlias: identity.identityAlias || identity.identityDisplayName || "",
          requesterKeyId: identity.sharingKeyId,
          requesterPublicKey: identity.sharingPublicKey
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "申請失敗");
      setStatusMessage(data.request?.status === "approved" ? "作者已允許閱讀，正在重新解鎖。" : "閱讀申請已送出，等待作者同意。");
      if (data.request?.status === "approved") await handleDecryptPost(post, posts.findIndex((item) => item.txId === post.txId));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "閱讀申請失敗");
    } finally {
      setAccessBusyId("");
    }
  };

  const decideReadingRequest = async (request: ReadingRequest, decision: "approved" | "rejected") => {
    setAccessBusyId(request.id);
    try {
      let recipientKeyEnvelope: Record<string, unknown> | null = null;
      if (decision === "approved") {
        const post = posts.find((item) => item.txId === request.postTxId);
        if (!post) throw new Error("請先回到包含這篇文章的 Echo 時光牆再核准。");
        if (!post.payload.key_envelope) throw new Error("這是舊版文章，請先從 Facebook 重新備份成新版後再分享。");
        recipientKeyEnvelope = await createRecipientGrant(post.payload.key_envelope, request.requesterPublicKey, request.requesterKeyId);
      }
      const response = await fetch(`https://studio.milkcat.org/chamber-api/access/requests/${encodeURIComponent(request.id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${extensionIdentity?.accessCapability || ""}` },
        body: JSON.stringify({ decision, recipientKeyEnvelope, ownerIdentityKey: effectiveOwnerIdentityKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "無法更新閱讀申請");
      setReadingRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: decision } : item));
      setStatusMessage(decision === "approved" ? "已允許對方閱讀這一篇；對方不會取得你的復原金鑰。" : "已拒絕閱讀申請。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "無法處理閱讀申請");
    } finally {
      setAccessBusyId("");
    }
  };

  useEffect(() => {
    if (loading || !posts.length || !extensionIdentity?.walletAddress) return;
    const ownerPosts = posts.filter((post) => post.payload.is_encrypted && !post.decryptedContent && isPostOwner(post));
    if (!ownerPosts.length) return;
    const key = `${extensionIdentity.sharingKeyId}:${ownerPosts.map((post) => post.txId).join(",")}`;
    if (autoUnlockKey.current === key) return;
    autoUnlockKey.current = key;
    (async () => {
      setIsDecryptingAll(true);
      for (const post of ownerPosts) {
        await handleDecryptPost(post, posts.findIndex((item) => item.txId === post.txId));
      }
      setIsDecryptingAll(false);
    })().catch(() => setIsDecryptingAll(false));
  }, [loading, posts, extensionIdentity?.walletAddress, extensionIdentity?.identityAlias, extensionIdentity?.sharingKeyId, walletAddress, resolvedIdentityKey]);

  useEffect(() => {
    if (!effectiveOwnerIdentityKey || !extensionIdentity?.walletAddress || !extensionOwnsTimeline) return;
    let cancelled = false;
    const loadRequests = async () => {
      try {
        const response = await fetch(`https://studio.milkcat.org/chamber-api/access/requests?ownerIdentityKey=${encodeURIComponent(effectiveOwnerIdentityKey)}`, {
          cache: "no-store",
          headers: { "Authorization": `Bearer ${extensionIdentity.accessCapability}` }
        });
        const data = await response.json();
        if (!cancelled && response.ok) setReadingRequests(data.requests || []);
      } catch (_) {}
    };
    loadRequests();
    const timer = window.setInterval(loadRequests, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [effectiveOwnerIdentityKey, extensionIdentity?.walletAddress, extensionOwnsTimeline]);

  const openAlbumViewer = (urls: string[], index: number, title: string) => {
    if (!urls.length) return;
    setAlbumViewer({ urls, index, title });
  };

  const stepAlbumViewer = (delta: number) => {
    setAlbumViewer((current) => current
      ? { ...current, index: (current.index + delta + current.urls.length) % current.urls.length }
      : null);
  };

  const platforms = [
    { id: "all", name: "✨ 全部流" },
    { id: "facebook", name: "👥 Facebook" },
    { id: "threads", name: "🧵 Threads" },
    { id: "x", name: "🐦 X (Twitter)" },
    { id: "instagram", name: "📸 Instagram" }
  ];
  const encryptedRemainingCount = posts.filter((post) => post.payload.is_encrypted && !post.decryptedContent).length;
  const pendingReadingRequests = readingRequests.filter((request) => request.status === "pending");
  const isTimelineOwner = extensionOwnsTimeline;
  const chamberIdentityLabel = extensionIdentity
    ? `@${extensionIdentity.identityAlias || extensionIdentity.identityDisplayName || `${extensionIdentity.walletAddress.slice(0, 6)}…${extensionIdentity.walletAddress.slice(-4)}`}`
    : "Chamber 未連結";
  const ownerInitials = (ownerDisplayName || walletAddress || "CH")
    .split(/\s+/)
    .map((part) => part.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();

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

          <div className="flex items-center gap-2">
            {isTimelineOwner && (
              <button
                onClick={() => setShowReadingRequests((current) => !current)}
                className="relative text-[10px] sm:text-xs text-slate-300 hover:text-indigo-200 bg-slate-900 hover:bg-indigo-950/50 border border-slate-800 px-2.5 py-2 rounded-full transition-colors"
              >
                🔔 閱讀申請
                {pendingReadingRequests.length > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[9px] text-white flex items-center justify-center">
                    {pendingReadingRequests.length}
                  </span>
                )}
              </button>
            )}
            <Link
              href="/guide"
              className="text-[10px] sm:text-xs text-slate-400 hover:text-indigo-300 transition-colors"
            >
              使用指南
            </Link>
            <div className="relative">
            {extensionIdentity ? (
              <div>
                <button
                  onClick={() => setIsHeaderDropdownOpen(!isHeaderDropdownOpen)}
                  className="flex items-center gap-2 bg-indigo-950/40 border border-indigo-900/60 px-3 py-1.5 rounded-full hover:border-indigo-500 hover:bg-indigo-950/60 transition-all text-left"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="max-w-32 truncate text-xs font-semibold text-indigo-200">
                    {chamberIdentityLabel}
                  </span>
                  <span className="text-[9px] text-indigo-400">▼</span>
                </button>

                {isHeaderDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                    <div className="border-b border-slate-800 px-4 py-2.5">
                      <div className="text-xs font-semibold text-indigo-200">{chamberIdentityLabel}</div>
                      <div className="mt-1 break-all font-mono text-[9px] text-slate-500">Chamber {extensionIdentity.walletAddress}</div>
                      {viewerWallet && viewerWallet.toLowerCase() !== extensionIdentity.walletAddress.toLowerCase() && (
                        <div className="mt-1 break-all text-[9px] text-amber-300/80">外部錢包 {viewerWallet.slice(0, 6)}…{viewerWallet.slice(-4)}（不決定文章擁有權）</div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowRecovery(true);
                        setIsHeaderDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-indigo-950/40 hover:text-indigo-200 transition-colors"
                    >
                      🛡️ 金鑰復原設定
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(extensionIdentity.walletAddress);
                        alert("Chamber 身分地址已複製！");
                        setIsHeaderDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-indigo-950/40 hover:text-indigo-200 transition-colors"
                    >
                      📋 複製錢包地址
                    </button>
                    {viewerWallet && (
                      <button
                        onClick={() => {
                          setIsHeaderDropdownOpen(false);
                          disconnectWallet();
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs text-rose-450 hover:bg-rose-950/20 hover:text-rose-300 border-t border-slate-800/60 transition-colors"
                      >
                        👋 斷開外部錢包
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="text-xs font-semibold border border-amber-800/60 bg-amber-950/30 hover:bg-amber-900/40 text-amber-200 px-4 py-2 rounded-full transition-all duration-200"
              >
                {chamberIdentityLabel}
              </button>
            )}
            </div>
          </div>
        </div>
      </header>

      {showRecovery && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-indigo-800/60 bg-slate-900 p-5 shadow-2xl shadow-indigo-950/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-indigo-100">2-of-3 金鑰復原</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  A 留在目前 Chrome 的 Chamber Extension；B 加密保存於 Recovery Vault；C 由您離線保存。任兩份可還原，Echo 只提供操作畫面，不保存完整金鑰。
                </p>
              </div>
              <button onClick={() => setShowRecovery(false)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-white">✕</button>
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              {recoveryConfigured ? (
                <div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg" aria-hidden="true">✅</span>
                    <div>
                      <h3 className="text-sm font-semibold text-emerald-300">復原設定已完成</h3>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">Extension A 與 Passkey 保護的 Vault B 已就緒；請繼續妥善保存你先前取得的 C。此處不保存或再次顯示 C。</p>
                    </div>
                  </div>
                  <details className="mt-3 border-t border-slate-800 pt-3">
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-amber-300">C 遺失或疑似外洩？產生新的 C</summary>
                    <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="輪替使用的 Passkey 提供者">
                      <button type="button" onClick={() => setPasskeyProvider("password-manager")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "password-manager" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>🔐 密碼管理器</button>
                      <button type="button" onClick={() => setPasskeyProvider("system")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "system" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>🖥️ 系統 Passkey</button>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-amber-200/70">需驗證現有 Passkey。系統會輪替 A、Vault B 與 C；完成後舊 C 立即失效。</p>
                    <button type="button" onClick={rotateRecoveryCode} disabled={recoveryBusy} className="mt-2 w-full rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/40 disabled:opacity-50">產生新的 C 並使舊 C 失效</button>
                  </details>
                </div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-slate-200">建立復原設定並產生 C</h3>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">Passkey 私鑰由 Bitwarden、Google Password Manager 或系統安全區保管，Chamber 不會取得或顯示它。完成後，Extension 保存 A、Vault 保存 B，並只顯示一次由你離線保存的 C。</p>
                  <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Passkey 提供者">
                    <button
                      type="button"
                      onClick={() => setPasskeyProvider("password-manager")}
                      disabled={recoveryBusy}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "password-manager" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}
                    >
                      🔐 密碼管理器
                      <span className="mt-1 block text-[9px] font-normal opacity-75">Bitwarden／1Password 等</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasskeyProvider("system")}
                      disabled={recoveryBusy}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "system" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}
                    >
                      🖥️ 系統 Passkey
                      <span className="mt-1 block text-[9px] font-normal opacity-75">Windows Hello／Chrome</span>
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-slate-500">建立與日後復原請選擇同一個提供者。若密碼管理器出現白窗，改用系統 Passkey。</p>
                  <button
                    onClick={setupRecoveryVault}
                    disabled={recoveryBusy || Boolean(pendingRecovery)}
                    className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {recoveryBusy ? "處理中..." : pendingRecovery ? "請先保存下方復原碼 C" : "建立復原設定並產生 C"}
                  </button>
                </>
              )}
            </div>

            <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-300 hover:text-indigo-200">遺失 Extension 或更換裝置？開啟還原工具</summary>
              <div className="mt-3 border-t border-slate-800 pt-3">
                <p className="text-[11px] leading-5 text-slate-500">只有已經建立過復原設定，且手上持有 C 時才使用這裡。同裝置可由 A+C 還原；Extension 遺失後，先通過原 Passkey 取回 B，再以 B+C 還原。</p>
                <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="還原使用的 Passkey 提供者">
                  <button type="button" onClick={() => setPasskeyProvider("password-manager")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "password-manager" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>🔐 密碼管理器</button>
                  <button type="button" onClick={() => setPasskeyProvider("system")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "system" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>🖥️ 系統 Passkey</button>
                </div>
                <label className="mt-3 block text-[11px] font-semibold text-slate-400" htmlFor="recovery-code-c">貼上你先前保存的緊急復原碼 C</label>
                <textarea
                  id="recovery-code-c"
                  value={recoveryCodeInput}
                  onChange={(event) => setRecoveryCodeInput(event.target.value)}
                  rows={3}
                  placeholder="CHAMBER-C1. ..."
                  className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-amber-200 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={restoreRecoveryVault}
                  disabled={recoveryBusy}
                  className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  以 B＋C 還原並建立新復原組
                </button>
                <button
                  onClick={restoreWithLocalAAndVaultB}
                  disabled={recoveryBusy}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-transparent px-4 py-2.5 text-xs font-semibold text-slate-400 hover:border-indigo-700 hover:text-indigo-200 disabled:opacity-50"
                >
                  本機 A 尚在：使用 Passkey Vault B 修復
                </button>
              </div>
            </details>

            {pendingRecovery && (
              <div className="mt-3 rounded-xl border border-amber-700/60 bg-amber-950/20 p-4">
                <h3 className="text-sm font-semibold text-amber-200">緊急復原碼 C</h3>
                <p className="mt-1 text-[11px] leading-5 text-amber-100/70">請保存到密碼管理器、手機安全區或紙本，不要只留在目前電腦。</p>
                <textarea readOnly value={pendingRecovery.recoveryCodeC} rows={4} className="mt-3 w-full resize-none rounded-lg border border-amber-800/70 bg-slate-950 p-3 font-mono text-[10px] text-amber-200" />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(pendingRecovery.recoveryCodeC);
                    setRecoveryStatus("復原碼 C 已複製；請貼到另一個安全位置後按完成。");
                  }}
                  className="mt-2 w-full rounded-lg bg-amber-800/50 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-700/60"
                >
                  📋 複製 C
                </button>
                <button
                  onClick={confirmRecoverySaved}
                  disabled={recoveryBusy}
                  className="mt-2 w-full rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  我已將 C 保存到其他地方
                </button>
              </div>
            )}

            {recoveryStatus && (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs leading-5 text-slate-300">{recoveryStatus}</div>
            )}
          </section>
        </div>
      )}

      {/* Main Flow */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">
        {!extensionIdentity && encryptedRemainingCount > 0 && (
          <div className="mb-5 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">
            <div className="font-semibold">尚未讀到這台 Chrome 的 Chamber 身分</div>
            <div className="mt-1 text-[10px] text-amber-100/70">鏈上備份仍在；請確認 Extension 已啟用，再重新載入此頁即可解鎖。MetaMask 地址不代表文章擁有者。</div>
          </div>
        )}
        {extensionIdentity && ownerWallet && !isTimelineOwner && (
          <div className="mb-5 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">
            目前登入的是 {chamberIdentityLabel}，不是這個 Echo 時光牆的 Chamber 身分，因此私密文章不會自動解鎖。
          </div>
        )}
        {showReadingRequests && isTimelineOwner && (
          <section className="mb-6 rounded-2xl border border-indigo-800/50 bg-slate-900/90 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-indigo-100">閱讀申請</h2>
                <p className="mt-1 text-[9px] text-slate-500">核准操作在 Echo 完成，文章金鑰只由本機 Chamber Extension 處理。</p>
              </div>
              <button onClick={() => setShowReadingRequests(false)} className="text-xs text-slate-500 hover:text-white">✕</button>
            </div>
            {readingRequests.length === 0 ? (
              <div className="rounded-xl bg-slate-950/60 p-4 text-center text-xs text-slate-500">目前沒有閱讀申請。</div>
            ) : (
              <div className="space-y-3">
                {readingRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-xs font-semibold text-slate-200">
                      {request.requesterAlias ? `@${request.requesterAlias}` : `${request.requesterWallet.slice(0, 8)}…${request.requesterWallet.slice(-6)}`}
                    </div>
                    {request.requesterAlias && <div className="mt-0.5 font-mono text-[9px] text-slate-600">{request.requesterWallet.slice(0, 8)}…{request.requesterWallet.slice(-6)}</div>}
                    <div className="mt-1 text-[9px] text-slate-500">文章 {request.postTxId.slice(0, 10)}… · {new Date(request.createdAt).toLocaleString("zh-TW")}</div>
                    {request.status === "pending" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => decideReadingRequest(request, "approved")}
                          disabled={accessBusyId === request.id}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          允許這一篇
                        </button>
                        <button
                          onClick={() => decideReadingRequest(request, "rejected")}
                          disabled={accessBusyId === request.id}
                          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                        >
                          拒絕
                        </button>
                      </div>
                    ) : (
                      <div className={`mt-2 text-[10px] ${request.status === "approved" ? "text-emerald-400" : "text-slate-500"}`}>
                        {request.status === "approved" ? "✅ 已允許單篇閱讀" : "已拒絕"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {/* Creator Info */}
        <div className="mb-6 p-4 bg-gradient-to-b from-slate-900/80 to-slate-950 border border-slate-900/30 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-0.5 shadow-md">
              <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center font-bold text-sm text-slate-100">
                {ownerInitials}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                {ownerDisplayName || walletAddress} <span className="font-normal text-slate-500">(Chamber Creator)</span>
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
                href={`/${walletAddress}/${p.id}?${new URLSearchParams({
                  ...(activeTag ? { tag: activeTag } : {}),
                  ...(showHistory ? { history: "true" } : {}),
                  ...(network === "mainnet" ? { network: "mainnet" } : {})
                }).toString()}`}
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

        {focusTxId && (
          <div className="mb-5 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-indigo-200">正在查看單篇備份</div>
              <div className="text-[9px] text-slate-500 mt-0.5">其他文章仍保留在完整 Echo 時光牆中</div>
            </div>
            <Link
              href={`/${walletAddress}/${currentPlatform}?${(() => {
                const query = new URLSearchParams(searchParams.toString());
                query.delete("post");
                return query.toString();
              })()}`}
              className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg transition-colors"
            >
              返回完整時光牆
            </Link>
          </div>
        )}

        {encryptedRemainingCount > 0 && isTimelineOwner && (
          <div className="mb-5 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-indigo-200">🔐 私密回音牆</div>
              <div className="text-[9px] text-slate-500 mt-0.5">登入後會自動解鎖；若未完成可手動重試 {encryptedRemainingCount} 篇</div>
            </div>
            <button
              onClick={handleDecryptAll}
              disabled={isDecryptingAll}
              className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-3.5 py-2 rounded-lg transition-colors"
            >
              {isDecryptingAll ? `自動解鎖中 ${decryptProgress}` : "重新解鎖"}
            </button>
          </div>
        )}

        {statusMessage && <div className="mb-4 text-[10px] text-emerald-400">{statusMessage}</div>}

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
              const storedMediaUrls = Array.isArray(post.payload.media?.urls) && post.payload.media.urls.length > 0
                ? post.payload.media.urls.filter(Boolean)
                : [post.payload.media?.primary_fb_cdn, post.payload.media?.fallback_backup].filter(Boolean) as string[];
              const mediaUrls = post.payload.is_encrypted ? (post.decryptedMedia || []) : storedMediaUrls;

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
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">{formattedTime}</div>
                        </div>
                      </div>
                      <a
                        href={`${irysHost}/${post.txId}`}
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
                          <div className="bg-emerald-950/10 border border-emerald-900/30 p-3 rounded-xl text-slate-200 relative whitespace-pre-wrap break-words">
                            <span className="absolute top-2 right-2 text-[9px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded font-mono">已解密</span>
                            {post.decryptedContent}
                          </div>
                        ) : (
                          <div className="bg-slate-950 border border-indigo-950/40 p-4 rounded-xl text-center flex flex-col items-center gap-2.5">
                            <div className="text-lg">🔒</div>
                            <div>
                              <div className="text-xs font-semibold text-slate-300">私密加密文章</div>
                              <p className="text-[9px] text-slate-500 mt-1">
                                {isPostOwner(post) ? "正在使用你的 Chamber 身分自動解鎖" : "只有作者核准的 Chamber 身分可以閱讀"}
                              </p>
                            </div>
                            {isPostOwner(post) ? (
                              <button
                                onClick={() => handleDecryptPost(post, idx)}
                                disabled={post.isDecrypting}
                                className="text-xs bg-indigo-600/80 hover:bg-indigo-500 text-indigo-100 px-4.5 py-1.5 rounded-lg border border-indigo-500/20 transition-all"
                              >
                                {post.isDecrypting ? "🔑 自動解鎖中..." : "重新解鎖"}
                              </button>
                            ) : post.payload.key_envelope ? (
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => requestReadingAccess(post)}
                                  disabled={accessBusyId === post.txId}
                                  className="text-xs bg-indigo-600/80 hover:bg-indigo-500 text-indigo-100 px-4.5 py-1.5 rounded-lg border border-indigo-500/20 transition-all disabled:opacity-50"
                                >
                                  {accessBusyId === post.txId ? "送出中..." : "向作者申請閱讀"}
                                </button>
                                <button
                                  onClick={() => handleDecryptPost(post, idx)}
                                  disabled={post.isDecrypting}
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300"
                                >
                                  已獲准？重新解鎖
                                </button>
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-400">舊版文章需由作者重新備份後才能分享</div>
                            )}
                          </div>
                        )
                      ) : (
                        post.payload.content
                      )}
                    </div>

                    {post.isDecrypting && Boolean(post.mediaDecryptTotal) && (
                      <div className="mt-2 text-[10px] text-indigo-300">
                        正在解密相簿圖片 {post.mediaDecryptCompleted || 0}/{post.mediaDecryptTotal}
                        {Boolean(post.mediaDecryptFailed) && ` · ${post.mediaDecryptFailed} 張失敗`}
                      </div>
                    )}
                    {!post.isDecrypting && Boolean(post.mediaDecryptFailed) && (
                      <div className="mt-2 text-[10px] text-amber-400">
                        相簿已部分解密：成功 {(post.mediaDecryptTotal || 0) - (post.mediaDecryptFailed || 0)}/{post.mediaDecryptTotal || 0} 張
                      </div>
                    )}

                    {post.payload.media?.video && (
                      <div className="mt-3.5 rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-semibold text-indigo-200">
                              🎬 影片來源 · {post.payload.media.video_backup_status === "complete"
                                ? "完整影片備份"
                                : post.payload.media.video_backup_status === "poster_only"
                                  ? "網址與封面備份"
                                  : "網址備份"}
                            </div>
                            <div className="mt-1 text-[9px] text-slate-500 break-all">
                              {post.payload.media.video_source_url || post.payload.source_url || "未提供影片來源網址"}
                            </div>
                          </div>
                          {(post.payload.media.video_source_url || post.payload.source_url) && (
                            <a
                              href={post.payload.media.video_source_url || post.payload.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition-colors"
                            >
                              開啟影片
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tags List block */}
                    {postTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3.5">
                        {postTags.map((tag) => (
                          <Link
                            key={tag}
                            href={`/${walletAddress}/${currentPlatform}?${new URLSearchParams({
                              tag,
                              ...(showHistory ? { history: "true" } : {}),
                              ...(network === "mainnet" ? { network: "mainnet" } : {})
                            }).toString()}`}
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
                    {mediaUrls.length > 0 && (
                      <div className="mt-3.5 rounded-xl overflow-hidden border border-slate-900 bg-slate-950">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-900 text-[10px] text-slate-400">
                          <span>{post.payload.media?.video
                            ? "影片封面"
                            : post.payload.media?.album || mediaUrls.length > 1 ? `相簿 · ${mediaUrls.length} 張` : "媒體"}</span>
                          {post.payload.media?.album_complete === false && (
                            <span className="text-amber-400">未完整取得</span>
                          )}
                        </div>
                        <div className={`grid gap-1.5 ${mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                          {mediaUrls.map((mediaUrl, mediaIndex) => (
                            <button
                              type="button"
                              key={`${post.txId}-media-${mediaIndex}`}
                              onClick={() => openAlbumViewer(mediaUrls, mediaIndex, post.payload.media?.album ? "相簿" : "備份媒體")}
                              className="aspect-square flex items-center justify-center overflow-hidden bg-slate-950 cursor-zoom-in"
                              title="開啟相簿瀏覽器"
                            >
                              <img
                                src={mediaUrl}
                                alt={`Platform media ${mediaIndex + 1}`}
                                className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  const fallback = mediaIndex === 0 ? post.payload.media?.fallback_backup : "";
                                  if (!post.payload.is_encrypted && fallback && target.src !== fallback) target.src = fallback;
                                }}
                              />
                            </button>
                          ))}
                        </div>
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
        <Link href="/guide" className="inline-block mt-1.5 text-indigo-500 hover:text-indigo-300 hover:underline">
          安裝與使用指南
        </Link>
      </footer>

      {albumViewer && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="相簿瀏覽器"
          onClick={() => setAlbumViewer(null)}
          onTouchStart={(event) => { albumTouchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            if (albumTouchStartX.current === null) return;
            const delta = (event.changedTouches[0]?.clientX ?? albumTouchStartX.current) - albumTouchStartX.current;
            albumTouchStartX.current = null;
            if (Math.abs(delta) >= 50) stepAlbumViewer(delta > 0 ? -1 : 1);
          }}
          onWheel={(event) => {
            const now = Date.now();
            if (Math.abs(event.deltaY) < 30 || now - albumLastWheelAt.current < 350) return;
            albumLastWheelAt.current = now;
            stepAlbumViewer(event.deltaY > 0 ? 1 : -1);
          }}
        >
          <div className="relative w-full h-full max-w-6xl max-h-[92vh] flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between text-sm text-slate-200 pb-3">
              <span>{albumViewer.title} · {albumViewer.index + 1} / {albumViewer.urls.length}</span>
              <div className="flex items-center gap-2">
                <a href={albumViewer.urls[albumViewer.index]} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">另開圖片</a>
                <button type="button" onClick={() => setAlbumViewer(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">Esc 關閉</button>
              </div>
            </div>
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              <img src={albumViewer.urls[albumViewer.index]} alt={`${albumViewer.title} ${albumViewer.index + 1}`} className="max-w-full max-h-full object-contain select-none" />
              {albumViewer.urls.length > 1 && (
                <>
                  <button type="button" onClick={() => stepAlbumViewer(-1)} aria-label="上一張" className="absolute left-2 md:left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-indigo-600 text-2xl">‹</button>
                  <button type="button" onClick={() => stepAlbumViewer(1)} aria-label="下一張" className="absolute right-2 md:right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-indigo-600 text-2xl">›</button>
                </>
              )}
            </div>
            <div className="pt-3 overflow-x-auto flex gap-2 justify-start md:justify-center">
              {albumViewer.urls.map((url, index) => (
                <button type="button" key={`${url}-${index}`} onClick={() => setAlbumViewer((current) => current ? { ...current, index } : null)} className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${index === albumViewer.index ? "border-indigo-400" : "border-transparent opacity-60 hover:opacity-100"}`}>
                  <img src={url} alt={`縮圖 ${index + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
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
