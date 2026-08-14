const assert = require("node:assert/strict");
const { isValidFacebookPostUrl, validateBackupPayload } = require("../extension/mvp-validation.js");
require("../extension/platform-facebook.js");

const base = {
  isOwnAuthor: true,
  sourceUrl: "https://www.facebook.com/sunlake/posts/123456789",
  contentExpanded: true,
  textContent: "一篇完整的 Facebook 文章",
  mediaUrls: [],
  media: { album: false, albumComplete: true }
};

assert.equal(validateBackupPayload(base).ok, true, "純文字文章應可備份");
assert.equal(validateBackupPayload({ ...base, textContent: "", mediaUrls: ["https://scontent.xx.fbcdn.net/photo.jpg"] }).ok, true, "單圖文章應可備份");
assert.equal(validateBackupPayload({
  ...base,
  textContent: "",
  mediaUrls: [],
  sourceUrl: "https://www.facebook.com/reel/2434262597094164/",
  media: { videoDetected: true, videoSourceType: "stream" }
}).ok, true, "無文字與封面的影片仍應以永久連結備份");
assert.equal(validateBackupPayload({
  ...base,
  textContent: "相簿",
  sourceUrl: "https://www.facebook.com/media/set/?set=a.123",
  mediaUrls: ["https://scontent.xx.fbcdn.net/1.jpg", "https://scontent.xx.fbcdn.net/2.jpg"],
  media: { album: true, albumComplete: true, albumLoadedCount: 2, albumExpectedCount: 2 }
}).ok, true, "完整相簿應可備份");

assert.equal(validateBackupPayload({ ...base, sourceUrl: "" }).code, "SOURCE_URL_REQUIRED");
assert.equal(validateBackupPayload({ ...base, sourceUrl: "https://www.facebook.com/sunlake/posts/123?comment_id=9" }).ok, true, "文章永久連結附帶留言參數仍應有效");
assert.equal(validateBackupPayload({ ...base, media: { album: true, albumComplete: false } }).code, "ALBUM_INCOMPLETE");
assert.equal(validateBackupPayload({ ...base, isOwnAuthor: false }).code, "AUTHOR_NOT_CONFIRMED");
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/photo/?fbid=123"), true);
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/watch/?v=123"), true);
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/video.php?v=123"), true);
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/idiotforg?v=123456789"), true);
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/share/v/123456789/"), true);
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/reel/1983138152569982/?comment_id=2161286308056736"), true, "Reel 永久連結附帶留言參數仍應有效");
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/idiotforg/?comment_id=2161286308056736"), false, "一般個人頁留言連結不得冒充文章");
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/reel/?s=tab"), false);
assert.equal(isValidFacebookPostUrl("https://www.facebook.com/sunlake"), false);

const textNode = (value) => ({ nodeType: 3, nodeValue: value });
const element = (tagName, children = [], attributes = {}) => ({
  nodeType: 1,
  tagName,
  childNodes: children,
  getAttribute: (name) => attributes[name] || null
});
const facebookMessage = element("DIV", [
  textNode("第一段"),
  element("DIV", [textNode("第二段")]),
  element("DIV", [element("BR")]),
  element("DIV", [textNode("第三段")])
]);
facebookMessage.innerText = "第一段第二段第三段";
assert.equal(
  globalThis.ChamberFacebookPlatform._testExtractMessageText(facebookMessage),
  "第一段第二段\n\n第三段",
  "Facebook div/br 段落應還原為換行，且不可改寫文字"
);

console.log("MVP validation scenarios passed: text, image, album, permalink, author.");
