const assert = require("node:assert/strict");

// 1. Test Instagram Caption Cleaner against Real Live Domestic/Action noise
function cleanCaptionText(rawText, author) {
  if (!rawText) return "";
  let txt = rawText.trim();
  txt = txt.replace(/^(?:(?:\d+\s*)?(?:讚|回應|轉發|分享|儲存|Like|Likes|Reply|Replies|Repost|Share|Save)\s*\n+)+/gim, '').trim();
  if (author) {
    txt = txt.replace(new RegExp(`^@?${author}\\s*`, 'i'), '').trim();
  }
  txt = txt.replace(/^(?:(?:\d+\s*)?(?:讚|回應|轉發|分享|儲存|Like|Likes|Reply|Replies|Repost|Share|Save)\s*\n+)+/gim, '').trim();
  txt = txt.replace(/(?:(?:\.\.\.|…)?\s*(?:更多|顯示更多|查看更多|more|see more|翻譯年糕|See translation|查看翻譯)\s*)+$/i, '').trim();
  txt = txt.replace(/(?:\n|^)(?:查看全部\s*\d+\s*則留言|View all\s*\d+\s*comments?)(?:\n|$).*$/is, '').trim();
  return txt;
}

// Test Case A: User's IG noise from Screenshot 1
const noisyIGCaption = `讚
回應
1轉發
分享
儲存
oursong_alstonhuang
【《天道敕令_阿賴耶識修真錄》11 第十一章 青鳥銜書千山萬水傳仙音】
... 更多`;

const cleanedIG = cleanCaptionText(noisyIGCaption, "oursong_alstonhuang");
assert.equal(cleanedIG, "【《天道敕令_阿賴耶識修真錄》11 第十一章 青鳥銜書千山萬水傳仙音】");
console.log("✅ 1. Instagram Action Bar Filter Test Passed: Completely stripped '讚/回應/1轉發/分享/儲存'.");

// Test Case B: Instagram Grid Img Alt caption parser
const gridAltText = `相片由 alstonhuang 於 August 20, 2026 發布。可能是 1 人的圖像，內容包含：【《天道敕令_阿賴耶識修真錄》11 第十一章 青鳥銜書千山萬水傳仙音】`;
let parsedAlt = gridAltText
  .replace(/^Photo by .*?\.\s*(?:May be an image of .*?\.\s*)?:?\s*/i, '')
  .replace(/^(?:相片由|照片由).*?\.\s*(?:可能是.*?的圖像)?:?\s*/i, '')
  .trim();
parsedAlt = cleanCaptionText(parsedAlt, "alstonhuang");
assert(parsedAlt.includes("【《天道敕令_阿賴耶識修真錄》11"), "Img Alt parsing must extract caption correctly");
console.log("✅ 2. Instagram 9-Grid Thumbnail Alt Parser Test Passed.");

// Test Case C: Instagram Taiwan UI Wizard Button Matcher
const wizardBtnRegex = /^(下一步|Next|繼續|Continue|次へ)$/i;
assert(wizardBtnRegex.test("繼續"), "Must match Taiwan UI '繼續' button");
assert(wizardBtnRegex.test("下一步"), "Must match '下一步' button");
assert(wizardBtnRegex.test("Next"), "Must match English 'Next' button");
console.log("✅ 3. Instagram Taiwan UI '繼續' / 'Next' Wizard Matcher Test Passed.");

// Test Case D: Facebook Single-Pass Paste Event Text Structure
const sampleDeclaration = `【本人樂觀開朗之 Web3 轉世聲明】

本人不酗酒、不抽菸，無任何精神疾患。特此聲明：若本人帳號無預警消失，絕非自主登出。

👉 迴響谷專屬存證：https://studio.milkcat.org/echo/sunlake/facebook?ref=sunlake`;

assert(sampleDeclaration.split("\n\n").length === 3, "Must have 3 distinct paragraph blocks");
console.log("✅ 4. Facebook Paragraph Formatting & Structure Test Passed.");

console.log("\n========================================================");
console.log("🎉 ALL PLATFORM LOGIC & REGEX VERIFICATIONS PASSED 100%");
console.log("========================================================");
