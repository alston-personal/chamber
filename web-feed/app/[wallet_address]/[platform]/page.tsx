"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { ethers } from "ethers";
import { startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/locale-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { feedTranslate } from "@/lib/feed-i18n";
import CatMorphingCard from "../../components/CatMorphingCard";
import RealLeopardCatCard from "../../components/RealLeopardCatCard";

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
  published_at?: number | null;
  authorName?: string | null;
  source_author?: { name?: string; url?: string | null } | null;
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

const TIMELINE_THEMES = [
  { id: "obsidian", name: "極簡黑曜", icon: "⬛", desc: "鈦灰石墨經典沉穩", badge: "經典" },
  { id: "cyber", name: "賽博霓光", icon: "🌌", desc: "深空宇宙星夜霓虹", badge: "極客" },
  { id: "amber", name: "復古暖琥珀", icon: "🍂", desc: "復古牛皮紙典雅暖光", badge: "質感" },
  { id: "emerald", name: "深林青翠", icon: "🌿", desc: "自然翡翠沉靜深綠", badge: "靜謐" },
  { id: "sakura", name: "櫻花暮夜", icon: "🌸", desc: "暮色櫻粉金屬光澤", badge: "限定" },
  { id: "custom", name: "自訂主題", icon: "🎨", desc: "自訂色彩或匯入主題包", badge: "客製" },
];

export interface CustomThemeConfig {
  name: string;
  bgPage: string;
  bgCard: string;
  borderCard: string;
  accentPrimary: string;
  accentText: string;
}

const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  name: "我的客製主題",
  bgPage: "#0a0f1d",
  bgCard: "#121b2f",
  borderCard: "#1f2e4d",
  accentPrimary: "#38bdf8",
  accentText: "#7dd3fc",
};

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
  sharingKeyId?: string;
  sharingPublicKey?: JsonWebKey | null;
  accessCapability: string;
}

