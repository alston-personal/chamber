const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { split2of3, combine2of3 } = require("../extension/secret-sharing.js");

for (let run = 0; run < 32; run += 1) {
  const secret = crypto.randomBytes(32).toString("hex");
  const shares = split2of3(secret, (bytes) => crypto.randomFillSync(bytes));
  assert.equal(combine2of3([shares[0], shares[1]]), secret);
  assert.equal(combine2of3([shares[0], shares[2]]), secret);
  assert.equal(combine2of3([shares[1], shares[2]]), secret);
}

assert.throws(() => combine2of3([]), /two recovery shares/i);
console.log("Shamir 2-of-3 recovery scenarios passed.");
