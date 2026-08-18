const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.CHAMBER_DATA_DIR || "/home/ubuntu/agent-data/projects/metashield-protocol";
const IS_PROD = process.env.NODE_ENV === "production";
const STORE_NAME = IS_PROD ? "identity-registry.json" : "identity-registry.dev.json";
const STORE_PATH = path.join(DATA_DIR, STORE_NAME);

console.log(`ℹ️ [Identity Registry] Environment: ${IS_PROD ? "production" : "development"}. Database file: ${STORE_NAME}`);

function nowIso() {
  return new Date().toISOString();
}

function normalizeAlias(alias) {
  return String(alias || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizePlatform(platform) {
  return String(platform || "facebook").trim().toLowerCase();
}

function normalizeActorType(actorType) {
  return String(actorType || "personal").trim().toLowerCase();
}

function identityKey({ alias, platform, actorType, actorId }) {
  if (alias) {
    return `alias:${normalizeAlias(alias)}`;
  }
  return `${normalizePlatform(platform)}:${normalizeActorType(actorType)}:${String(actorId || "default")}`;
}

function platformSlug(platform) {
  const normalized = normalizePlatform(platform);
  if (normalized === "facebook") return "fb";
  if (normalized === "instagram") return "ig";
  return normalized;
}

function stableContentKey({ identityAlias, fbUserIdHash, platform, actorType, actorId }) {
  if (fbUserIdHash) return fbUserIdHash;
  if (identityAlias) {
    return crypto.createHash("sha256").update(normalizeAlias(identityAlias)).digest("hex").slice(0, 32);
  }
  const raw = `${normalizePlatform(platform)}:${normalizeActorType(actorType)}:${String(actorId || "default")}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function randomDigits(length = 4) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, "0");
}

function platformBindingKey(platform) {
  return platformSlug(platform);
}

function createRootIdentity({ alias, displayName, platform, walletAddress, fbUserIdHash, actorType, actorId, proof }) {
  const normalizedAlias = normalizeAlias(alias);
  const normalizedPlatform = normalizePlatform(platform);
  const slug = platformSlug(normalizedPlatform);
  const contentKey = stableContentKey({
    identityAlias: normalizedAlias,
    fbUserIdHash,
    platform: normalizedPlatform,
    actorType,
    actorId,
  });
  const wallet = walletAddress ? String(walletAddress).trim() : null;
  const now = nowIso();
  const platformBinding = {
    wallet_address: wallet,
    actor_type: normalizeActorType(actorType),
    actor_id: String(actorId || ""),
    display_name: displayName || normalizedAlias,
    binding_status: wallet ? "active" : "pending",
    binding_version: wallet ? 1 : 0,
    binding_history: [],
    transfer_history: [],
    created_at: now,
    updated_at: now,
  };
  if (wallet) {
    platformBinding.binding_history.push({
      type: "bind",
      alias: normalizedAlias,
      platform: normalizedPlatform,
      platform_slug: slug,
      actor_type: platformBinding.actor_type,
      actor_id: platformBinding.actor_id,
      wallet_address: wallet,
      proof: proof ? String(proof) : "",
      bound_at: now,
    });
  }

  return {
    alias: normalizedAlias,
    display_name: displayName || normalizedAlias,
    content_key: contentKey,
    canonical_url_base: `/echo/${normalizedAlias}`,
    current_wallet: wallet,
    binding_status: wallet ? "active" : "pending",
    binding_version: wallet ? 1 : 0,
    platform_bindings: {
      [slug]: platformBinding,
    },
    binding_history: wallet ? [{
      type: "bind",
      alias: normalizedAlias,
      platform: normalizedPlatform,
      platform_slug: slug,
      actor_type: platformBinding.actor_type,
      actor_id: platformBinding.actor_id,
      wallet_address: wallet,
      proof: proof ? String(proof) : "",
      bound_at: now,
    }] : [],
    transfer_history: [],
    created_at: now,
    updated_at: now,
  };
}

async function ensureStore() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    const seed = {
      version: 1,
      updatedAt: nowIso(),
      identities: {},
      aliases: {},
      transfers: [],
    };
    await fs.writeFile(STORE_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return {
    version: parsed.version || 1,
    updatedAt: parsed.updatedAt || nowIso(),
    identities: parsed.identities || {},
    aliases: parsed.aliases || {},
    transfers: parsed.transfers || [],
  };
}

async function writeStore(store) {
  const next = {
    version: 1,
    updatedAt: nowIso(),
    identities: store.identities || {},
    aliases: store.aliases || {},
    transfers: store.transfers || [],
  };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function emptyIdentity({ alias, platform, actorType, actorId, displayName, contentKey }) {
  const normalizedAlias = normalizeAlias(alias);
  return {
    alias: normalizedAlias,
    display_name: displayName || normalizedAlias,
    content_key: contentKey,
    canonical_url_base: `/echo/${normalizedAlias}`,
    current_wallet: null,
    binding_status: "pending",
    binding_version: 0,
    platform_bindings: {},
    binding_history: [],
    transfer_history: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

async function getRegistry() {
  return readStore();
}

function findActorBinding(store, { platform, actorType, actorId }) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedActorType = normalizeActorType(actorType);
  const normalizedActorId = String(actorId || "").trim();
  const slug = platformBindingKey(normalizedPlatform);
  if (!normalizedActorId) return null;
  for (const root of Object.values(store.aliases || {})) {
    const binding = root.platform_bindings?.[slug];
    if (binding &&
        String(binding.actor_id || "") === normalizedActorId &&
        normalizeActorType(binding.actor_type) === normalizedActorType &&
        binding.binding_status !== "revoked") {
      return { alias: root.alias, root, binding, platform: normalizedPlatform, actorType: normalizedActorType, actorId: normalizedActorId };
    }
  }
  return null;
}

async function resolveIdentity({ alias, platform }) {
  const store = await readStore();
  const normalizedAlias = normalizeAlias(alias);
  const root = store.aliases[normalizedAlias];
  if (!root) {
    return null;
  }
  if (!platform) {
    return {
      alias: root.alias,
      display_name: root.display_name,
      content_key: root.content_key,
      canonical_url_base: root.canonical_url_base,
      canonical_url: root.canonical_url_base,
      current_wallet: root.current_wallet,
      binding_status: root.binding_status,
      binding_version: root.binding_version,
      binding_history: root.binding_history || [],
      transfer_history: root.transfer_history || [],
      platform_bindings: root.platform_bindings || {},
    };
  }
  const slug = platformSlug(platform);
  const binding = root.platform_bindings?.[slug];
  if (!binding) {
    return {
      ...root,
      platform: normalizePlatform(platform),
      platform_slug: slug,
      actor_type: null,
      actor_id: null,
      current_wallet: root.current_wallet,
      canonical_url: `${root.canonical_url_base}/${slug}`,
      binding_status: root.binding_status,
      binding_version: root.binding_version,
    };
  }
  return {
    alias: root.alias,
    display_name: binding.display_name || root.display_name,
    content_key: root.content_key,
    canonical_url_base: root.canonical_url_base,
    canonical_url: `${root.canonical_url_base}/${slug}`,
    platform: normalizePlatform(platform),
    platform_slug: slug,
    actor_type: binding.actor_type,
    actor_id: binding.actor_id,
    current_wallet: binding.wallet_address || root.current_wallet,
    binding_status: binding.binding_status,
    binding_version: binding.binding_version,
    binding_history: binding.binding_history || [],
    transfer_history: binding.transfer_history || [],
    root_binding_history: root.binding_history || [],
    root_transfer_history: root.transfer_history || [],
    platform_binding: binding,
  };
}

async function registerIdentity(input) {
  const alias = normalizeAlias(input.alias);
  if (!alias) {
    throw new Error("alias is required");
  }

  const platform = normalizePlatform(input.platform);
  const actorType = normalizeActorType(input.actorType);
  const actorId = String(input.actorId || "").trim();

  const store = await readStore();
  const slug = platformSlug(platform);
  const actorBinding = findActorBinding(store, { platform, actorType, actorId });
  if (actorBinding && actorBinding.alias !== alias) {
    if (input.rebind || input.force) {
      // User requested rebind/transfer: unbind from previous alias
      if (actorBinding.root && actorBinding.root.platform_bindings) {
        delete actorBinding.root.platform_bindings[slug];
        actorBinding.root.updated_at = nowIso();
      }
    } else {
      const error = new Error(`platform identity already belongs to Chamber account "${actorBinding.alias}"`);
      error.code = "IDENTITY_ALREADY_BOUND";
      error.boundAlias = actorBinding.alias;
      throw error;
    }
  }
  const wallet = input.walletAddress ? String(input.walletAddress).trim() : null;
  const proof = input.proof ? String(input.proof) : "";
  const existingRoot = store.aliases[alias];
  const contentKey = existingRoot?.content_key || stableContentKey({
    identityAlias: alias,
    fbUserIdHash: input.fbUserIdHash,
    platform,
    actorType,
    actorId,
  });
  const now = nowIso();
  const bindingEvent = {
    type: "bind",
    alias,
    platform,
    platform_slug: slug,
    actor_type: actorType,
    actor_id: actorId,
    wallet_address: wallet,
    proof,
    bound_at: now,
  };

  const root = existingRoot || createRootIdentity({
    alias,
    displayName: input.displayName,
    platform,
    walletAddress: wallet,
    fbUserIdHash: input.fbUserIdHash,
    actorType,
    actorId,
    proof,
  });
  root.display_name = input.displayName || root.display_name || alias;
  root.content_key = contentKey;
  root.canonical_url_base = `/echo/${alias}`;
  root.binding_status = wallet ? "active" : "pending";
  root.current_wallet = wallet || root.current_wallet || null;
  root.updated_at = now;
  root.platform_bindings = root.platform_bindings || {};

  const existingBinding = root.platform_bindings[slug] || {
    wallet_address: null,
    actor_type: actorType,
    actor_id: actorId,
    display_name: input.displayName || alias,
    binding_status: "pending",
    binding_version: 0,
    binding_history: [],
    transfer_history: [],
    created_at: now,
    updated_at: now,
  };

  if (existingBinding.wallet_address && wallet && existingBinding.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
    const error = new Error("wallet ownership changes require the verified ownership-transfer flow");
    error.code = "OWNERSHIP_TRANSFER_REQUIRED";
    throw error;
  }

  const sameWallet = existingBinding.wallet_address && wallet && existingBinding.wallet_address.toLowerCase() === wallet.toLowerCase();
  existingBinding.actor_type = actorType || existingBinding.actor_type || "personal";
  existingBinding.actor_id = actorId || existingBinding.actor_id || "";
  existingBinding.display_name = input.displayName || existingBinding.display_name || alias;
  existingBinding.binding_status = wallet ? "active" : "pending";
  existingBinding.binding_version = (existingBinding.binding_version || 0) + (sameWallet ? 0 : 1);
  existingBinding.updated_at = now;
  if (wallet && !sameWallet) {
    existingBinding.wallet_address = wallet;
    existingBinding.binding_history = Array.isArray(existingBinding.binding_history) ? existingBinding.binding_history : [];
    existingBinding.binding_history.push(bindingEvent);
    root.binding_history = Array.isArray(root.binding_history) ? root.binding_history : [];
    root.binding_history.push(bindingEvent);
  }
  root.platform_bindings[slug] = existingBinding;
  store.aliases[alias] = root;
  store.identities[alias] = root;
  await writeStore(store);

  return {
    alias: root.alias,
    display_name: root.display_name,
    content_key: root.content_key,
    canonical_url_base: root.canonical_url_base,
    canonical_url: `${root.canonical_url_base}/${slug}`,
    platform,
    platform_slug: slug,
    actor_type: existingBinding.actor_type,
    actor_id: existingBinding.actor_id,
    current_wallet: existingBinding.wallet_address || root.current_wallet,
    binding_status: existingBinding.binding_status,
    binding_version: existingBinding.binding_version,
    binding_history: existingBinding.binding_history || [],
    transfer_history: existingBinding.transfer_history || [],
    root_binding_history: root.binding_history || [],
    root_transfer_history: root.transfer_history || [],
  };
}

async function transferIdentity() {
  const error = new Error("ownership transfer is not enabled until article-key and owner-capability handover is verified");
  error.code = "OWNERSHIP_TRANSFER_NOT_READY";
  throw error;
}

// This registry mutation is intentionally private. A future transfer
// coordinator may call it only after both owners authorize the handover,
// every post-key-v2 article has a recipient envelope for the new owner, and
// the owner access capability has been rotated. Exposing it directly would
// create a timeline that looks transferred while its archives remain locked.
async function commitVerifiedIdentityTransfer({ alias, platform, actorType, actorId, fromWallet, toWallet, proof }) {
  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) {
    throw new Error("alias is required");
  }
  if (!toWallet) {
    throw new Error("toWallet is required");
  }

  const store = await readStore();
  const root = store.aliases[normalizedAlias];
  if (!root) {
    throw new Error("identity not found");
  }
  const slug = platform ? platformSlug(platform) : null;
  const binding = slug ? root.platform_bindings?.[slug] : null;
  const sourceWallet = binding?.wallet_address || root.current_wallet || null;
  if (fromWallet && sourceWallet && sourceWallet.toLowerCase() !== String(fromWallet).toLowerCase()) {
    throw new Error("fromWallet mismatch");
  }

  const event = {
    type: "transfer",
    alias: normalizedAlias,
    platform: slug ? normalizePlatform(platform) : null,
    platform_slug: slug,
    actor_type: binding?.actor_type || root.actor_type || null,
    actor_id: binding?.actor_id || root.actor_id || null,
    from_wallet: fromWallet || sourceWallet,
    to_wallet: String(toWallet).trim(),
    proof: proof ? String(proof) : "",
    transferred_at: nowIso(),
  };

  if (binding) {
    binding.wallet_address = event.to_wallet;
    binding.binding_status = "active";
    binding.binding_version = (binding.binding_version || 0) + 1;
    binding.updated_at = nowIso();
    binding.transfer_history = Array.isArray(binding.transfer_history) ? binding.transfer_history : [];
    binding.transfer_history.push(event);
    root.platform_bindings[slug] = binding;
  } else {
    root.current_wallet = event.to_wallet;
    root.binding_status = "active";
    root.binding_version = (root.binding_version || 0) + 1;
    root.updated_at = nowIso();
    root.transfer_history = Array.isArray(root.transfer_history) ? root.transfer_history : [];
    root.transfer_history.push(event);
  }
  root.current_wallet = event.to_wallet;
  root.updated_at = nowIso();
  store.aliases[normalizedAlias] = root;
  store.transfers = Array.isArray(store.transfers) ? store.transfers : [];
  store.transfers.push(event);
  await writeStore(store);
  return binding ? {
    alias: root.alias,
    display_name: binding.display_name || root.display_name,
    content_key: root.content_key,
    canonical_url_base: root.canonical_url_base,
    canonical_url: `${root.canonical_url_base}/${slug}`,
    platform: normalizePlatform(platform),
    platform_slug: slug,
    actor_type: binding.actor_type,
    actor_id: binding.actor_id,
    current_wallet: binding.wallet_address,
    binding_status: binding.binding_status,
    binding_version: binding.binding_version,
    binding_history: binding.binding_history || [],
    transfer_history: binding.transfer_history || [],
  } : root;
}

async function checkAliasAvailability({ alias, walletAddress }) {
  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) {
    throw new Error("alias is required");
  }
  const store = await readStore();
  const root = store.aliases[normalizedAlias];
  const currentWallet = walletAddress ? String(walletAddress).trim().toLowerCase() : "";
  if (!root) {
    return {
      alias: normalizedAlias,
      available: true,
      ownedByRequester: true,
      suggestions: [],
    };
  }

  const ownedByRequester = currentWallet && (
    root.current_wallet?.toLowerCase() === currentWallet ||
    Object.values(root.platform_bindings || {}).some((binding) => binding.wallet_address && binding.wallet_address.toLowerCase() === currentWallet)
  );

  return {
    alias: normalizedAlias,
    available: ownedByRequester,
    ownedByRequester,
    currentWallet: root.current_wallet,
    displayName: root.display_name,
    suggestions: suggestAliasCandidates(normalizedAlias, store),
  };
}

function suggestAliasCandidates(alias, store, count = 5) {
  const base = normalizeAlias(alias) || "user";
  const taken = new Set(Object.keys(store.aliases || {}));
  const out = [];
  const seen = new Set();
  const push = (display, slug) => {
    const normalized = normalizeAlias(slug);
    if (!normalized || taken.has(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    out.push({
      display,
      alias: normalized,
      url: `/echo/${normalized}`,
    });
  };

  push(base, base);
  while (out.length < count) {
    const digits = randomDigits(4);
    push(`${base}#${digits}`, `${base}-${digits}`);
    if (out.length >= count) break;
    push(`${base}-${digits}`, `${base}-${digits}`);
  }
  return out.slice(0, count);
}

module.exports = {
  getRegistry,
  findActorBinding,
  resolveIdentity,
  registerIdentity,
  transferIdentity,
  checkAliasAvailability,
  suggestAliasCandidates,
  normalizeAlias,
  normalizePlatform,
  normalizeActorType,
  platformSlug,
  stableContentKey,
};
