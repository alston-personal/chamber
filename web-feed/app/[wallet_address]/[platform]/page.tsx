"use client";

import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/locale-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { feedTranslate } from "@/lib/feed-i18n";

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

          // Same source URL means the same logical post. Keep only the latest
          // revision by default; `history=true` is the explicit audit view.
          if (focusTxId) {
            const focused = fetchedPosts.filter((post) => post.txId === focusTxId);
            setPosts((current) => preservePostRuntimeState(focused, current));
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

  // Client-Side Cryptographic Decryption Function
  const requestExtensionDecrypt = (
    ciphertext: string,
    iv: string,
    mode: "text" | "bytes" = "text",
    keyAccess: { ownerKeyEnvelope?: Record<string, unknown> | null; recipientKeyEnvelope?: Record<string, unknown> | null } = {}
  ) => new Promise<{ plaintext: string; data: string }>((resolve, reject) => {
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
      if (!isPostOwner(post)) throw new Error(ft("legacyOwnerOnly"));
      return {};
    }
    if (!extensionIdentity?.sharingKeyId) {
      if (isPostOwner(post)) return { ownerKeyEnvelope: post.payload.key_envelope };
      throw new Error(ft("installExtension"));
    }
    const response = await fetch(`https://studio.milkcat.org/chamber-api/access/grants?postTxId=${encodeURIComponent(post.txId)}&requesterKeyId=${encodeURIComponent(extensionIdentity.sharingKeyId)}`, { cache: "no-store" });
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
      alert(ft("decryptFailed", { error: err.message }));
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
      if (!response.ok) throw new Error(data.error || ft("requestFailed"));
      setStatusMessage(data.request?.status === "approved" ? ft("approvedUnlocking") : ft("requestSent"));
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
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-indigo-950/40 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <Link href={localizedTimelinePath("all")} className="flex items-center gap-2">
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
                {ft("readingRequests")}
                {pendingReadingRequests.length > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[9px] text-white flex items-center justify-center">
                    {pendingReadingRequests.length}
                  </span>
                )}
              </button>
            )}
            <Link
              href={locale === "en" ? "/en/guide" : "/guide"}
              className="text-[10px] sm:text-xs text-slate-400 hover:text-indigo-300 transition-colors"
            >
              {ft("guide")}
            </Link>
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
                <h2 className="text-base font-bold text-indigo-100">{ft("recoveryTitle")}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {ft("recoveryIntro")}
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

            <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-300 hover:text-indigo-200">{ft("restoreToolSummary")}</summary>
              <div className="mt-3 border-t border-slate-800 pt-3">
                <p className="text-[11px] leading-5 text-slate-500">{ft("restoreToolBody")}</p>
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
                  className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {ft("restoreBC")}
                </button>
                <button
                  onClick={restoreWithLocalAAndVaultB}
                  disabled={recoveryBusy}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-transparent px-4 py-2.5 text-xs font-semibold text-slate-400 hover:border-indigo-700 hover:text-indigo-200 disabled:opacity-50"
                >
                  {ft("repairAB")}
                </button>
              </div>
            </details>

            {pendingRecovery && (
              <div className="mt-3 rounded-xl border border-amber-700/60 bg-amber-950/20 p-4">
                <h3 className="text-sm font-semibold text-amber-200">{ft("emergencyCTitle")}</h3>
                <p className="mt-1 text-[11px] leading-5 text-amber-100/70">{ft("emergencyCBody")}</p>
                <textarea readOnly value={pendingRecovery.recoveryCodeC} rows={4} className="mt-3 w-full resize-none rounded-lg border border-amber-800/70 bg-slate-950 p-3 font-mono text-[10px] text-amber-200" />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(pendingRecovery.recoveryCodeC);
                    setRecoveryStatus(ft("cCopied"));
                  }}
                  className="mt-2 w-full rounded-lg bg-amber-800/50 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-700/60"
                >
                  {ft("copyC")}
                </button>
                <button
                  onClick={confirmRecoverySaved}
                  disabled={recoveryBusy}
                  className="mt-2 w-full rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {ft("cSavedElsewhere")}
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
            <div className="font-semibold">{ft("identityUnavailableTitle")}</div>
            <div className="mt-1 text-[10px] text-amber-100/70">{ft("identityUnavailableBody")}</div>
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
                    {request.status === "pending" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => decideReadingRequest(request, "approved")}
                          disabled={accessBusyId === request.id}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {ft("approvePost")}
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
        <nav className="mb-6 flex gap-1.5 overflow-x-auto pb-2 border-b border-slate-900 scrollbar-none">
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
              <div className="text-xs font-semibold text-indigo-200">{ft("singleBackupTitle")}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{ft("singleBackupBody")}</div>
            </div>
            <Link
              href={`${localizedTimelinePath()}?${(() => {
                const query = new URLSearchParams(searchParams.toString());
                query.delete("post");
                return query.toString();
              })()}`}
              className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg transition-colors"
            >
              {ft("backTimeline")}
            </Link>
          </div>
        )}

        {encryptedRemainingCount > 0 && isTimelineOwner && (
          <div className="mb-5 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-indigo-200">{ft("privateTimeline")}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{ft("privateTimelineBody", { count: encryptedRemainingCount })}</div>
            </div>
            <button
              onClick={handleDecryptAll}
              disabled={isDecryptingAll}
              className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-3.5 py-2 rounded-lg transition-colors"
            >
              {isDecryptingAll ? ft("unlockingProgress", { progress: decryptProgress }) : ft("unlockAgain")}
            </button>
          </div>
        )}

        {statusMessage && <div className="mb-4 text-[10px] text-emerald-400">{statusMessage}</div>}

        {/* Dynamic Tag filtering display block */}
        {activeTag && (
          <div className="mb-6 flex items-center justify-between bg-indigo-950/20 border border-indigo-900/40 px-3 py-2 rounded-xl text-xs text-indigo-300">
            <div className="flex items-center gap-1">
              <span>{ft("filteringTag")}</span>
              <span className="font-bold bg-indigo-900/60 px-2 py-0.5 rounded font-mono">#{activeTag}</span>
            </div>
            <Link href={localizedTimelinePath()} className="text-indigo-400 hover:underline hover:text-indigo-300">
              {ft("clearFilter")}
            </Link>
          </div>
        )}

        {/* Timeline Post Flow */}
        <div className="relative border-l border-slate-800 ml-4 pl-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <div className="w-6 h-6 rounded-full border-2 border-t-indigo-500 border-indigo-900/30 animate-spin"></div>
              <p className="text-xs">{ft("loadingPosts")}</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-xs">{ft("noPosts")}</p>
            </div>
          ) : (
            posts.map((post, idx) => {
              const formattedTime = new Date(post.payload.timestamp * 1000).toLocaleString(locale, {
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
                             {ft("fromPlatform", { platform: post.payload.platform || "Chamber" })}
                             {post.payload.source_url && (
                               <a
                                 href={post.payload.source_url}
                                 target="_blank"
                                 rel="noreferrer"
                                 className="text-[9px] bg-indigo-950/40 text-indigo-400 border border-indigo-900/40 px-1.5 py-0.5 rounded font-bold hover:underline hover:text-indigo-300"
                               >
                                 {ft("viewSource")}
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
                            <span className="absolute top-2 right-2 text-[9px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded font-mono">{ft("decrypted")}</span>
                            {post.decryptedContent}
                          </div>
                        ) : (
                          <div className="bg-slate-950 border border-indigo-950/40 p-4 rounded-xl text-center flex flex-col items-center gap-2.5">
                            <div className="text-lg">🔒</div>
                            <div>
                              <div className="text-xs font-semibold text-slate-300">{ft("privatePost")}</div>
                              <p className="text-[9px] text-slate-500 mt-1">
                                {isPostOwner(post) ? ft("ownerAutoUnlock") : ft("approvedOnly")}
                              </p>
                            </div>
                            {isPostOwner(post) ? (
                              <button
                                onClick={() => handleDecryptPost(post, idx)}
                                disabled={post.isDecrypting}
                                className="text-xs bg-indigo-600/80 hover:bg-indigo-500 text-indigo-100 px-4.5 py-1.5 rounded-lg border border-indigo-500/20 transition-all"
                              >
                                {post.isDecrypting ? ft("autoUnlocking") : ft("unlockAgain")}
                              </button>
                            ) : post.payload.key_envelope ? (
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => requestReadingAccess(post)}
                                  disabled={accessBusyId === post.txId}
                                  className="text-xs bg-indigo-600/80 hover:bg-indigo-500 text-indigo-100 px-4.5 py-1.5 rounded-lg border border-indigo-500/20 transition-all disabled:opacity-50"
                                >
                                  {accessBusyId === post.txId ? ft("sending") : ft("requestAuthor")}
                                </button>
                                <button
                                  onClick={() => handleDecryptPost(post, idx)}
                                  disabled={post.isDecrypting}
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300"
                                >
                                  {ft("grantedRetry")}
                                </button>
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-400">{ft("legacyMustRebackup")}</div>
                            )}
                          </div>
                        )
                      ) : (
                        post.payload.content
                      )}
                    </div>

                    {post.isDecrypting && Boolean(post.mediaDecryptTotal) && (
                      <div className="mt-2 text-[10px] text-indigo-300">
                        {ft("decryptingAlbum", { done: post.mediaDecryptCompleted || 0, total: post.mediaDecryptTotal || 0 })}
                        {Boolean(post.mediaDecryptFailed) && ft("imageFailures", { count: post.mediaDecryptFailed || 0 })}
                      </div>
                    )}
                    {!post.isDecrypting && Boolean(post.mediaDecryptFailed) && (
                      <div className="mt-2 text-[10px] text-amber-400">
                        {ft("albumPartial", { success: (post.mediaDecryptTotal || 0) - (post.mediaDecryptFailed || 0), total: post.mediaDecryptTotal || 0 })}
                      </div>
                    )}

                    {post.payload.media?.video && (
                      <div className="mt-3.5 rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-semibold text-indigo-200">
                              {ft("videoSource", { status: post.payload.media.video_backup_status === "complete"
                                ? ft("videoComplete")
                                : post.payload.media.video_backup_status === "poster_only"
                                  ? ft("videoPoster")
                                  : ft("videoLinkOnly") })}
                            </div>
                            <div className="mt-1 text-[9px] text-slate-500 break-all">
                              {post.payload.media.video_source_url || post.payload.source_url || ft("noVideoUrl")}
                            </div>
                          </div>
                          {(post.payload.media.video_source_url || post.payload.source_url) && (
                            <a
                              href={post.payload.media.video_source_url || post.payload.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition-colors"
                            >
                              {ft("openVideo")}
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
                            href={`${localizedTimelinePath()}?${new URLSearchParams({
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
                            ? ft("videoPosterLabel")
                            : post.payload.media?.album || mediaUrls.length > 1 ? ft("albumCount", { count: mediaUrls.length }) : ft("media")}</span>
                          {post.payload.media?.album_complete === false && (
                            <span className="text-amber-400">{ft("incompleteMedia")}</span>
                          )}
                        </div>
                        <div className={`grid gap-1.5 ${mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                          {mediaUrls.map((mediaUrl, mediaIndex) => (
                            <button
                              type="button"
                              key={`${post.txId}-media-${mediaIndex}`}
                              onClick={() => openAlbumViewer(mediaUrls, mediaIndex, post.payload.media?.album ? ft("album") : ft("backupMedia"))}
                              className="aspect-square flex items-center justify-center overflow-hidden bg-slate-950 cursor-zoom-in"
                              title={ft("openAlbum")}
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
