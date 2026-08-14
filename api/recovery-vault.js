const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.CHAMBER_DATA_DIR || "/home/ubuntu/agent-data/projects/metashield-protocol";
const STORE_PATH = process.env.CHAMBER_RECOVERY_VAULT_PATH || path.join(DATA_DIR, "recovery-vault.json");
const RP_ID = process.env.CHAMBER_WEBAUTHN_RP_ID || "studio.milkcat.org";
const RP_NAME = "Chamber Recovery Vault";
const EXPECTED_ORIGIN = process.env.CHAMBER_WEBAUTHN_ORIGIN || "https://studio.milkcat.org";
const REGISTRATION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();
let mutationQueue = Promise.resolve();

const nowIso = () => new Date().toISOString();
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const tokenHash = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

function secureEqualHash(expected, token) {
  const actual = tokenHash(token);
  return typeof expected === "string" && expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function vaultKey() {
  const source = process.env.CHAMBER_RECOVERY_VAULT_SECRET || process.env.CHAMBER_HASH_SECRET;
  if (!source) throw new Error("Recovery Vault encryption secret is not configured");
  return crypto.createHash("sha256").update(`chamber-recovery-vault-v1:${source}`).digest();
}

function encryptRecord(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { version: "chamber-vault-aes-gcm-v1", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

function decryptRecord(value) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(STORE_PATH, "utf8"));
    return { version: 3, updatedAt: parsed.updatedAt || nowIso(), records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { version: 3, updatedAt: nowIso(), records: [] };
  }
}

async function writeStore(store) {
  const next = { version: 3, updatedAt: nowIso(), records: store.records || [] };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, STORE_PATH);
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

function validateShareB(record) {
  if (record?.format !== "chamber-recovery-share-v2" || record?.scheme !== "shamir-2-of-3" || Number(record?.share?.x) !== 2) throw new Error("Recovery Vault requires Chamber share B");
  if (!record.setId || !record.ownerAddress || !record.facebookUserId || typeof record.share.data !== "string") throw new Error("Recovery Vault share B is incomplete");
}

async function simpleWebAuthn() {
  return import("@simplewebauthn/server");
}

async function beginRegistration(shareB) {
  validateShareB(shareB);
  const { generateRegistrationOptions } = await simpleWebAuthn();
  const accountId = crypto.randomUUID();
  const setupToken = randomToken();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(accountId, "utf8"),
    userName: shareB.identityAlias || `chamber-${accountId.slice(0, 8)}`,
    userDisplayName: shareB.identityAlias || "Chamber 使用者",
    attestationType: "none",
    supportedAlgorithmIDs: [-7, -257],
    timeout: 60_000,
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await mutate((store) => {
    const cutoff = Date.now() - REGISTRATION_TTL_MS;
    store.records = store.records.filter((record) => record.credential || Date.parse(record.createdAt || "") >= cutoff);
    store.records.push({
      id: accountId,
      setupTokenHash: tokenHash(setupToken),
      ownerAddress: String(shareB.ownerAddress).toLowerCase(),
      setId: String(shareB.setId),
      identityAlias: String(shareB.identityAlias || "").slice(0, 100),
      createdAt: nowIso(),
      registrationChallenge: options.challenge,
      authenticationChallenge: null,
      credential: null,
      payload: encryptRecord(shareB),
    });
    return true;
  });
  return { accountId, setupToken, options };
}

async function finishRegistration(accountId, setupToken, response) {
  const { verifyRegistrationResponse } = await simpleWebAuthn();
  const store = await readStore();
  const record = store.records.find((item) => item.id === String(accountId || ""));
  if (!record || !secureEqualHash(record.setupTokenHash, setupToken) || !record.registrationChallenge) throw new Error("Passkey registration session is invalid");
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: record.registrationChallenge,
    expectedOrigin: EXPECTED_ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error("Passkey registration was not verified");
  const info = verification.registrationInfo;
  await mutate((nextStore) => {
    const next = nextStore.records.find((item) => item.id === record.id);
    next.credential = {
      id: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey).toString("base64"),
      counter: info.credential.counter,
      transports: response.response?.transports || info.credential.transports || [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
    };
    next.registrationChallenge = null;
    next.setupTokenHash = null;
    next.updatedAt = nowIso();
    return true;
  });
  return { verified: true, accountId: record.id };
}

async function cancelRegistration(accountId, setupToken) {
  return mutate((store) => {
    const index = store.records.findIndex((item) => item.id === String(accountId || ""));
    if (index < 0) return { cancelled: false };
    const record = store.records[index];
    if (record.credential || !secureEqualHash(record.setupTokenHash, setupToken)) throw new Error("Passkey registration session is invalid");
    store.records.splice(index, 1);
    return { cancelled: true };
  });
}

async function beginAuthentication(accountId) {
  const { generateAuthenticationOptions } = await simpleWebAuthn();
  const store = await readStore();
  const record = store.records.find((item) => item.id === String(accountId || "") && item.credential);
  if (!record) throw new Error("Recovery Vault account was not found");
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    timeout: 60_000,
    userVerification: "preferred",
    allowCredentials: [{ id: record.credential.id, transports: record.credential.transports || [] }],
  });
  await mutate((nextStore) => {
    nextStore.records.find((item) => item.id === record.id).authenticationChallenge = options.challenge;
    return true;
  });
  return { accountId: record.id, options };
}

async function finishAuthentication(accountId, response) {
  const { verifyAuthenticationResponse } = await simpleWebAuthn();
  const store = await readStore();
  const record = store.records.find((item) => item.id === String(accountId || "") && item.credential);
  if (!record || !record.authenticationChallenge || response?.id !== record.credential.id) throw new Error("Passkey authentication session is invalid");
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: record.authenticationChallenge,
    expectedOrigin: EXPECTED_ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: false,
    credential: {
      id: record.credential.id,
      publicKey: Uint8Array.from(Buffer.from(record.credential.publicKey, "base64")),
      counter: record.credential.counter,
      transports: record.credential.transports || [],
    },
  });
  if (!verification.verified) throw new Error("Passkey authentication was not verified");
  const sessionToken = randomToken();
  sessions.set(tokenHash(sessionToken), { accountId: record.id, expiresAt: Date.now() + 5 * 60 * 1000 });
  await mutate((nextStore) => {
    const next = nextStore.records.find((item) => item.id === record.id);
    next.credential.counter = verification.authenticationInfo.newCounter;
    next.authenticationChallenge = null;
    next.updatedAt = nowIso();
    return true;
  });
  return { verified: true, accountId: record.id, sessionToken, shareB: decryptRecord(record.payload) };
}

function consumeSession(accountId, sessionToken) {
  const hash = tokenHash(sessionToken);
  const session = sessions.get(hash);
  if (!session || session.accountId !== accountId || session.expiresAt < Date.now()) throw new Error("Recovery Vault session expired");
  sessions.delete(hash);
}

async function rotateVaultRecord(accountId, sessionToken, shareB) {
  validateShareB(shareB);
  consumeSession(String(accountId || ""), sessionToken);
  return mutate((store) => {
    const record = store.records.find((item) => item.id === String(accountId || "") && item.credential);
    if (!record) throw new Error("Recovery Vault account was not found");
    record.ownerAddress = String(shareB.ownerAddress).toLowerCase();
    record.setId = String(shareB.setId);
    record.payload = encryptRecord(shareB);
    record.updatedAt = nowIso();
    return { accountId: record.id, setId: record.setId, updatedAt: record.updatedAt };
  });
}

module.exports = { beginRegistration, finishRegistration, cancelRegistration, beginAuthentication, finishAuthentication, rotateVaultRecord };
