/**
 * Chamber Protocol — Mobile QR Pairing Store
 * Manages 5-minute ephemeral pairing sessions between PC Chrome Extension and Mobile Echo Portal.
 */

const crypto = require("crypto");

const pairingSessions = new Map();

// Auto cleanup expired sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of pairingSessions.entries()) {
    if (session.expiresAt < now) {
      pairingSessions.delete(id);
    }
  }
}, 60_000);

function createPairingSession({ ownerUserId, identityAlias, walletAddress, walletPrivateKey }) {
  if (!ownerUserId || !walletPrivateKey) throw new Error("Missing pairing credentials");
  const pairingId = "pair_" + crypto.randomBytes(6).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  pairingSessions.set(pairingId, {
    pairingId,
    ownerUserId,
    identityAlias: identityAlias || "",
    walletAddress: walletAddress || "",
    walletPrivateKey,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return { pairingId, expiresAt, ttlSeconds: 300 };
}

function claimPairingSession(pairingId, deviceModel) {
  const session = pairingSessions.get(pairingId);
  if (!session) throw new Error("Pairing session expired or not found");
  if (session.expiresAt < Date.now()) {
    pairingSessions.delete(pairingId);
    throw new Error("Pairing session has expired");
  }
  const result = {
    ownerUserId: session.ownerUserId,
    identityAlias: session.identityAlias,
    walletAddress: session.walletAddress,
    walletPrivateKey: session.walletPrivateKey,
    deviceModel: deviceModel || "行動裝置",
  };
  session.claimed = true;
  session.deviceModel = result.deviceModel;
  session.claimedAt = Date.now();
  session.expiresAt = Math.min(session.expiresAt, Date.now() + 30_000);
  return result;
}

function getPairingSessionStatus(pairingId) {
  const session = pairingSessions.get(pairingId);
  if (!session) return { exists: false, claimed: false };
  return {
    exists: true,
    claimed: Boolean(session.claimed),
    deviceModel: session.deviceModel || null,
  };
}

module.exports = { createPairingSession, claimPairingSession, getPairingSessionStatus };
