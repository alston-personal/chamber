(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChamberSecretSharing = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function gfMultiply(left, right) {
    let a = left & 0xff;
    let b = right & 0xff;
    let result = 0;
    while (b) {
      if (b & 1) result ^= a;
      const high = a & 0x80;
      a = (a << 1) & 0xff;
      if (high) a ^= 0x1b;
      b >>>= 1;
    }
    return result;
  }

  function gfPower(value, exponent) {
    let result = 1;
    let base = value;
    let power = exponent;
    while (power > 0) {
      if (power & 1) result = gfMultiply(result, base);
      base = gfMultiply(base, base);
      power >>>= 1;
    }
    return result;
  }

  function gfInverse(value) {
    if (!value) throw new Error("Invalid zero field element");
    return gfPower(value, 254);
  }

  function hexToBytes(value) {
    const normalized = String(value || "").toLowerCase();
    if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2) throw new Error("Secret must be even-length hexadecimal");
    return Uint8Array.from(normalized.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(value, "base64"));
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function split2of3(secretHex, randomSource) {
    const secret = hexToBytes(secretHex);
    const coefficient = new Uint8Array(secret.length);
    if (randomSource) randomSource(coefficient);
    else if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(coefficient);
    else throw new Error("Secure random source is unavailable");

    return [1, 2, 3].map((x) => {
      const data = new Uint8Array(secret.length);
      for (let index = 0; index < secret.length; index += 1) {
        data[index] = secret[index] ^ gfMultiply(coefficient[index], x);
      }
      return { x, data: bytesToBase64(data) };
    });
  }

  function combine2of3(shares) {
    if (!Array.isArray(shares) || shares.length < 2) throw new Error("At least two recovery shares are required");
    const first = shares[0];
    const second = shares.find((share) => Number(share.x) !== Number(first.x));
    if (!second) throw new Error("Recovery shares must have different indexes");
    const x1 = Number(first.x);
    const x2 = Number(second.x);
    if (![1, 2, 3].includes(x1) || ![1, 2, 3].includes(x2)) throw new Error("Invalid recovery share index");
    const y1 = base64ToBytes(first.data);
    const y2 = base64ToBytes(second.data);
    if (!y1.length || y1.length !== y2.length) throw new Error("Recovery shares have incompatible lengths");
    const denominatorInverse = gfInverse(x1 ^ x2);
    const secret = new Uint8Array(y1.length);
    for (let index = 0; index < secret.length; index += 1) {
      secret[index] = gfMultiply(gfMultiply(y1[index], x2) ^ gfMultiply(y2[index], x1), denominatorInverse);
    }
    return bytesToHex(secret);
  }

  return { split2of3, combine2of3 };
});
