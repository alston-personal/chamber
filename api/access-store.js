const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.CHAMBER_DATA_DIR || "/home/ubuntu/agent-data/projects/metashield-protocol";
const STORE_PATH = process.env.CHAMBER_ACCESS_STORE_PATH || path.join(DATA_DIR, "access-requests.json");
let mutationQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(STORE_PATH, "utf8"));
    return { version: 1, updatedAt: parsed.updatedAt || nowIso(), requests: Array.isArray(parsed.requests) ? parsed.requests : [], ownerCapabilities: parsed.ownerCapabilities || {} };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { version: 1, updatedAt: nowIso(), requests: [], ownerCapabilities: {} };
  }
}

async function writeStore(store) {
  const next = { version: 1, updatedAt: nowIso(), requests: store.requests || [], ownerCapabilities: store.ownerCapabilities || {} };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, STORE_PATH);
  return next;
}

function mutate(callback) {
  const operation = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await callback(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
}

function validatePublicKey(value) {
  return value && value.kty === "EC" && value.crv === "P-256" && typeof value.x === "string" && typeof value.y === "string";
}

function capabilityHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function registerOwnerCapabilityHash(ownerIdentityKey, registeredHash) {
  const identityKey = String(ownerIdentityKey || "").trim();
  const normalizedHash = String(registeredHash || "").toLowerCase();
  if (!identityKey || !/^[0-9a-f]{64}$/i.test(normalizedHash)) throw new Error("invalid owner access capability hash");
  return mutate((store) => {
    store.ownerCapabilities ||= {};
    const existing = store.ownerCapabilities[identityKey];
    if (existing && existing !== normalizedHash) throw new Error("owner access capability does not match the registered recovery identity");
    store.ownerCapabilities[identityKey] = normalizedHash;
    return true;
  });
}

async function verifyOwnerCapability(ownerIdentityKey, capability) {
  const store = await readStore();
  const expected = store.ownerCapabilities?.[String(ownerIdentityKey || "").trim()];
  const actual = capabilityHash(capability);
  if (!expected || expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    throw new Error("owner authorization failed");
  }
  return true;
}

async function createAccessRequest(input) {
  const postTxId = String(input.postTxId || "").trim();
  const ownerIdentityKey = String(input.ownerIdentityKey || "").trim();
  const requesterWallet = String(input.requesterWallet || "").trim();
  const requesterKeyId = String(input.requesterKeyId || "").trim();
  if (!postTxId || !ownerIdentityKey || !requesterWallet || !requesterKeyId || !validatePublicKey(input.requesterPublicKey)) {
    const error = new Error("post, owner and requester encryption identity are required");
    error.code = "INVALID_ACCESS_REQUEST";
    throw error;
  }
  return mutate((store) => {
    const existing = store.requests.find((item) => item.postTxId === postTxId && item.requesterKeyId === requesterKeyId && item.status !== "cancelled");
    if (existing) return existing;
    const timestamp = nowIso();
    const request = {
      id: crypto.randomUUID(),
      postTxId,
      ownerIdentityKey,
      ownerAlias: String(input.ownerAlias || "").slice(0, 100),
      requesterWallet: requesterWallet.slice(0, 200),
      requesterAlias: String(input.requesterAlias || "").trim().slice(0, 100),
      requesterKeyId: requesterKeyId.slice(0, 100),
      requesterPublicKey: input.requesterPublicKey,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      recipientKeyEnvelope: null
    };
    store.requests.push(request);
    return request;
  });
}

async function listOwnerRequests(ownerIdentityKey) {
  const store = await readStore();
  return store.requests
    .filter((item) => item.ownerIdentityKey === ownerIdentityKey)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function decideAccessRequest(id, ownerIdentityKey, decision, recipientKeyEnvelope) {
  return mutate((store) => {
    const request = store.requests.find((item) => item.id === id);
    if (!request) throw new Error("reading request not found");
    if (request.ownerIdentityKey !== ownerIdentityKey) throw new Error("reading request belongs to another owner");
    if (!['approved', 'rejected'].includes(decision)) throw new Error("invalid reading request decision");
    if (decision === "approved" && (!recipientKeyEnvelope || recipientKeyEnvelope.recipient_key_id !== request.requesterKeyId)) {
      throw new Error("approved request requires a matching recipient key envelope");
    }
    request.status = decision;
    request.recipientKeyEnvelope = decision === "approved" ? recipientKeyEnvelope : null;
    request.updatedAt = nowIso();
    request.decidedAt = request.updatedAt;
    return request;
  });
}

async function findGrant(postTxId, requesterKeyId) {
  const store = await readStore();
  return store.requests.find((item) => item.postTxId === postTxId && item.requesterKeyId === requesterKeyId && item.status === "approved") || null;
}

module.exports = { createAccessRequest, listOwnerRequests, decideAccessRequest, findGrant, registerOwnerCapabilityHash, verifyOwnerCapability };
