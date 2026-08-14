const assert = require("node:assert/strict");

require("../extension/platform-threads.js");
const adapter = globalThis.ChamberThreadsPlatform;

assert.deepEqual(
  adapter.parsePermalink("https://www.threads.com/@SunLake/post/DMabc_123?xmt=AQG"),
  { author: "SunLake", shortcode: "DMabc_123", url: "https://www.threads.com/@SunLake/post/DMabc_123" }
);
assert.deepEqual(
  adapter.parsePermalink("https://threads.net/@sunlake/post/Old-Code/"),
  { author: "sunlake", shortcode: "Old-Code", url: "https://www.threads.com/@sunlake/post/Old-Code" }
);
assert.equal(adapter.parsePermalink("https://www.threads.com/@sunlake"), null);
assert.equal(adapter.parsePermalink("https://example.com/@sunlake/post/DMabc"), null);
assert.equal(adapter._testNormalizeHandle(" @SunLake "), "sunlake");
assert.equal(adapter._testIsMoreControl({
  innerText: "More",
  getAttribute: (name) => name === "aria-haspopup" ? "menu" : null,
  querySelector: () => ({})
}), false, "overflow menu must not be mistaken for collapsed post text");
assert.equal(adapter._testIsMoreControl({
  innerText: "See more",
  getAttribute: () => null,
  querySelector: () => null
}), true, "plain See more text control should be expandable");

const text = (value) => ({ nodeType: 3, nodeValue: value });
const element = (tagName, children = [], attrs = {}) => ({
  nodeType: 1,
  tagName,
  childNodes: children,
  getAttribute: (name) => attrs[name] || null
});
const postText = element("DIV", [
  text("First paragraph"),
  element("DIV", [text("Second paragraph")]),
  element("DIV", [element("BR")]),
  element("DIV", [text("Third paragraph")])
]);
assert.equal(adapter._testStructuredText(postText), "First paragraphSecond paragraph\n\nThird paragraph");

console.log("Threads adapter contract passed: canonical links, legacy domain, handle, structured text.");
