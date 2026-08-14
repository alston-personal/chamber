const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-identity-"));
process.env.CHAMBER_DATA_DIR = temporaryDirectory;
const { registerIdentity, resolveIdentity, transferIdentity } = require("../api/identity-registry.js");

(async () => {
  const original = {
    alias: "transfer-test",
    platform: "facebook",
    actorType: "personal",
    actorId: "actor-1",
    displayName: "Transfer Test",
    walletAddress: "0x1111111111111111111111111111111111111111",
  };
  await registerIdentity(original);
  await registerIdentity(original);

  await assert.rejects(
    () => registerIdentity({ ...original, walletAddress: "0x2222222222222222222222222222222222222222" }),
    (error) => error.code === "OWNERSHIP_TRANSFER_REQUIRED"
  );
  await assert.rejects(
    () => transferIdentity({ alias: original.alias, fromWallet: original.walletAddress, toWallet: "0x2222222222222222222222222222222222222222" }),
    (error) => error.code === "OWNERSHIP_TRANSFER_NOT_READY"
  );

  const resolved = await resolveIdentity({ alias: original.alias, platform: original.platform });
  assert.equal(resolved.current_wallet, original.walletAddress, "failed/incomplete transfer must leave the original owner unchanged");
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  console.log("Identity ownership transfer guard scenarios passed.");
})().catch((error) => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
