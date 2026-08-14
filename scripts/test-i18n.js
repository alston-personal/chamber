const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("../extension/i18n.js");

(async () => {
  const i18n = globalThis.ChamberI18n;
  assert.ok(i18n, "Extension i18n API must be available");
  assert.deepEqual(i18n.supportedLocales, ["zh-TW", "en"]);

  const zhKeys = Object.keys(i18n.dictionaries["zh-TW"]).sort();
  const enKeys = Object.keys(i18n.dictionaries.en).sort();
  assert.deepEqual(enKeys, zhKeys, "Every supported locale must contain the same keys");
  for (const locale of i18n.supportedLocales) {
    for (const [key, value] of Object.entries(i18n.dictionaries[locale])) {
      assert.ok(String(value).trim(), `${locale}:${key} must not be empty`);
    }
  }

  const html = fs.readFileSync(path.join(__dirname, "../extension/sidepanel.html"), "utf8");
  const referencedKeys = Array.from(html.matchAll(/data-i18n(?:-placeholder|-aria-label|-title)?="([^"]+)"/g), (match) => match[1]);
  for (const key of referencedKeys) {
    assert.ok(zhKeys.includes(key), `sidepanel.html references missing locale key: ${key}`);
  }

  await i18n.setLocale("en", null);
  assert.equal(i18n.getLocale(), "en");
  assert.equal(i18n.t("settings.save"), "Save and apply");
  assert.equal(i18n.t("backup.transactionCreated", { tx: "abc" }), "Transaction created: abc…");

  await i18n.setLocale("zh-TW", null);
  assert.equal(i18n.getLocale(), "zh-TW");
  assert.equal(i18n.t("settings.save"), "儲存並套用");

  console.log(`Extension i18n scenarios passed: ${zhKeys.length} keys across ${i18n.supportedLocales.length} locales.`);
})();
