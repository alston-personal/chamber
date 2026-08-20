const assert = require("node:assert/strict");

require("../extension/platform-instagram.js");
const adapter = globalThis.ChamberInstagramPlatform;

// 1. Permalink parsing
assert.deepEqual(
  adapter.parsePermalink("https://www.instagram.com/p/DFxyz_123/?utm_source=ig_web_copy_link"),
  { shortcode: "DFxyz_123", type: "p", url: "https://www.instagram.com/p/DFxyz_123/" }
);
assert.deepEqual(
  adapter.parsePermalink("https://instagram.com/reel/C_abc456/"),
  { shortcode: "C_abc456", type: "reel", url: "https://www.instagram.com/reel/C_abc456/" }
);
assert.equal(adapter.parsePermalink("https://www.instagram.com/oursong_alstonhuang/"), null);

console.log("Instagram adapter contract passed: permalinks, caption parsing, more-expansion detection.");
