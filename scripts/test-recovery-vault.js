const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { split2of3, combine2of3 } = require("../extension/secret-sharing.js");

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chamber-vault-"));
  process.env.CHAMBER_RECOVERY_VAULT_PATH = path.join(dir, "vault.json");
  process.env.CHAMBER_RECOVERY_VAULT_SECRET = "test-only-vault-key"; // pragma: allowlist secret
  const vault = require("../api/recovery-vault");
  const secret = crypto.randomBytes(32).toString("hex");
  const shares = split2of3(secret, (bytes) => crypto.randomFillSync(bytes));
  assert.equal(combine2of3([shares[0], shares[1]]), secret, "A+B must recover");
  assert.equal(combine2of3([shares[0], shares[2]]), secret, "A+C must recover");
  assert.equal(combine2of3([shares[1], shares[2]]), secret, "B+C must recover");

  const shareB = {
    format: "chamber-recovery-share-v2",
    scheme: "shamir-2-of-3",
    setId: "set-1",
    facebookUserId: "123",
    ownerAddress: "0x1111111111111111111111111111111111111111",
    identityAlias: "test",
    share: shares[1],
  };
  const registration = await vault.beginRegistration(shareB);
  assert.ok(registration.accountId);
  assert.ok(registration.options.challenge);
  assert.equal(registration.options.authenticatorSelection.userVerification, "preferred", "Bitwarden-compatible registration should prefer, not require, user verification");
  assert.equal(registration.options.timeout, 60_000, "Passkey registration should expose a bounded timeout");
  const raw = await fs.readFile(process.env.CHAMBER_RECOVERY_VAULT_PATH, "utf8");
  assert.equal(raw.includes(shareB.share.data), false, "share B must be encrypted at rest");
  assert.equal(raw.includes(registration.setupToken), false, "registration token must only be stored as a hash");
  await assert.rejects(
    () => vault.finishRegistration(registration.accountId, "wrong-token", {}),
    /invalid/i,
  );
  assert.deepEqual(await vault.cancelRegistration(registration.accountId, registration.setupToken), { cancelled: true });
  const cancelledStore = JSON.parse(await fs.readFile(process.env.CHAMBER_RECOVERY_VAULT_PATH, "utf8"));
  assert.equal(cancelledStore.records.length, 0, "cancelled Passkey registrations must not leave pending Vault records");
  assert.equal(typeof vault.readVaultRecord, "undefined", "Vault must not expose B without Passkey authentication");
  console.log("Recovery Vault A+B/A+C/B+C, encrypted storage and Passkey gate scenarios passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