interface ReadingRequest {
  id: string;
  postTxId: string;
  requesterWallet: string;
  requesterAlias?: string;
  requesterNote?: string;
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

function preservePostRuntimeState(incoming: PostItem[], current: PostItem[]) {
  const previousByTx = new Map(current.map((post) => [post.txId, post]));
  return incoming.map((post) => {
    const previous = previousByTx.get(post.txId);
    if (!previous) return post;
    return {
      ...post,
      decryptedContent: previous.decryptedContent,
      decryptedMedia: previous.decryptedMedia,
      isDecrypting: previous.isDecrypting,
      mediaDecryptTotal: previous.mediaDecryptTotal,
      mediaDecryptCompleted: previous.mediaDecryptCompleted,
      mediaDecryptFailed: previous.mediaDecryptFailed,
    };
  });
}

export default function PlatformFeed({
  params,
}: {
  params: Promise<{ wallet_address: string; platform: string }>;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const ft = (key: Parameters<typeof feedTranslate>[1], variables?: Record<string, string | number>) => feedTranslate(locale, key, variables);
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
  const [copiedC, setCopiedC] = useState<boolean>(false);
  const [passkeyProvider, setPasskeyProvider] = useState<"password-manager" | "system">("password-manager");
  const [recoveryConfigured, setRecoveryConfigured] = useState<boolean>(false);
  const [pairingStatus, setPairingStatus] = useState<string>("");
  const [showPairingModal, setShowPairingModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortMode, setSortMode] = useState<"backup" | "published">("backup");
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [currentTheme, setCurrentTheme] = useState<string>("obsidian");
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState<boolean>(false);
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);
  const [showSkinModal, setShowSkinModal] = useState<boolean>(false);
  const [savedWallSkin, setSavedWallSkin] = useState<string>("leopard");
  const [customTheme, setCustomTheme] = useState<CustomThemeConfig>(DEFAULT_CUSTOM_THEME);
  const [themeJsonInput, setThemeJsonInput] = useState<string>("");
  const [themeModalTab, setThemeModalTab] = useState<"picker" | "json">("picker");
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

  const [availableProfiles, setAvailableProfiles] = useState<{ id: string; name: string; alias: string; walletAddress: string }[]>([]);
  const [transferModal, setTransferModal] = useState<{ isOpen: boolean; authorName: string; count: number } | null>(null);
  const [transferTargetAlias, setTransferTargetAlias] = useState<string>("");
  const [transferBusy, setTransferBusy] = useState<boolean>(false);
  const [transferStatus, setTransferStatus] = useState<string>("");
  const [transferMode, setTransferMode] = useState<"local" | "custom">("local");

  const requestExtensionProfiles = () => new Promise<{ id: string; name: string; alias: string; walletAddress: string }[]>((resolve) => {
    const requestId = `profiles_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve([]);
    }, 2000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "EXTENSION_PROFILES_RESPONSE") return;
      if (event.data.requestId && event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data.profiles || []);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "echo-portal", type: "GET_EXTENSION_PROFILES", requestId }, window.location.origin);
  });

  const requestExtensionIdentity = () => new Promise<ExtensionIdentity>((resolve, reject) => {
    const requestId = `identity_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(ft("extensionMissing")));
    }, 2500);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "EXTENSION_WALLET_RESPONSE") return;
      if (event.data.requestId && event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!event.data.walletAddress || !event.data.sharingKeyId || !event.data.sharingPublicKey) {
        reject(new Error(ft("sharingKeyMissing")));
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
      reject(new Error(type.startsWith("NATIVE_PASSKEY_") ? ft("systemPasskeyTimeout") : ft("extensionNoResponse")));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== responseType || event.data?.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!event.data.success) reject(new Error(event.data.error || ft("recoveryFailed")));
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
            reject(new Error(ft("passwordManagerTimeout")));
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
          setRecoveryStatus(ft("recoveryPendingC"));
        } else if (status.confirmed) {
          setRecoveryStatus(ft("recoveryComplete"));
        }
      })
      .catch((error) => setRecoveryStatus(ft("recoveryStatusFailed", { error: error.message })));
  }, [showRecovery]);

  const setupRecoveryVault = async () => {
    let registrationSession: { accountId: string; setupToken: string } | null = null;
    let registrationVerified = false;
    setRecoveryBusy(true);
    setRecoveryStatus(ft("creatingShares"));
    try {
      const prepared = await requestExtensionRecovery<any>("PREPARE_RECOVERY_VAULT");
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareB: prepared.shareB }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || ft("passkeySetupFailed"));
      registrationSession = {
        accountId: optionsData.registration.accountId,
        setupToken: optionsData.registration.setupToken,
      };
      setRecoveryStatus(passkeyProvider === "system"
        ? ft("waitingSystemPasskey")
        : ft("waitingManagerPasskey"));
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
      if (!verifyResponse.ok || !verifyData.registration?.verified) throw new Error(verifyData.error || ft("passkeyVerifyFailed"));
      registrationVerified = true;
      const finalized = await requestExtensionRecovery<any>("FINALIZE_RECOVERY_VAULT", {
        setId: prepared.setId,
        accountId: optionsData.registration.accountId,
      });
      setPendingRecovery({ setId: finalized.setId, recoveryCodeC: finalized.recoveryCodeC });
      setRecoveryStatus(ft("setupSaveC"));
    } catch (error: any) {
      setRecoveryStatus(ft("setupFailed", { error: error.message }));
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
      setRecoveryStatus(ft("setupConfirmed"));
      setPendingRecovery(null);
      setRecoveryConfigured(true);
    } catch (error: any) {
      setRecoveryStatus(ft("confirmFailed", { error: error.message }));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const rotateRecoveryCode = async () => {
    if (!window.confirm(ft("rotateConfirm"))) return;
    setRecoveryBusy(true);
    setRecoveryStatus(ft("rotateChecking"));
    try {
      const status = await requestExtensionRecovery<any>("GET_RECOVERY_VAULT_STATUS");
      if (!status.confirmed || !status.hasLocalA || !status.accountId) throw new Error(ft("rotateUnavailable"));
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || ft("passkeyReadFailed"));
      const passkeyResponse = await authenticatePasskey(optionsData.authentication.options);
      const verifyResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId, response: passkeyResponse }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.authentication?.verified) throw new Error(verifyData.error || ft("passkeyVerifyFailed"));

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
      if (!rotateResponse.ok) throw new Error(rotateData.error || ft("vaultRotateFailed"));
      const finalized = await requestExtensionRecovery<any>("FINALIZE_RECOVERY_VAULT", {
        setId: prepared.setId,
        accountId: status.accountId,
      });
      setPendingRecovery({ setId: finalized.setId, recoveryCodeC: finalized.recoveryCodeC });
      setRecoveryConfigured(false);
      setRecoveryStatus(ft("rotateSaveC"));
    } catch (error: any) {
      setRecoveryStatus(ft("rotateFailed", { error: error.message }));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const restoreWithLocalAAndVaultB = async () => {
    setRecoveryBusy(true);
    setRecoveryStatus(ft("repairChecking"));
    try {
      const status = await requestExtensionRecovery<any>("GET_RECOVERY_VAULT_STATUS");
      if (!status.hasLocalA || !status.accountId) throw new Error(ft("repairUnavailable"));
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || ft("passkeyReadFailed"));
      const passkeyResponse = await authenticatePasskey(optionsData.authentication.options);
      const verifyResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: status.accountId, response: passkeyResponse }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.authentication?.verified) throw new Error(verifyData.error || ft("passkeyVerifyFailed"));
      await requestExtensionRecovery("RESTORE_RECOVERY_AB", { shareB: verifyData.authentication.shareB });
      setRecoveryStatus(ft("repairSuccess"));
    } catch (error: any) {
      setRecoveryStatus(ft("repairFailed", { error: error.message }));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const restoreRecoveryVault = async () => {
    if (!recoveryCodeInput.trim()) {
      setRecoveryStatus(ft("pasteC"));
      return;
    }
    setRecoveryBusy(true);
    setRecoveryStatus(ft("checkingLocalC"));
    try {
      try {
        const localRestored = await requestExtensionRecovery<any>("RESTORE_RECOVERY_VAULT", { recoveryCodeC: recoveryCodeInput.trim() });
        if (localRestored.local) {
          setRecoveryCodeInput("");
          setRecoveryStatus(ft("localCSuccess"));
          return;
        }
      } catch (_) {
        // A is absent or belongs to another set; continue with Passkey + B+C.
      }
      const normalizedRecoveryCode = recoveryCodeInput.trim();
      if (!normalizedRecoveryCode.startsWith("CHAMBER-C1.")) throw new Error(ft("invalidC"));
      const encoded = normalizedRecoveryCode.slice("CHAMBER-C1.".length).replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
      const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
      if (!decoded.accountId) throw new Error(ft("incompleteC"));
      setRecoveryStatus(ft("authenticateForB"));
      const optionsResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: decoded.accountId }),
      });
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsData.error || ft("passkeyReadFailed"));
      const passkeyResponse = await authenticatePasskey(optionsData.authentication.options);
      const verifyResponse = await fetch("https://studio.milkcat.org/chamber-api/recovery/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: decoded.accountId, response: passkeyResponse }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.authentication?.verified) throw new Error(verifyData.error || ft("passkeyVerifyFailed"));
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
      if (!rotateResponse.ok) throw new Error(rotateData.error || ft("vaultRotateFailed"));
      setRecoveryCodeInput("");
      setRecoveryStatus(ft("restoreSuccess"));
    } catch (error: any) {
      setRecoveryStatus(ft("restoreFailed", { error: error.message }));
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
      if (searchParams.get("requests") === "true") {
        setShowReadingRequests(true);
      }
      const saved = localStorage.getItem("chamber_logged_in_wallet");
      if (saved) {
        setViewerWallet(saved);
      }
      try {
        const savedCustom = localStorage.getItem("chamber_custom_theme_config");
        if (savedCustom) {
          const parsed = JSON.parse(savedCustom);
          setCustomTheme(parsed);
        }
      } catch (_) {}

      const savedTheme = localStorage.getItem("chamber_timeline_theme") || "obsidian";
      setCurrentTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, [params, searchParams]);

  // Auto-redirect if URL was /echo/all or /echo/all/all and user is connected via extension
  useEffect(() => {
    if (walletAddress === "all" && extensionIdentity?.identityAlias && extensionIdentity.identityAlias !== "all") {
      window.location.replace(`https://studio.milkcat.org/echo/${encodeURIComponent(extensionIdentity.identityAlias)}/all${window.location.search}`);
    }
  }, [walletAddress, extensionIdentity?.identityAlias]);

  const applyTheme = (themeId: string, configToUse?: CustomThemeConfig) => {
    setCurrentTheme(themeId);
    if (typeof window !== "undefined") {
      localStorage.setItem("chamber_timeline_theme", themeId);
      document.documentElement.setAttribute("data-theme", themeId);
      if (themeId === "custom") {
        const cfg = configToUse || customTheme;
        document.documentElement.style.setProperty("--bg-page", cfg.bgPage);
        document.documentElement.style.setProperty("--bg-card", cfg.bgCard);
        document.documentElement.style.setProperty("--border-card", cfg.borderCard);
        document.documentElement.style.setProperty("--accent-primary", cfg.accentPrimary);
        document.documentElement.style.setProperty("--accent-text", cfg.accentText);
        document.documentElement.style.setProperty("--accent-glow", `${cfg.accentPrimary}33`);
        document.documentElement.style.setProperty("--node-color", cfg.accentPrimary);
        document.documentElement.style.setProperty("--tag-bg", cfg.bgCard);
      } else {
        document.documentElement.style.removeProperty("--bg-page");
        document.documentElement.style.removeProperty("--bg-card");
        document.documentElement.style.removeProperty("--border-card");
        document.documentElement.style.removeProperty("--accent-primary");
        document.documentElement.style.removeProperty("--accent-text");
        document.documentElement.style.removeProperty("--accent-glow");
        document.documentElement.style.removeProperty("--node-color");
        document.documentElement.style.removeProperty("--tag-bg");
      }
    }
    setIsThemeMenuOpen(false);
  };

  const selectTheme = (themeId: string) => {
    if (themeId === "custom") {
      setShowThemeModal(true);
    } else {
      applyTheme(themeId);
    }
  };

  const saveAndApplyCustomTheme = (newConfig: CustomThemeConfig) => {
    setCustomTheme(newConfig);
    if (typeof window !== "undefined") {
      localStorage.setItem("chamber_custom_theme_config", JSON.stringify(newConfig));
    }
    applyTheme("custom", newConfig);
    setShowThemeModal(false);
  };

  useEffect(() => {
    let cancelled = false;
    const checkLocalMobileIdentity = (): ExtensionIdentity | null => {
      if (typeof window === "undefined") return null;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.endsWith("nativeWalletPrivateKey")) {
          const prefix = key.replace("nativeWalletPrivateKey", "");
          const address = localStorage.getItem(prefix + "nativeWalletAddress") || localStorage.getItem("chamber_logged_in_wallet") || "";
          const alias = localStorage.getItem(prefix + "identityAlias") || walletAddress || "";
          if (address) {
            return {
              walletAddress: address,
              identityAlias: alias,
              identityDisplayName: alias,
              sharingKeyId: "",
              sharingPublicKey: null,
              accessCapability: "owner",
            };
          }
        }
      }
      return null;
    };

    const initialLocal = checkLocalMobileIdentity();
    if (initialLocal) {
      setExtensionIdentity(initialLocal);
    }

    const syncExtensionIdentity = () => {
      requestExtensionIdentity().then((identity) => {
        if (!cancelled) setExtensionIdentity(identity);
      }).catch(() => {
        const localMobile = checkLocalMobileIdentity();
        if (!cancelled && localMobile) setExtensionIdentity(localMobile);
      });
      requestExtensionProfiles().then((profs) => {
        if (!cancelled && profs.length) setAvailableProfiles(profs);
      }).catch(() => {});
    };
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

  function parseDeviceModel() {
    if (typeof navigator === "undefined") return "行動裝置";
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return "iPhone (iOS)";
    if (/iPad/i.test(ua)) return "iPad (iPadOS)";
    if (/Android/i.test(ua)) {
      const match = ua.match(/Android\s+[\d\.]+;\s*([^;)]+)/);
      return match ? match[1].trim() : "Android 手機";
    }
    if (/Macintosh/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "Windows PC";
    return "行動裝置";
  }

  useEffect(() => {
    const pairId = searchParams.get("pair");
    if (!pairId) return;

    setShowPairingModal(true);
    setPairingStatus("⌛ 正在讀取並驗證手機 QR Code 配對憑證...");

    fetch("https://studio.milkcat.org/chamber-api/recovery/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingId: pairId, deviceModel: parseDeviceModel() }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.payload) throw new Error(data.error || "配對連結無效或已過期");
        const payload = data.payload;
        const prefix = `user_${payload.ownerUserId}_`;
        const effectiveAlias = payload.identityAlias || walletAddress || "";
        localStorage.setItem(prefix + "nativeWalletAddress", payload.walletAddress);
        localStorage.setItem(prefix + "nativeWalletPrivateKey", payload.walletPrivateKey);
        localStorage.setItem(prefix + "identityAlias", effectiveAlias);
        localStorage.setItem("chamber_logged_in_wallet", payload.walletAddress);

        setExtensionIdentity({
          walletAddress: payload.walletAddress,
          identityAlias: effectiveAlias,
          identityDisplayName: effectiveAlias,
          sharingKeyId: "",
          sharingPublicKey: null,
          accessCapability: "owner",
        });

        setPairingStatus("🎉 手機配對成功！已升格為受信任裝置，文章解密已解鎖！");
        setTimeout(() => {
          setShowPairingModal(false);
          window.location.href = window.location.pathname;
        }, 1500);
      })
      .catch((err) => {
        setPairingStatus(`❌ 手機配對失敗：${err.message}`);
      });
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
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [albumViewer]);



  // Client-Side Cryptographic Decryption Function (Supporting both Chrome Extension and Mobile Local Storage WebCrypto)
  const requestExtensionDecrypt = async (
    ciphertext: string,
    iv: string,
    mode: "text" | "bytes" = "text",
    keyAccess: { ownerKeyEnvelope?: Record<string, unknown> | null; recipientKeyEnvelope?: Record<string, unknown> | null } = {}
  ): Promise<{ plaintext: string; data: string }> => {
    const base64ToBytes = (str: string) => {
      const bin = atob(str);
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    };
    const bytesToBase64 = (bytes: Uint8Array) => {
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    };

    const targetCipherBytes = base64ToBytes(ciphertext);
    const targetIvBytes = base64ToBytes(iv);

    // 1. If we have recipientKeyEnvelope and guest sharing key in localStorage, decrypt with native ECDH in browser!
    if (keyAccess?.recipientKeyEnvelope && (keyAccess.recipientKeyEnvelope as any).ephemeral_public_key) {
      let guestPrivKeyJwk: JsonWebKey | null = null;
      if (typeof window !== "undefined") {
        const guestKeyJson = localStorage.getItem("chamber_guest_sharing_key");
        if (guestKeyJson) {
          try { guestPrivKeyJwk = JSON.parse(guestKeyJson).sharingPrivateKey; } catch (_) {}
        }
      }
      if (guestPrivKeyJwk) {
        try {
          const env = keyAccess.recipientKeyEnvelope as any;
          const privKey = await crypto.subtle.importKey("jwk", guestPrivKeyJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
          const pubKey = await crypto.subtle.importKey("jwk", env.ephemeral_public_key, { name: "ECDH", namedCurve: "P-256" }, false, []);
          const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pubKey }, privKey, 256));
          const digest = await crypto.subtle.digest("SHA-256", shared);
          const wrappingKey = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
          const postKeyBytes = new Uint8Array(await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToBytes(env.iv) },
            wrappingKey,
            base64ToBytes(env.wrapped_key)
          ));
          const postKey = await crypto.subtle.importKey("raw", postKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
          const decryptedBytes = new Uint8Array(await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: targetIvBytes },
            postKey,
            targetCipherBytes
          ));
          return {
            plaintext: mode === "bytes" ? "" : new TextDecoder().decode(decryptedBytes),
            data: mode === "bytes" ? bytesToBase64(decryptedBytes) : "",
          };
        } catch (decryptErr) {
          console.error("[Chamber] Guest ECDH recipient decryption error:", decryptErr);
        }
      }
    }

    // 2. If we have local private key stored in mobile localStorage, perform instant local WebCrypto decryption!
    let localPrivateKey = "";
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.endsWith("nativeWalletPrivateKey")) {
          localPrivateKey = localStorage.getItem(key) || "";
          if (localPrivateKey) break;
        }
      }
    }

    if (localPrivateKey) {
      const deriveKey = async (secretHex: string) => {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secretHex));
        return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      };

      if (keyAccess?.ownerKeyEnvelope && (keyAccess.ownerKeyEnvelope as any).wrapped_key) {
        const env = keyAccess.ownerKeyEnvelope as any;
        const ownerKey = await deriveKey(localPrivateKey);
        const postKeyBytes = new Uint8Array(await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(env.iv) },
          ownerKey,
          base64ToBytes(env.wrapped_key)
        ));
        const postKey = await crypto.subtle.importKey("raw", postKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
        const decryptedBytes = new Uint8Array(await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: targetIvBytes },
          postKey,
          targetCipherBytes
        ));
        return {
          plaintext: mode === "bytes" ? "" : new TextDecoder().decode(decryptedBytes),
          data: mode === "bytes" ? bytesToBase64(decryptedBytes) : "",
        };
      } else {
        const ownerKey = await deriveKey(localPrivateKey);
        const decryptedBytes = new Uint8Array(await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: targetIvBytes },
          ownerKey,
          targetCipherBytes
        ));
        return {
          plaintext: mode === "bytes" ? "" : new TextDecoder().decode(decryptedBytes),
          data: mode === "bytes" ? bytesToBase64(decryptedBytes) : "",
        };
      }
    }

    // 3. Fallback to Chrome Extension message bridge
    return new Promise<{ plaintext: string; data: string }>((resolve, reject) => {
      const requestId = `decrypt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => { window.removeEventListener("message", onMessage); reject(new Error(ft("decryptTimeout"))); }, 30000);
      const onMessage = (event: MessageEvent) => {
        if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "DECRYPT_ECHO_CONTENT_RESPONSE" || event.data.requestId !== requestId) return;
        window.clearTimeout(timeout); window.removeEventListener("message", onMessage);
        if (!event.data.success) reject(new Error(event.data.error || ft("ownerDecryptFailed")));
        else resolve({ plaintext: event.data.plaintext || "", data: event.data.data || "" });
      };
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "echo-portal", type: "DECRYPT_ECHO_CONTENT", requestId, ciphertext, iv, mode, ...keyAccess }, window.location.origin);
    });
  };

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
        setStatusMessage(ft("connectingMetaMask"));
        const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts[0];
        setViewerWallet(address);
        localStorage.setItem("chamber_logged_in_wallet", address);
        setStatusMessage(ft("walletConnected"));
        setTimeout(() => setStatusMessage(""), 2000);
      } catch (err: any) {
        console.error("Wallet connection failed:", err);
        setStatusMessage(ft("connectFailed", { error: err.message }));
        setTimeout(() => setStatusMessage(""), 3000);
      }
    } else {
      setStatusMessage(ft("startingSandbox"));
      setTimeout(() => {
        const mockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        setViewerWallet(mockAddress);
        localStorage.setItem("chamber_logged_in_wallet", mockAddress);
        setStatusMessage(ft("sandboxConnected"));
        setTimeout(() => setStatusMessage(""), 2000);
      }, 1500);
    }
  };

  const disconnectWallet = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chamber_logged_in_wallet");
    }
    setViewerWallet("");
    setStatusMessage(ft("disconnecting"));
    setTimeout(() => {
      router.push(locale === "en" ? "/en" : "/");
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

          // Fetch handover / transfer delegations
          let outgoingAuthors = new Set<string>();
          let outgoingPosts = new Set<string>();
          try {
            const transRes = await fetch(`https://studio.milkcat.org/chamber-api/identity/transfers?alias=${encodeURIComponent(walletAddress)}`);
            if (transRes.ok) {
              const transData = await transRes.json();
              if (transData.success) {
                (transData.outgoing || []).forEach((t: any) => {
                  if (t.type === "author" && t.authorName) outgoingAuthors.add(t.authorName.toLowerCase());
                  if (t.type === "post" && t.postTxId) outgoingPosts.add(t.postTxId);
                });
              }
            }
          } catch (_) {}

          // Filter out legacy encrypted posts without key_envelope
          const showLegacy = searchParams.get("legacy") === "true";
          const compatiblePosts = (showLegacy
            ? fetchedPosts
            : fetchedPosts.filter((post) => !post.payload.is_encrypted || Boolean(post.payload.key_envelope))
          ).filter((post) => {
            const author = String((post.payload as any).author_name || post.payload.authorName || post.payload.source_author?.name || (post.payload as any).author || "").toLowerCase();
            if (author && outgoingAuthors.has(author)) return false;
            if (outgoingPosts.has(post.txId)) return false;
            return true;
          });

          // Same source URL means the same logical post. Keep only the latest
          // revision by default; `history=true` is the explicit audit view.
          if (focusTxId) {
            const focused = compatiblePosts.filter((post) => post.txId === focusTxId);
            setPosts((current) => preservePostRuntimeState(focused, current));
            return;
          }
          const latestBySource = new Map<string, PostItem>();
          const dedupedPosts: PostItem[] = [];
          for (const post of compatiblePosts) {
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
          setPosts((current) => preservePostRuntimeState(dedupedPosts, current));
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

  const activeAuthor = searchParams.get("author") || "";

  const getPostAuthorName = (post: PostItem): string => {
    const p = post.payload as any;
    return String(
      p.author_name ||
      p.authorName ||
      p.source_author?.name ||
      p.author ||
      ""
    ).trim();
  };

  const authorStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      const author = getPostAuthorName(post);
      if (author) {
        counts.set(author, (counts.get(author) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [posts]);

  const sortedAndFilteredPosts = useMemo(() => {
    let result = [...posts];

    if (activeAuthor) {
      result = result.filter((p) => getPostAuthorName(p).toLowerCase() === activeAuthor.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => {
        const text = (p.decryptedContent || p.payload.content || "").toLowerCase();
        const author = getPostAuthorName(p).toLowerCase();
        const platform = (p.payload.platform || "").toLowerCase();
        const tags = (p.payload.tags || []).join(" ").toLowerCase();
        return text.includes(q) || author.includes(q) || platform.includes(q) || tags.includes(q);
      });
    }

    result.sort((a, b) => {
      if (sortMode === "backup") {
        const timeA = a.backupTime || a.payload.backup_timestamp || a.payload.timestamp || 0;
        const timeB = b.backupTime || b.payload.backup_timestamp || b.payload.timestamp || 0;
        return timeB - timeA;
      } else {
        const timeA = a.payload.published_at || a.payload.timestamp || 0;
        const timeB = b.payload.published_at || b.payload.timestamp || 0;
        return timeB - timeA;
      }
    });

    return result;
  }, [posts, activeAuthor, searchQuery, sortMode]);



  // Alias/content-key identifies the stable Chamber timeline. Wallet addresses
  // may rotate during recovery, so they cannot be the sole ownership signal.
  // Actual access is still cryptographically enforced when the Extension tries
  // to unwrap the article envelope with its local owner key.
  const extensionOwnsTimeline = Boolean(extensionIdentity && (
    (normalizeIdentityAlias(extensionIdentity.identityAlias) &&
      normalizeIdentityAlias(extensionIdentity.identityAlias) === normalizeIdentityAlias(walletAddress)) ||
    (extensionIdentity.walletAddress && ownerWallet &&
      extensionIdentity.walletAddress.toLowerCase() === ownerWallet.toLowerCase()) ||
    (extensionIdentity.accessCapability === "owner")
  ));

  const isPostOwner = (post: PostItem) => Boolean(extensionOwnsTimeline && (
    !post.payload.identity_key ||
    post.payload.identity_key === resolvedIdentityKey ||
    normalizeIdentityAlias(post.payload.identity_alias) === normalizeIdentityAlias(walletAddress)
  ));

  const resolvePostKeyAccess = async (post: PostItem) => {
    if (!post.payload.key_envelope) {
      if (!isPostOwner(post)) throw new Error(ft("legacyOwnerOnly"));
      return {};
    }
    let requesterKeyId = extensionIdentity?.sharingKeyId;
    if (!requesterKeyId && typeof window !== "undefined") {
      const guestKeyJson = localStorage.getItem("chamber_guest_sharing_key");
      if (guestKeyJson) {
        try { requesterKeyId = JSON.parse(guestKeyJson).sharingKeyId; } catch (_) {}
      }
    }
    if (!requesterKeyId) {
      if (isPostOwner(post)) return { ownerKeyEnvelope: post.payload.key_envelope };
      throw new Error(ft("installExtension"));
    }
    const response = await fetch(`https://studio.milkcat.org/chamber-api/access/grants?postTxId=${encodeURIComponent(post.txId)}&requesterKeyId=${encodeURIComponent(requesterKeyId)}`, { cache: "no-store" });
    if (response.status === 404 && isPostOwner(post)) {
      return { ownerKeyEnvelope: post.payload.key_envelope };
    }
    if (!response.ok) throw new Error(response.status === 404 ? ft("noGrant") : ft("grantReadFailed"));
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
          if (!response.ok) throw new Error(ft("mediaDownloadFailed", { status: response.status }));
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
      if (mediaFailed) setStatusMessage(ft("partialMedia", { success: mediaTotal - mediaFailed, total: mediaTotal, failed: mediaFailed }));

    } catch (err: any) {
      console.error("[Chamber] Decryption error:", err);
      setStatusMessage(ft("decryptFailed", { error: err.message }));
      setPosts((current) => current.map((item) => item.txId === post.txId ? { ...item, isDecrypting: false, decryptError: err.message } : item));
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
        ? ft("decryptPostsPartial", { success: targets.length - failures, failed: failures })
        : mediaFailures
          ? ft("decryptAlbums", { posts: targets.length, success: mediaTotal - mediaFailures, total: mediaTotal })
          : ft("decryptAll", { count: targets.length })
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
      reject(new Error(ft("grantTimeout")));
    }, 15000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "CREATE_ECHO_READING_GRANT_RESPONSE" || event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!event.data.success || !event.data.recipientKeyEnvelope) reject(new Error(event.data.error || ft("grantCreateFailed")));
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

  const getOrCreateGuestSharingKey = async () => {
    let guestKeyJson = localStorage.getItem("chamber_guest_sharing_key");
    if (guestKeyJson) {
      try {
        return JSON.parse(guestKeyJson);
      } catch (_) {}
    }
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );
    const pubJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const keyId = "guest_" + Math.random().toString(36).slice(2, 10);
    const guestWallet = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(20))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const guestData = {
      walletAddress: guestWallet,
      identityAlias: "訪客 (Guest)",
      identityDisplayName: "訪客 (Guest)",
      sharingKeyId: keyId,
      sharingPublicKey: pubJwk,
      sharingPrivateKey: privJwk,
      accessCapability: "guest",
    };
    localStorage.setItem("chamber_guest_sharing_key", JSON.stringify(guestData));
    return guestData;
  };

  const requestReadingAccess = async (post: PostItem) => {
    const userPrompt = prompt("【向作者申請閱讀私密文章】\n請輸入您的稱呼或附言（例如：我是高中同學小明、或您的 FB/Threads 帳號），方便作者識別授權：", "");
    if (userPrompt === null) return;

    setAccessBusyId(post.txId);
    try {
      let identity: any = extensionIdentity;
      if (!identity || !identity.sharingKeyId) {
        try {
          identity = await requestExtensionIdentity();
          setExtensionIdentity(identity);
        } catch (_) {
          identity = await getOrCreateGuestSharingKey();
        }
      }
      const response = await fetch("https://studio.milkcat.org/chamber-api/access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postTxId: post.txId,
          ownerIdentityKey: post.payload.identity_key || effectiveOwnerIdentityKey,
          ownerAlias: walletAddress,
          requesterWallet: identity.walletAddress,
          requesterAlias: identity.identityAlias || identity.identityDisplayName || "訪客",
          requesterNote: userPrompt.trim(),
          requesterKeyId: identity.sharingKeyId,
          requesterPublicKey: identity.sharingPublicKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || ft("requestFailed"));
      setStatusMessage(data.request?.status === "approved" ? ft("approvedUnlocking") : "✅ 已向作者送出閱讀申請！作者已收到推播通知。");
      if (data.request?.status === "approved") await handleDecryptPost(post, posts.findIndex((item) => item.txId === post.txId));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : ft("readingRequestFailed"));
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
        if (!post) throw new Error(ft("postNotVisible"));
        if (!post.payload.key_envelope) throw new Error(ft("legacyReshare"));
        recipientKeyEnvelope = await createRecipientGrant(post.payload.key_envelope, request.requesterPublicKey, request.requesterKeyId);
      }
      const response = await fetch(`https://studio.milkcat.org/chamber-api/access/requests/${encodeURIComponent(request.id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${extensionIdentity?.accessCapability || ""}` },
        body: JSON.stringify({ decision, recipientKeyEnvelope, ownerIdentityKey: effectiveOwnerIdentityKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || ft("requestUpdateFailed"));
      setReadingRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: decision } : item));
      setStatusMessage(decision === "approved" ? ft("accessApproved") : ft("accessRejected"));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : ft("requestHandleFailed"));
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

  // If URL focuses on a single post (?post=TX_ID) and guest has a sharing key, try to unlock that specific post
  useEffect(() => {
    if (loading || !posts.length || extensionIdentity?.walletAddress || !focusTxId) return;
    if (typeof window === "undefined") return;
    const targetPost = posts.find((p) => p.txId === focusTxId && p.payload.is_encrypted && !p.decryptedContent);
    if (!targetPost) return;
    const guestKeyJson = localStorage.getItem("chamber_guest_sharing_key");
    if (!guestKeyJson) return;
    handleDecryptPost(targetPost, posts.findIndex((item) => item.txId === targetPost.txId)).catch(() => {});
  }, [loading, posts, extensionIdentity, focusTxId]);

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
    { id: "all", name: ft("allFeed") },
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
    : ft("chamberDisconnected");
  const ownerInitials = (ownerDisplayName || walletAddress || "CH")
    .split(/\s+/)
    .map((part) => part.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const localizedTimelinePath = (platform = currentPlatform) => `${locale === "en" ? "/en" : ""}/${walletAddress}/${platform}`;

  return (
    <div
      data-theme={currentTheme}
      className="flex flex-col min-h-screen font-sans transition-colors duration-300"
      style={{ backgroundColor: "var(--bg-page)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md px-4 py-3 border-b transition-colors duration-300"
        style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
      >
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <Link href={localizedTimelinePath("all")} className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-colors"
              style={{ backgroundColor: "var(--accent-primary)", color: "#ffffff" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-100">
                Chamber Portal
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">studio.milkcat.org/reborn</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {isTimelineOwner && (
              <button
                onClick={() => setShowReadingRequests((current) => !current)}
                className="relative text-[10px] sm:text-xs text-slate-300 hover:text-white px-2.5 py-2 rounded-full border transition-colors"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
              >
                {ft("readingRequests")}
                {pendingReadingRequests.length > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[9px] text-white flex items-center justify-center font-bold">
                    {pendingReadingRequests.length}
                  </span>
                )}
              </button>
            )}
            <Link
              href={locale === "en" ? "/en/guide" : "/guide"}
              className="text-[10px] sm:text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {ft("guide")}
            </Link>

            {/* Theme Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs text-slate-300 hover:text-white border transition-all cursor-pointer shadow-sm"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
                title="切換時光牆主題"
              >
                <span>{TIMELINE_THEMES.find((t) => t.id === currentTheme)?.icon || "🎨"}</span>
                <span className="hidden sm:inline font-medium text-[11px]">{TIMELINE_THEMES.find((t) => t.id === currentTheme)?.name || "主題"}</span>
              </button>

              {isThemeMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-64 border rounded-2xl shadow-2xl z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                  style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
                >
                  <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">🎨 時光牆風格主題</span>
                    <button
                      onClick={() => {
                        setShowThemeModal(true);
                        setIsThemeMenuOpen(false);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded font-bold transition-all text-white"
                      style={{ backgroundColor: "var(--accent-primary)" }}
                    >
                      ＋ 客製/匯入
                    </button>
                  </div>
                  <div className="space-y-1 mt-1.5">
                    {TIMELINE_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTheme(t.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all ${
                          currentTheme === t.id
                            ? "text-white font-bold border shadow-sm"
                            : "hover:bg-white/5 text-slate-300 hover:text-white border border-transparent"
                        }`}
                        style={currentTheme === t.id ? { backgroundColor: "var(--bg-page)", borderColor: "var(--accent-primary)" } : {}}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{t.icon}</span>
                          <div>
                            <div className="text-xs">{t.name}</div>
                            <div className="text-[9px] text-slate-400">{t.id === "custom" ? customTheme.name : t.desc}</div>
                          </div>
                        </div>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded border"
                          style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)", color: "var(--accent-text)" }}
                        >
                          {t.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <LanguageSwitcher compact routeAware />
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
                        <div className="mt-1 break-all text-[9px] text-amber-300/80">{ft("externalWallet", { wallet: `${viewerWallet.slice(0, 6)}…${viewerWallet.slice(-4)}` })}</div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowSkinModal(true);
                        setIsHeaderDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-indigo-950/40 hover:text-indigo-200 transition-colors flex items-center justify-between"
                    >
                      <span>{ft("wallSkinSetting")}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">PRO</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowRecovery(true);
                        setIsHeaderDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-indigo-950/40 hover:text-indigo-200 transition-colors"
                    >
                      {ft("keyRecoverySettings")}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(extensionIdentity.walletAddress);
                        alert(ft("identityCopied"));
                        setIsHeaderDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-indigo-950/40 hover:text-indigo-200 transition-colors"
                    >
                      {ft("copyWallet")}
                    </button>
                    {viewerWallet && (
                      <button
                        onClick={() => {
                          setIsHeaderDropdownOpen(false);
                          disconnectWallet();
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs text-rose-450 hover:bg-rose-950/20 hover:text-rose-300 border-t border-slate-800/60 transition-colors"
                      >
                        {ft("disconnectExternalWallet")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowRecovery(true)}
                className="text-xs font-semibold border border-indigo-800/60 bg-indigo-950/40 hover:bg-indigo-900/60 hover:border-indigo-500 text-indigo-200 px-3.5 py-1.5 rounded-full transition-all duration-200 flex items-center gap-1.5 shadow-sm"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>{chamberIdentityLabel}</span>
                <span className="text-[10px] text-indigo-300 opacity-90">({ft("keyRecoverySettings")})</span>
              </button>
            )}
            </div>
          </div>
        </div>
      </header>

      {showPairingModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md">
          <section className="w-full max-w-md rounded-2xl border-2 border-indigo-500/80 bg-slate-900 p-6 text-center shadow-2xl shadow-indigo-950/80 animate-fade-in">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-950 border border-indigo-500/60 text-2xl">
              📱
            </div>
            <h2 className="mt-4 text-lg font-bold text-indigo-100">手機 QR Code 快速配對</h2>
            <p className="mt-2 text-xs leading-6 text-slate-300">{pairingStatus}</p>
            <button
              onClick={() => setShowPairingModal(false)}
              className="mt-5 w-full rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              關閉
            </button>
          </section>
        </div>
      )}

      {transferModal && transferModal.isOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md">
          <div
            className="w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all animate-fade-in"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
          >
            <div className="flex items-center justify-between mb-3 border-b pb-2.5" style={{ borderColor: "var(--border-card)" }}>
              <div className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <span>🔄</span>
                <span>{locale === "zh-TW" ? "轉移文章 / 粉專歸屬權" : "Transfer Post Ownership"}</span>
              </div>
              <button
                type="button"
                onClick={() => setTransferModal(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {locale === "zh-TW" ? (
                <>
                  您正準備將作者「<strong style={{ color: "var(--accent-primary)" }}>{transferModal.authorName}</strong>」（共 <strong>{transferModal.count}</strong> 篇文章）從目前的時光牆轉移至另一個 Chamber 身分。
                </>
              ) : (
                <>
                  You are about to transfer all posts by <strong style={{ color: "var(--accent-primary)" }}>{transferModal.authorName}</strong> ({transferModal.count} posts) to another Chamber identity.
                </>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {locale === "zh-TW" ? "接收對象身分 (Target Identity)" : "Target Identity"}
              </label>

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border mb-3" style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}>
                <button
                  type="button"
                  onClick={() => {
                    setTransferMode("local");
                    const otherProfiles = availableProfiles.filter(p => p.alias && normalizeIdentityAlias(p.alias) !== normalizeIdentityAlias(walletAddress));
                    setTransferTargetAlias(otherProfiles[0]?.alias || "");
                  }}
                  className="text-xs py-1.5 rounded-lg font-semibold transition-all"
                  style={transferMode === "local" ? {
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                  } : {
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)"
                  }}
                >
                  👥 {locale === "zh-TW" ? "我的本機分身" : "My Sub-Profile"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferMode("custom");
                    setTransferTargetAlias("");
                  }}
                  className="text-xs py-1.5 rounded-lg font-semibold transition-all"
                  style={transferMode === "custom" ? {
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                  } : {
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)"
                  }}
                >
                  🌐 {locale === "zh-TW" ? "外部其他帳號" : "External Account"}
                </button>
              </div>

              {transferMode === "local" ? (
                availableProfiles.filter(p => p.alias && normalizeIdentityAlias(p.alias) !== normalizeIdentityAlias(walletAddress)).length > 0 ? (
                  <select
                    value={transferTargetAlias}
                    onChange={(e) => setTransferTargetAlias(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border outline-none font-medium mb-2"
                    style={{ backgroundColor: "var(--bg-page)", color: "var(--text-primary)", borderColor: "var(--border-card)" }}
                  >
                    {availableProfiles
                      .filter(p => p.alias && normalizeIdentityAlias(p.alias) !== normalizeIdentityAlias(walletAddress))
                      .map(p => (
                        <option key={p.id} value={p.alias}>
                          🏢 {p.name} · @{p.alias}
                        </option>
                      ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl border text-xs mb-2" style={{ backgroundColor: "var(--bg-page)", color: "var(--text-secondary)", borderColor: "var(--border-card)" }}>
                    {locale === "zh-TW" ? "尚無其他本機分身，請使用「外部其他帳號」或於 Extension 新增身分。" : "No other local profile found. Please use External Account mode."}
                  </div>
                )
              ) : (
                <div>
                  <input
                    type="text"
                    value={transferTargetAlias}
                    onChange={(e) => setTransferTargetAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    placeholder="例如: peter, alice 或 自訂 Chamber Alias"
                    className="w-full p-2.5 text-xs rounded-xl border outline-none font-medium mb-2"
                    style={{ backgroundColor: "var(--bg-page)", color: "var(--text-primary)", borderColor: "var(--border-card)" }}
                  />
                  <div className="text-[10px] mb-2 font-medium" style={{ color: "var(--accent-primary)" }}>
                    {transferTargetAlias ? `接收時光牆: https://studio.milkcat.org/echo/${transferTargetAlias}` : ""}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-500 leading-normal">
                {transferMode === "local" ? (
                  <>💡 {locale === "zh-TW" ? "轉移至本機分身將自動完成雙向簽章，此作者的所有文章將立即從當前時光牆移出，並掛載至目標分身的時光牆。" : "Transferring to a local profile will auto-sign both sides. Posts will be immediately moved."}</>
                ) : (
                  <>🛡️ {locale === "zh-TW" ? "轉移給外部帳號將發起歸屬轉移，文章將從您的時光牆移出，並直接劃撥交由對方的 Chamber 時光牆接管展示。" : "Transferring to an external account will assign the post ownership directly to their Chamber timeline."}</>
                )}
              </div>
            </div>

            {transferStatus && (
              <div className="mb-4 p-2.5 rounded-xl border text-xs" style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)", color: "var(--text-primary)" }}>
                {transferStatus}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t" style={{ borderColor: "var(--border-card)" }}>
              <button
                type="button"
                onClick={() => setTransferModal(null)}
                disabled={transferBusy}
                className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-white/5 transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                {locale === "zh-TW" ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!transferTargetAlias.trim()) return;
                  setTransferBusy(true);
                  setTransferStatus(locale === "zh-TW" ? "正在處理雙向簽章與轉移..." : "Processing transfer...");
                  try {
                    const res = await fetch("https://studio.milkcat.org/chamber-api/identity/transfer-author", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        fromAlias: walletAddress,
                        toAlias: transferTargetAlias.trim(),
                        authorName: transferModal.authorName,
                        autoAccept: true,
                      })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.error || "Transfer failed");
                    setTransferStatus(locale === "zh-TW" ? `🎉 轉移成功！「${transferModal.authorName}」已轉掛至 @${transferTargetAlias}` : `Transfer successful to @${transferTargetAlias}!`);
                    setTimeout(() => {
                      setTransferModal(null);
                      window.location.reload();
                    }, 1200);
                  } catch (err: any) {
                    setTransferStatus(`⚠️ ${err.message || "Transfer error"}`);
                  } finally {
                    setTransferBusy(false);
                  }
                }}
                disabled={transferBusy || !transferTargetAlias.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all disabled:opacity-50"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                {transferBusy ? "⏳..." : (locale === "zh-TW" ? "🚀 確認轉移" : "Confirm Transfer")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecovery && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-indigo-800/60 bg-slate-900 p-5 shadow-2xl shadow-indigo-950/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-indigo-100">{ft("recoveryTitle")}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {ft("recoveryIntro")}
                </p>
              </div>
              <button onClick={() => setShowRecovery(false)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-white">✕</button>
            </div>

            {pendingRecovery && (
              <div className="mt-4 rounded-2xl border-2 border-amber-500/80 bg-amber-950/40 p-4 shadow-xl shadow-amber-950/40 animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <h3 className="text-sm font-bold text-amber-200">{ft("emergencyCTitle")}</h3>
                </div>
                <p className="mt-1 text-xs leading-5 text-amber-100/90">{ft("emergencyCBody")}</p>
                <textarea readOnly value={pendingRecovery.recoveryCodeC} rows={4} className="mt-3 w-full resize-none rounded-xl border border-amber-600/60 bg-slate-950 p-3 font-mono text-xs text-amber-200 outline-none focus:border-amber-400 select-all" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(pendingRecovery.recoveryCodeC);
                      setCopiedC(true);
                      setRecoveryStatus(ft("cCopied"));
                      setTimeout(() => setCopiedC(false), 3000);
                    }}
                    className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-all shadow-md ${copiedC ? "bg-emerald-500 text-white" : "bg-amber-500 text-slate-950 hover:bg-amber-400"}`}
                  >
                    {copiedC ? "✅ 已複製到剪貼簿！" : ft("copyC")}
                  </button>
                  <button
                    onClick={confirmRecoverySaved}
                    disabled={recoveryBusy}
                    className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-md"
                  >
                    {ft("cSavedElsewhere")}
                  </button>
                </div>
              </div>
            )}

            {extensionIdentity && (
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                {recoveryConfigured ? (
                  <div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-lg" aria-hidden="true">✅</span>
                      <div>
                        <h3 className="text-sm font-semibold text-emerald-300">{ft("recoveryReadyTitle")}</h3>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">{ft("recoveryReadyBody")}</p>
                      </div>
                    </div>
                    <details className="mt-3 border-t border-slate-800 pt-3">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-amber-300">{ft("rotateCSummary")}</summary>
                      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={ft("rotateProviderLabel")}>
                        <button type="button" onClick={() => setPasskeyProvider("password-manager")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "password-manager" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{ft("passwordManager")}</button>
                        <button type="button" onClick={() => setPasskeyProvider("system")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "system" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{ft("systemPasskey")}</button>
                      </div>
                      <p className="mt-2 text-[10px] leading-4 text-amber-200/70">{ft("rotateWarning")}</p>
                      <button type="button" onClick={rotateRecoveryCode} disabled={recoveryBusy} className="mt-2 w-full rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/40 disabled:opacity-50">{ft("rotateCButton")}</button>
                    </details>
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-slate-200">{ft("recoverySetupTitle")}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{ft("recoverySetupBody")}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={ft("passkeyProviderLabel")}>
                      <button
                        type="button"
                        onClick={() => setPasskeyProvider("password-manager")}
                        disabled={recoveryBusy}
                        className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "password-manager" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}
                      >
                        {ft("passwordManager")}
                        <span className="mt-1 block text-[9px] font-normal opacity-75">{ft("passwordManagerExamples")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPasskeyProvider("system")}
                        disabled={recoveryBusy}
                        className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "system" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}
                      >
                        {ft("systemPasskey")}
                        <span className="mt-1 block text-[9px] font-normal opacity-75">{ft("systemPasskeyExamples")}</span>
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">{ft("providerHint")}</p>
                    <button
                      onClick={setupRecoveryVault}
                      disabled={recoveryBusy || Boolean(pendingRecovery)}
                      className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {recoveryBusy ? ft("processing") : pendingRecovery ? ft("saveCFirst") : ft("setupRecoveryButton")}
                    </button>
                  </>
                )}
              </div>
            )}

            <div className={`mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 ${!extensionIdentity ? "border-indigo-800/50" : ""}`}>
              <h3 className="text-sm font-semibold text-indigo-200 flex items-center gap-1.5">
                <span>📱 {ft("restoreToolSummary")}</span>
              </h3>
              <div className="mt-3 border-t border-slate-800 pt-3">
                <p className="text-[11px] leading-5 text-slate-400">{ft("restoreToolBody")}</p>
                <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={ft("restoreProviderLabel")}>
                  <button type="button" onClick={() => setPasskeyProvider("password-manager")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "password-manager" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{ft("passwordManager")}</button>
                  <button type="button" onClick={() => setPasskeyProvider("system")} disabled={recoveryBusy} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${passkeyProvider === "system" ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{ft("systemPasskey")}</button>
                </div>
                <label className="mt-3 block text-[11px] font-semibold text-slate-400" htmlFor="recovery-code-c">{ft("pasteSavedC")}</label>
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
                  className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 shadow-md"
                >
                  {ft("restoreBC")}
                </button>
                {extensionIdentity && (
                  <button
                    onClick={restoreWithLocalAAndVaultB}
                    disabled={recoveryBusy}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-transparent px-4 py-2.5 text-xs font-semibold text-slate-400 hover:border-indigo-700 hover:text-indigo-200 disabled:opacity-50"
                  >
                    {ft("repairAB")}
                  </button>
                )}
              </div>
            </div>

            {recoveryStatus && (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs leading-5 text-slate-300">{recoveryStatus}</div>
            )}
          </section>
        </div>
      )}

      {/* Main Flow */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">
        {!extensionIdentity && (
          <div className="mb-5 rounded-xl border border-amber-500/40 bg-slate-900/95 p-4 text-xs leading-5 text-amber-100 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                  <span>📱 該手機仍未綁定 Chamber 主人身分</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-300/85 leading-relaxed">
                  此裝置尚未綁定解密身分。若您是時光牆主人，請使用電腦版 Chamber 擴充功能產生 QR Code 進行一鍵綁定；若您是訪客好友，可於下方文章點擊「向作者申請閱讀」。
                </div>
              </div>
              <button
                onClick={() => setShowRecovery(true)}
                className="shrink-0 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-1.5 hover:opacity-90"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                🔐 密碼/復原碼解鎖
              </button>
            </div>
          </div>
        )}
        {extensionIdentity && ownerWallet && !isTimelineOwner && (
          <div className="mb-5 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">
            {ft("wrongIdentity", { identity: chamberIdentityLabel })}
          </div>
        )}
        {showReadingRequests && isTimelineOwner && (
          <section className="mb-6 rounded-2xl border border-indigo-800/50 bg-slate-900/90 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-indigo-100">{ft("requestsTitle")}</h2>
                <p className="mt-1 text-[9px] text-slate-500">{ft("requestsBody")}</p>
              </div>
              <button onClick={() => setShowReadingRequests(false)} className="text-xs text-slate-500 hover:text-white">✕</button>
            </div>
            {readingRequests.length === 0 ? (
              <div className="rounded-xl bg-slate-950/60 p-4 text-center text-xs text-slate-500">{ft("noRequests")}</div>
            ) : (
              <div className="space-y-3">
                {readingRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-xs font-semibold text-slate-200">
                      {request.requesterAlias ? `@${request.requesterAlias}` : `${request.requesterWallet.slice(0, 8)}…${request.requesterWallet.slice(-6)}`}
                    </div>
                    {request.requesterAlias && <div className="mt-0.5 font-mono text-[9px] text-slate-600">{request.requesterWallet.slice(0, 8)}…{request.requesterWallet.slice(-6)}</div>}
                    <div className="mt-1 text-[9px] text-slate-500">{ft("requestPost", { post: `${request.postTxId.slice(0, 10)}…`, date: new Date(request.createdAt).toLocaleString(locale) })}</div>
                    {request.requesterNote && (
                      <div className="mt-2 p-2 rounded-lg bg-indigo-950/40 border border-indigo-900/50 text-[11px] text-indigo-200">
                        <span className="font-bold text-indigo-400">💬 申請附言：</span>{request.requesterNote}
                      </div>
                    )}
                    {request.status === "pending" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => decideReadingRequest(request, "approved")}
                          disabled={accessBusyId === request.id}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {!request.requesterAlias || request.requesterAlias.includes("訪客") ? "⏳ 核准 24 小時限時閱讀" : "✅ 核准好友永久閱讀"}
                        </button>
                        <button
                          onClick={() => decideReadingRequest(request, "rejected")}
                          disabled={accessBusyId === request.id}
                          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                        >
                          {ft("reject")}
                        </button>
                      </div>
                    ) : (
                      <div className={`mt-2 text-[10px] ${request.status === "approved" ? "text-emerald-400" : "text-slate-500"}`}>
                        {request.status === "approved" ? ft("approvedSingle") : ft("rejected")}
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
                {ownerDisplayName || walletAddress} <span className="font-normal text-slate-500">({ft("creator")})</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-mono break-all">{walletAddress}</p>
            </div>
          </div>
        </div>

        {/* Dynamic Platform Filters sub-navigation bar */}
        <nav className="mb-6 flex gap-1.5 overflow-x-auto pb-2 border-b scrollbar-none" style={{ borderColor: "var(--border-card)" }}>
          {platforms.map((p) => {
            const isActive = currentPlatform === p.id;
            return (
              <Link
                key={p.id}
                href={`${localizedTimelinePath(p.id)}?${new URLSearchParams({
                  ...(activeTag ? { tag: activeTag } : {}),
                  ...(showHistory ? { history: "true" } : {}),
                  ...(network === "mainnet" ? { network: "mainnet" } : {})
                }).toString()}`}
                className="text-xs px-3.5 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all border shadow-sm"
                style={isActive ? {
                  backgroundColor: "var(--accent-primary)",
                  borderColor: "var(--accent-primary)",
                  color: "#ffffff"
                } : {
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-card)",
                  color: "var(--text-secondary)"
                }}
              >
                {p.name}
              </Link>
            );
          })}
        </nav>

        {/* Author / Page Smart Filter Bar */}
        {authorStats.length > 1 && (
          <div
            className="mb-6 -mt-2 p-3 rounded-2xl border transition-all shadow-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
          >
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span>🏢</span>
                <span>{ft("authorFilterTitle")}</span>
                <span className="text-[10px] opacity-70">({authorStats.length})</span>
              </div>
              {activeAuthor && (
                <Link
                  href={`${localizedTimelinePath()}?${(() => {
                    const q = new URLSearchParams(searchParams.toString());
                    q.delete("author");
                    return q.toString();
                  })()}`}
                  className="text-[10px] font-medium hover:underline transition-colors"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {ft("clearFilter")}
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
              <Link
                href={`${localizedTimelinePath()}?${(() => {
                  const q = new URLSearchParams(searchParams.toString());
                  q.delete("author");
                  return q.toString();
                })()}`}
                className="text-xs px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border"
                style={!activeAuthor ? { backgroundColor: "var(--accent-primary)", color: "#ffffff", borderColor: "var(--accent-primary)" } : { backgroundColor: "var(--bg-page)", color: "var(--text-secondary)", borderColor: "var(--border-card)" }}
              >
                <span>✨</span>
                <span>{ft("allAuthors")}</span>
                <span
                  className="text-[10px] px-1.5 py-0.2 rounded-full opacity-80"
                  style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
                >
                  {posts.length}
                </span>
              </Link>

              {authorStats.map((item) => {
                const isSelected = activeAuthor.toLowerCase() === item.name.toLowerCase();
                const isPage = item.name.includes("粉專") || item.name.includes("科技") || item.name.includes("社") || item.name.includes("官方") || item.name.length > 5;
                return (
                  <div key={item.name} className="flex items-center gap-1">
                    <Link
                      href={`${localizedTimelinePath()}?${(() => {
                        const q = new URLSearchParams(searchParams.toString());
                        q.set("author", item.name);
                        return q.toString();
                      })()}`}
                      className="text-xs px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border"
                      style={isSelected ? { backgroundColor: "var(--accent-primary)", color: "#ffffff", borderColor: "var(--accent-primary)" } : { backgroundColor: "var(--bg-page)", color: "var(--text-primary)", borderColor: "var(--border-card)" }}
                    >
                      <span>{isPage ? "🏢" : "👤"}</span>
                      <span>{item.name}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.2 rounded-full opacity-80"
                        style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
                      >
                        {item.count}
                      </span>
                    </Link>

                    {isTimelineOwner && (
                      <button
                        type="button"
                        title={locale === "zh-TW" ? `轉移「${item.name}」所有文章至其他分身` : `Transfer all posts by "${item.name}" to another profile`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTransferModal({ isOpen: true, authorName: item.name, count: item.count });
                          const otherProfiles = availableProfiles.filter(p => p.alias && normalizeIdentityAlias(p.alias) !== normalizeIdentityAlias(walletAddress));
                          setTransferTargetAlias(otherProfiles[0]?.alias || "");
                          setTransferStatus("");
                        }}
                        className="text-[11px] px-2 py-1.5 rounded-xl border transition-all shrink-0 shadow-sm cursor-pointer hover:opacity-80"
                        style={{
                          backgroundColor: "var(--bg-page)",
                          borderColor: "var(--border-card)",
                          color: "var(--text-secondary)"
                        }}
                      >
                        🔄
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {focusTxId && (
          <div
            className="mb-5 rounded-xl border p-3 flex items-center justify-between gap-3 shadow-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
          >
            <div>
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{ft("singleBackupTitle")}</div>
              <div className="text-[9px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{ft("singleBackupBody")}</div>
            </div>
            <Link
              href={`${localizedTimelinePath()}?${(() => {
                const query = new URLSearchParams(searchParams.toString());
                query.delete("post");
                return query.toString();
              })()}`}
              className="shrink-0 text-xs text-white font-semibold px-3.5 py-2 rounded-xl transition-all shadow-sm"
              style={{ backgroundColor: "var(--accent-primary)" }}
            >
              {ft("backTimeline")}
            </Link>
          </div>
        )}

        {encryptedRemainingCount > 0 && isTimelineOwner && (
          <div
            className="mb-5 rounded-xl border p-3 flex items-center justify-between gap-3 shadow-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
          >
            <div>
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{ft("privateTimeline")}</div>
              <div className="text-[9px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{ft("privateTimelineBody", { count: encryptedRemainingCount })}</div>
            </div>
            <button
              onClick={handleDecryptAll}
              disabled={isDecryptingAll}
              className="shrink-0 text-xs font-semibold disabled:opacity-60 text-white px-3.5 py-2 rounded-xl transition-all shadow-sm"
              style={{ backgroundColor: "var(--accent-primary)" }}
            >
              {isDecryptingAll ? ft("unlockingProgress", { progress: decryptProgress }) : ft("unlockAgain")}
            </button>
          </div>
        )}

        {statusMessage && <div className="mb-4 text-[10px] text-emerald-400">{statusMessage}</div>}

        {/* Dynamic Tag filtering display block */}
        {activeTag && (
          <div
            className="mb-6 flex items-center justify-between border px-3.5 py-2 rounded-xl text-xs shadow-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)", color: "var(--text-primary)" }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ color: "var(--text-secondary)" }}>{ft("filteringTag")}</span>
              <span
                className="font-bold px-2 py-0.5 rounded-lg font-mono text-white text-[11px]"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                #{activeTag}
              </span>
            </div>
            <Link
              href={localizedTimelinePath()}
              className="hover:underline font-medium"
              style={{ color: "var(--accent-primary)" }}
            >
              {ft("clearFilter")}
            </Link>
          </div>
        )}

        {/* Search Bar & Sorting Controls */}
        <div
          className="mb-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 backdrop-blur p-3.5 rounded-2xl shadow-lg border transition-all"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
        >
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-2.5 text-xs text-slate-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={ft("searchPlaceholder")}
              className="w-full rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none border transition-all"
              style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex rounded-xl p-0.5 border text-[11px]"
              style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
            >
              <button
                type="button"
                onClick={() => setSortMode("backup")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  sortMode === "backup" ? "text-white shadow font-bold" : "text-slate-400 hover:text-slate-200"
                }`}
                style={sortMode === "backup" ? { backgroundColor: "var(--accent-primary)" } : {}}
              >
                ⚡ {ft("latestBackupSort")}
              </button>
              <button
                type="button"
                onClick={() => setSortMode("published")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  sortMode === "published" ? "text-white shadow font-bold" : "text-slate-400 hover:text-slate-200"
                }`}
                style={sortMode === "published" ? { backgroundColor: "var(--accent-primary)" } : {}}
              >
                📅 {ft("originalPublishSort")}
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Post Flow */}
        <div
          className="relative border-l ml-4 pl-6 sm:pl-8 space-y-8"
          style={{ borderColor: "var(--border-card)" }}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <div
                className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderTopColor: "var(--accent-primary)", borderColor: "var(--border-card)" }}
              ></div>
              <p className="text-xs">{ft("loadingPosts")}</p>
            </div>
          ) : sortedAndFilteredPosts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-xs">{searchQuery ? "找不到符合搜尋條件的文章" : ft("noPosts")}</p>
            </div>
          ) : (
            sortedAndFilteredPosts.map((post, idx) => {
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

              const backupTimeRaw = post.backupTime || post.payload.backup_timestamp;
              const backupFormattedTime = backupTimeRaw
                ? new Date(backupTimeRaw * 1000).toLocaleString(locale, {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              // Tag elements helper
              const postTags = post.payload.tags || [];
              const storedMediaUrls = Array.isArray(post.payload.media?.urls) && post.payload.media.urls.length > 0
                ? post.payload.media.urls.filter(Boolean)
                : [post.payload.media?.primary_fb_cdn, post.payload.media?.fallback_backup].filter(Boolean) as string[];
              const mediaUrls = post.payload.is_encrypted ? (post.decryptedMedia || []) : storedMediaUrls;

              const contentText = post.payload.is_encrypted ? (post.decryptedContent || "") : (post.payload.content || "");
              const isExpanded = Boolean(expandedPosts[post.txId]);
              const hasLongText = (contentText || "").length > 180 || ((contentText || "").split("\n").length > 4);
              const isCollapsible = hasLongText || mediaUrls.length > 1;

              const creatorSkin = searchParams.get("skin") || savedWallSkin || (walletAddress?.toLowerCase().includes("sunlake") || resolvedIdentityKey?.toLowerCase().includes("sunlake") ? "leopard" : "classic");

              if (creatorSkin === "leopard" || creatorSkin === "cat") {
                return (
                  <RealLeopardCatCard
                    key={post.txId}
                    post={post}
                    isPostOwner={isPostOwner(post)}
                    isExpanded={isExpanded}
                    onToggleExpand={() => setExpandedPosts((prev) => ({ ...prev, [post.txId]: !isExpanded }))}
                    onDecrypt={() => handleDecryptPost(post, idx)}
                    onRequestAccess={() => requestReadingAccess(post)}
                    isDecrypting={post.isDecrypting}
                    accessBusy={accessBusyId === post.txId}
                    irysHost={irysHost}
                    ft={ft}
                    locale={locale}
                    onOpenAlbum={openAlbumViewer}
                  />
                );
              }

              return (
                <div key={post.txId} className="relative group">
                  {/* Timeline Node */}
                  <div
                    className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-3.5 h-3.5 rounded-full border-2 transition-all shadow-sm"
                    style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--accent-primary)" }}
                  ></div>

                  {/* Card Container with Dynamic Theme styling */}
                  <article
                    className={`rounded-2xl p-5 sm:p-6 shadow-xl border transition-all duration-300 relative ${
                      currentTheme === "cat" || searchParams.get("skin") === "cat" ? "cat-card" : ""
                    }`}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-card)",
                      boxShadow: "0 10px 30px -10px var(--accent-glow)",
                    }}
                  >
                    {/* Private Experimental Cat Morphing Ears */}
                    {(currentTheme === "cat" || searchParams.get("skin") === "cat") && (
                      <div className="cat-card-ears">
                        <div className="cat-ear-left" />
                        <div className="cat-ear-right" />
                      </div>
                    )}
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-4 pb-3.5 border-b border-slate-700/30">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs shadow-inner shrink-0"
                          style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)", color: "var(--accent-text)" }}
                        >
                          {post.payload.platform?.toUpperCase().slice(0, 2) || "MS"}
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2">
                            <span>{ft("fromPlatform", { platform: post.payload.platform || "Chamber" })}</span>
                            {post.payload.source_url && (
                              <a
                                href={post.payload.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] px-2 py-0.5 rounded border transition-all font-medium hover:text-white"
                                style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)", color: "var(--accent-text)" }}
                              >
                                {ft("viewSource")}
                              </a>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] sm:text-[11px] text-slate-400 font-mono">
                            {formattedPublishedTime && <span>📅 原文：{formattedPublishedTime}</span>}
                            {backupFormattedTime && (
                              <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
                                🛡️ 備份：{backupFormattedTime}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <a
                        href={`${irysHost}/${post.txId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-all hover:text-white"
                        style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)", color: "var(--accent-text)" }}
                      >
                        TX: {post.txId.slice(0, 8)}…
                      </a>
                    </div>

                    {/* Content Section (Comfortable Reading & Spacious Line Height) */}
                    <div className="text-sm sm:text-[15px] leading-7 sm:leading-8 text-slate-100 font-normal tracking-wide">
                      {post.payload.is_encrypted ? (
                        post.decryptedContent ? (
                          <div
                            className="p-4 sm:p-5 rounded-2xl relative border flex flex-col gap-2.5"
                            style={{
                              backgroundColor: "rgba(16, 185, 129, 0.08)",
                              borderColor: "var(--accent-primary)",
                            }}
                          >
                            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "rgba(16, 185, 129, 0.2)" }}>
                              <span className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: "var(--accent-text)" }}>
                                <span>🔓</span> <span>{ft("decrypted")}</span>
                              </span>
                              <span
                                className="text-[9px] px-2 py-0.5 rounded font-mono font-bold text-white shadow-sm"
                                style={{ backgroundColor: "var(--accent-primary)" }}
                              >
                                SECURE
                              </span>
                            </div>
                            <div className={`whitespace-pre-wrap break-words leading-7 sm:leading-8 ${!isExpanded && isCollapsible ? "line-clamp-4 max-h-[140px] overflow-hidden" : ""}`}>
                              {post.decryptedContent}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="p-6 rounded-2xl text-center flex flex-col items-center gap-3 border"
                            style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                          >
                            <div className="text-2xl">🔒</div>
                            <div>
                              <div className="text-sm font-bold text-slate-100">{ft("privatePost")}</div>
                              <p className="text-xs text-slate-400 mt-1">
                                {isPostOwner(post) ? ft("ownerAutoUnlock") : ft("approvedOnly")}
                              </p>
                            </div>
                            {isPostOwner(post) ? (
                              <button
                                onClick={() => handleDecryptPost(post, idx)}
                                disabled={post.isDecrypting}
                                className="text-xs text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md"
                                style={{ backgroundColor: "var(--accent-primary)" }}
                              >
                                {post.isDecrypting ? ft("autoUnlocking") : ft("unlockAgain")}
                              </button>
                            ) : post.payload.key_envelope ? (
                              <div className="flex flex-col items-center gap-2.5">
                                <button
                                  onClick={() => handleDecryptPost(post, idx)}
                                  disabled={post.isDecrypting}
                                  className="text-xs text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer hover:brightness-110 active:scale-95"
                                  style={{ backgroundColor: "var(--accent-primary)" }}
                                >
                                  {post.isDecrypting ? "🔑 正在驗證授權與解密..." : "🔓 點擊解密閱讀 (若已獲作者核准)"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestReadingAccess(post)}
                                  disabled={accessBusyId === post.txId}
                                  className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-slate-600 transition-colors cursor-pointer"
                                >
                                  {accessBusyId === post.txId ? ft("sending") : "尚未申請？點此向作者申請閱讀 →"}
                                </button>
                              </div>
                            ) : (
                              <div className="text-xs text-amber-400">{ft("legacyMustRebackup")}</div>
                            )}
                          </div>
                        )
                      ) : (
                        <div className={`whitespace-pre-wrap break-words leading-7 sm:leading-8 ${!isExpanded && isCollapsible ? "line-clamp-4 max-h-[140px] overflow-hidden" : ""}`}>
                          {post.payload.content}
                        </div>
                      )}
                    </div>

                    {post.isDecrypting && Boolean(post.mediaDecryptTotal) && (
                      <div className="mt-2 text-xs text-slate-400 font-mono">
                        {ft("decryptingAlbum", { done: post.mediaDecryptCompleted || 0, total: post.mediaDecryptTotal || 0 })}
                        {Boolean(post.mediaDecryptFailed) && ft("imageFailures", { count: post.mediaDecryptFailed || 0 })}
                      </div>
                    )}
                    {!post.isDecrypting && Boolean(post.mediaDecryptFailed) && (
                      <div className="mt-2 text-xs text-amber-400 font-mono">
                        {ft("albumPartial", { success: (post.mediaDecryptTotal || 0) - (post.mediaDecryptFailed || 0), total: post.mediaDecryptTotal || 0 })}
                      </div>
                    )}

                    {post.payload.media?.video && (
                      <div
                        className="mt-4 rounded-xl border p-3.5"
                        style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-slate-200">
                              {ft("videoSource", { status: post.payload.media.video_backup_status === "complete"
                                ? ft("videoComplete")
                                : post.payload.media.video_backup_status === "poster_only"
                                  ? ft("videoPoster")
                                  : ft("videoLinkOnly") })}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-400 break-all font-mono">
                              {post.payload.media.video_source_url || post.payload.source_url || ft("noVideoUrl")}
                            </div>
                          </div>
                          {(post.payload.media.video_source_url || post.payload.source_url) && (
                            <a
                              href={post.payload.media.video_source_url || post.payload.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-xs px-3.5 py-2 rounded-xl text-white font-bold transition-all shadow"
                              style={{ backgroundColor: "var(--accent-primary)" }}
                            >
                              {ft("openVideo")}
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Media Gallery (In-Card Seamless Integration) */}
                    {mediaUrls.length > 0 && (
                      <div className="mt-4">
                        {!isExpanded && isCollapsible ? (
                          /* Compact Preview Mode (Single Thumbnail with Badge) */
                          <div
                            onClick={() => openAlbumViewer(mediaUrls, 0, post.payload.media?.album ? ft("album") : ft("backupMedia"))}
                            className="relative max-h-[240px] rounded-2xl overflow-hidden border cursor-zoom-in group/thumb shadow-md"
                            style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                          >
                            <img
                              src={mediaUrls[0]}
                              alt="Post media preview"
                              className="object-cover w-full h-[220px] group-hover/thumb:scale-102 transition-transform duration-300"
                              onError={(e) => {
                                const target = e.currentTarget;
                                const fallback = post.payload.media?.fallback_backup || "";
                                if (!post.payload.is_encrypted && fallback && target.src !== fallback) target.src = fallback;
                              }}
                            />
                            {mediaUrls.length > 1 && (
                              <div
                                className="absolute bottom-3 right-3 backdrop-blur border px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-xl flex items-center gap-1.5"
                                style={{ backgroundColor: "rgba(0, 0, 0, 0.8)", borderColor: "var(--accent-primary)" }}
                              >
                                <span>📷</span> <span>共 {mediaUrls.length} 張照片 (點擊查看)</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Expanded Full Grid Mode */
                          <div
                            className="rounded-2xl overflow-hidden border"
                            style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                          >
                            <div
                              className="flex items-center justify-between px-3.5 py-2.5 border-b text-xs text-slate-300"
                              style={{ borderColor: "var(--border-card)" }}
                            >
                              <span className="font-semibold">{post.payload.media?.video
                                ? ft("videoPosterLabel")
                                : post.payload.media?.album || mediaUrls.length > 1 ? ft("albumCount", { count: mediaUrls.length }) : ft("media")}</span>
                              {post.payload.media?.album_complete === false && (
                                <span className="text-amber-400 font-bold">{ft("incompleteMedia")}</span>
                              )}
                            </div>
                            <div className={`grid gap-2 p-2 ${mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
                              {mediaUrls.map((mediaUrl, mediaIndex) => (
                                <button
                                  type="button"
                                  key={`${post.txId}-media-${mediaIndex}`}
                                  onClick={() => openAlbumViewer(mediaUrls, mediaIndex, post.payload.media?.album ? ft("album") : ft("backupMedia"))}
                                  className="aspect-square flex items-center justify-center overflow-hidden rounded-xl cursor-zoom-in group/img border"
                                  style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
                                  title={ft("openAlbum")}
                                >
                                  <img
                                    src={mediaUrl}
                                    alt={`Platform media ${mediaIndex + 1}`}
                                    className="object-cover w-full h-full group-hover/img:scale-105 transition-transform duration-300"
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
                    )}

                    {/* Tags List block */}
                    {postTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {postTags.map((tag) => (
                          <Link
                            key={tag}
                            href={`${localizedTimelinePath()}?${new URLSearchParams({
                              tag,
                              ...(showHistory ? { history: "true" } : {}),
                              ...(network === "mainnet" ? { network: "mainnet" } : {})
                            }).toString()}`}
                            className="text-xs px-2.5 py-1 rounded-lg font-mono font-medium transition-all border hover:text-white"
                            style={activeTag === tag ? { backgroundColor: "var(--accent-primary)", color: "#ffffff", borderColor: "var(--accent-primary)" } : { backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)", color: "var(--text-secondary)" }}
                          >
                            #{tag}
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Unified Full Post Expand / Collapse Action Bar */}
                    {isCollapsible && (
                      <button
                        type="button"
                        onClick={() => setExpandedPosts((prev) => ({ ...prev, [post.txId]: !isExpanded }))}
                        className="mt-4 w-full py-2.5 px-4 rounded-xl border font-semibold text-xs text-slate-200 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-all shadow-sm"
                        style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                      >
                        {currentTheme === "cat" || searchParams.get("skin") === "cat" ? (
                          isExpanded ? (
                            <><span>🐾</span> <span>喵！咬住收合 ▲</span></>
                          ) : (
                            <>
                              <span>🐾</span>
                              <span>喵！張嘴看完整內文 {mediaUrls.length > 1 ? `與相簿 (共 ${mediaUrls.length} 張)` : ""} ▼</span>
                            </>
                          )
                        ) : (
                          isExpanded ? (
                            <><span>▲</span> <span>收合完整文章</span></>
                          ) : (
                            <>
                              <span>▼</span>
                              <span>展開完整文章 {mediaUrls.length > 1 ? `與相簿 (共 ${mediaUrls.length} 張)` : ""}</span>
                            </>
                          )
                        )}
                      </button>
                    )}
                  </article>
                </div>
              );
            })
          )}
        </div>

        {/* Custom Theme Studio Modal (客製與匯入主題) */}
        {showThemeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
              className="w-full max-w-md border rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
            >
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎨</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">客製與匯入主題 (Theme Studio)</h3>
                    <p className="text-[10px] text-slate-400">自訂配色或匯入主題 JSON 設定檔</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowThemeModal(false)}
                  className="text-slate-400 hover:text-white text-base"
                >
                  ✕
                </button>
              </div>

              {/* Tabs */}
              <div className="flex rounded-xl p-1 border text-xs" style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}>
                <button
                  type="button"
                  onClick={() => setThemeModalTab("picker")}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${themeModalTab === "picker" ? "text-white shadow" : "text-slate-400"}`}
                  style={themeModalTab === "picker" ? { backgroundColor: "var(--accent-primary)" } : {}}
                >
                  🖌️ 調色盤自訂
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setThemeModalTab("json");
                    setThemeJsonInput(JSON.stringify(customTheme, null, 2));
                  }}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${themeModalTab === "json" ? "text-white shadow" : "text-slate-400"}`}
                  style={themeModalTab === "json" ? { backgroundColor: "var(--accent-primary)" } : {}}
                >
                  📥 JSON 匯入/匯出
                </button>
              </div>

              {themeModalTab === "picker" ? (
                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">主題名稱</label>
                    <input
                      type="text"
                      value={customTheme.name}
                      onChange={(e) => setCustomTheme({ ...customTheme, name: e.target.value })}
                      className="w-full rounded-xl px-3 py-2 border text-slate-100 focus:outline-none"
                      style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">背景色 (Page)</label>
                      <div className="flex items-center gap-2 border rounded-xl px-2 py-1" style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}>
                        <input
                          type="color"
                          value={customTheme.bgPage}
                          onChange={(e) => setCustomTheme({ ...customTheme, bgPage: e.target.value })}
                          className="w-7 h-7 rounded border-none bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-[11px] text-slate-300">{customTheme.bgPage}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">卡片底色 (Card)</label>
                      <div className="flex items-center gap-2 border rounded-xl px-2 py-1" style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}>
                        <input
                          type="color"
                          value={customTheme.bgCard}
                          onChange={(e) => setCustomTheme({ ...customTheme, bgCard: e.target.value })}
                          className="w-7 h-7 rounded border-none bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-[11px] text-slate-300">{customTheme.bgCard}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">強調主色 (Accent)</label>
                      <div className="flex items-center gap-2 border rounded-xl px-2 py-1" style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}>
                        <input
                          type="color"
                          value={customTheme.accentPrimary}
                          onChange={(e) => setCustomTheme({ ...customTheme, accentPrimary: e.target.value, accentText: e.target.value })}
                          className="w-7 h-7 rounded border-none bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-[11px] text-slate-300">{customTheme.accentPrimary}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">邊框線條 (Border)</label>
                      <div className="flex items-center gap-2 border rounded-xl px-2 py-1" style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}>
                        <input
                          type="color"
                          value={customTheme.borderCard}
                          onChange={(e) => setCustomTheme({ ...customTheme, borderCard: e.target.value })}
                          className="w-7 h-7 rounded border-none bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-[11px] text-slate-300">{customTheme.borderCard}</span>
                      </div>
                    </div>
                  </div>

                  {/* Live Preview Box */}
                  <div
                    className="p-3.5 rounded-xl border mt-3"
                    style={{ backgroundColor: customTheme.bgCard, borderColor: customTheme.borderCard }}
                  >
                    <div className="text-xs font-bold" style={{ color: customTheme.accentText }}>
                      即時效果預覽 ({customTheme.name})
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">這是一段文字預覽效果，文字清晰且舒適！</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <label className="block text-slate-300 font-semibold">貼上 Theme JSON 設定檔：</label>
                  <textarea
                    value={themeJsonInput}
                    onChange={(e) => setThemeJsonInput(e.target.value)}
                    rows={7}
                    placeholder={`{\n  "name": "我的客製主題",\n  "bgPage": "#0a0f1d",\n  "bgCard": "#121b2f",\n  "borderCard": "#1f2e4d",\n  "accentPrimary": "#38bdf8",\n  "accentText": "#7dd3fc"\n}`}
                    className="w-full rounded-xl p-3 border font-mono text-[11px] text-slate-200 focus:outline-none"
                    style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(themeJsonInput);
                          if (!parsed.bgPage || !parsed.bgCard || !parsed.accentPrimary) {
                            alert("JSON 格式不正確，缺少必要欄位！");
                            return;
                          }
                          setCustomTheme(parsed);
                          saveAndApplyCustomTheme(parsed);
                        } catch (err: any) {
                          alert("無效的 JSON 字串：" + err.message);
                        }
                      }}
                      className="flex-1 py-2 rounded-xl text-white font-bold text-xs"
                      style={{ backgroundColor: "var(--accent-primary)" }}
                    >
                      📥 解析並套用 JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(customTheme, null, 2));
                        alert("已複製主題 JSON 到剪貼簿！可分享給其他使用者！");
                      }}
                      className="px-3 py-2 rounded-xl border text-slate-300 hover:text-white text-xs font-semibold"
                      style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                    >
                      📤 複製 JSON
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => saveAndApplyCustomTheme(customTheme)}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition-all"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  💾 儲存並套用主題
                </button>
                <button
                  type="button"
                  onClick={() => setShowThemeModal(false)}
                  className="px-4 py-2.5 rounded-xl border text-slate-400 hover:text-white text-xs font-medium"
                  style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)" }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wall Skin Setting Modal (回聲壁神獸外觀設定) */}
        {showSkinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
              className="w-full max-w-md border rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}
            >
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🐯</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{ft("wallSkinSetting")}</h3>
                    <p className="text-[10px] text-slate-400">{ft("wallSkinDesc")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSkinModal(false)}
                  className="text-slate-400 hover:text-white text-base"
                >
                  ✕
                </button>
              </div>

              {/* Skin Options */}
              <div className="space-y-3">
                {/* 1. Taiwan Leopard Cat (Pro) */}
                <div
                  onClick={() => setSavedWallSkin("leopard")}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${
                    savedWallSkin === "leopard" ? "border-amber-400 bg-amber-950/30 shadow-lg shadow-amber-500/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                  }`}
                >
                  <img
                    src="/echo/leopardcat/sitting.jpg"
                    alt="Leopard Cat Skin"
                    className="w-16 h-16 rounded-xl object-cover border border-amber-500/40 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-amber-200">{ft("skinLeopard")}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">PRO</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      {locale === "zh-TW" ? "包含 3D 萌系警戒坐姿、點擊翻肚肚露出粉紅肉球、文章在肚皮上展開。" : "3D cute sitting mascot, click to roll over and read on fluffy belly with pink toe beans."}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${savedWallSkin === "leopard" ? "border-amber-400 bg-amber-500 text-slate-950 font-black text-xs" : "border-slate-700"}`}>
                    {savedWallSkin === "leopard" && "✓"}
                  </div>
                </div>

                {/* 2. Classic Obsidian */}
                <div
                  onClick={() => setSavedWallSkin("classic")}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${
                    savedWallSkin === "classic" ? "border-sky-400 bg-sky-950/30 shadow-lg shadow-sky-500/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                  }`}
                >
                  <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                    📄
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-200">{ft("skinClassic")}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">FREE</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      {locale === "zh-TW" ? "極簡石墨鈦灰卡片，專業乾淨的 Web3 去中心化社群歸檔佈局。" : "Minimalist obsidian card layout, clean decentralized Web3 social archive."}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${savedWallSkin === "classic" ? "border-sky-400 bg-sky-500 text-slate-950 font-black text-xs" : "border-slate-700"}`}>
                    {savedWallSkin === "classic" && "✓"}
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      localStorage.setItem("chamber_wall_skin_" + (walletAddress || "default"), savedWallSkin);
                    }
                    setShowSkinModal(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
                >
                  {ft("saveWallSkin")}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-indigo-950/20 text-center text-[9px] text-slate-600 font-mono">
        <p>© 2026 Chamber Protocol • studio.milkcat.org/reborn</p>
        <Link href={locale === "en" ? "/en/guide" : "/guide"} className="inline-block mt-1.5 text-indigo-500 hover:text-indigo-300 hover:underline">
          {ft("guide")}
        </Link>
      </footer>

      {albumViewer && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={ft("albumViewer")}
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
                <a href={albumViewer.urls[albumViewer.index]} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">{ft("openImage")}</a>
                <button type="button" onClick={() => setAlbumViewer(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">{ft("closeEsc")}</button>
              </div>
            </div>
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              <img src={albumViewer.urls[albumViewer.index]} alt={`${albumViewer.title} ${albumViewer.index + 1}`} className="max-w-full max-h-full object-contain select-none" />
              {albumViewer.urls.length > 1 && (
                <>
                  <button type="button" onClick={() => stepAlbumViewer(-1)} aria-label={ft("previousImage")} className="absolute left-2 md:left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-indigo-600 text-2xl">‹</button>
                  <button type="button" onClick={() => stepAlbumViewer(1)} aria-label={ft("nextImage")} className="absolute right-2 md:right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-indigo-600 text-2xl">›</button>
                </>
              )}
            </div>
            <div className="pt-3 overflow-x-auto flex gap-2 justify-start md:justify-center">
              {albumViewer.urls.map((url, index) => (
                <button type="button" key={`${url}-${index}`} onClick={() => setAlbumViewer((current) => current ? { ...current, index } : null)} className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${index === albumViewer.index ? "border-indigo-400" : "border-transparent opacity-60 hover:opacity-100"}`}>
                  <img src={url} alt={ft("thumbnailAlt", { index: index + 1 })} className="w-full h-full object-cover" />
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
