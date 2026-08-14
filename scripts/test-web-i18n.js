const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../web-feed");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const feed = read("app/[wallet_address]/[platform]/page.tsx");
const functionalFeed = feed.split("function getMockPlatformPosts")[0];
assert.doesNotMatch(functionalFeed, /toLocaleString\(["']zh-TW["']/, "Echo dates must follow the selected locale");
assert.doesNotMatch(functionalFeed, /[一-龥]/, "Echo functional JSX must not contain hardcoded Chinese outside its locale catalog");
assert.match(feed, /<LanguageSwitcher compact routeAware \/>/, "Echo must expose a persistent language switcher");

for (const relativePath of [
  "app/en/page.tsx",
  "app/en/guide/page.tsx",
  "app/en/[wallet_address]/page.tsx",
  "app/en/[wallet_address]/[platform]/page.tsx",
  "app/en/[wallet_address]/[platform]/layout.tsx",
]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `Missing English route: ${relativePath}`);
}

const homepage = read("app/page.tsx");
const guide = read("app/guide/page.tsx");
assert.match(homepage, /chamber-extension-v0\.5\.8\.zip/, "Stable homepage download must remain pinned to 0.5.8");
assert.match(guide, /chamber-extension-v0\.5\.8\.zip/, "Stable guide download must remain pinned to 0.5.8");
assert.ok(!fs.existsSync(path.join(root, "public/releases/chamber-extension-v0.5.9.zip")), "Localization work must not publish a new stable download before release approval");

console.log("Web i18n routes, UI, locale dates, SEO route coverage, and stable-download guard passed.");
