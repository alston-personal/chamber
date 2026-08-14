const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-access-"));
process.env.CHAMBER_ACCESS_STORE_PATH = path.join(temporaryDirectory, "access.json");
const {
  createAccessRequest,
  listOwnerRequests,
  decideAccessRequest,
  findGrant,
  registerOwnerCapabilityHash,
  verifyOwnerCapability,
} = require("../api/access-store.js");

(async () => {
  const ownerIdentityKey = "owner-key";
  const capability = crypto.randomBytes(32).toString("hex");
  await registerOwnerCapabilityHash(ownerIdentityKey, crypto.createHash("sha256").update(capability).digest("hex"));
  await verifyOwnerCapability(ownerIdentityKey, capability);
  await assert.rejects(() => verifyOwnerCapability(ownerIdentityKey, crypto.randomBytes(32).toString("hex")), /authorization/i);

  const input = {
    postTxId: "post-1",
    ownerIdentityKey,
    ownerAlias: "owner",
    requesterWallet: "0x1234",
    requesterKeyId: "recipient-key",
    requesterPublicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
  };
  const request = await createAccessRequest(input);
  assert.equal((await createAccessRequest(input)).id, request.id, "duplicate pending requests should be idempotent");
  assert.equal((await listOwnerRequests(ownerIdentityKey)).length, 1);
  const recipientKeyEnvelope = { recipient_key_id: input.requesterKeyId, wrapped_key: "ciphertext" };
  await decideAccessRequest(request.id, ownerIdentityKey, "approved", recipientKeyEnvelope);
  assert.deepEqual((await findGrant(input.postTxId, input.requesterKeyId)).recipientKeyEnvelope, recipientKeyEnvelope);
  await assert.rejects(() => decideAccessRequest(request.id, "another-owner", "rejected", null), /another owner/i);
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  console.log("Echo reading request lifecycle scenarios passed.");
})().catch((error) => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
