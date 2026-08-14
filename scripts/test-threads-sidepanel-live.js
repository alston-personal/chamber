#!/usr/bin/env node
"use strict";

// Optional live-browser acceptance harness. It uses a rendered public Threads
// page, while Chrome APIs and the final upload are deterministic fakes. Install
// Playwright outside the production bundle and set CHAMBER_PLAYWRIGHT_MODULE
// when it is not resolvable from this repository.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const playwrightPath = process.env.CHAMBER_PLAYWRIGHT_MODULE || "playwright";
const chromiumExecutable = process.env.CHAMBER_CHROMIUM_EXECUTABLE;
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, "..");
const threadsUrl = process.env.CHAMBER_THREADS_LIVE_URL || "https://www.threads.com/@threads";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutable || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const threads = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
  await threads.addInitScript({ content: fs.readFileSync(path.join(root, "extension/platform-threads.js"), "utf8") });
  await threads.goto(threadsUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await threads.waitForTimeout(8_000);
  const liveHandle = await threads.evaluate(() => location.pathname.match(/^\/@([^/]+)/)?.[1] || "threads");

  const panel = await browser.newPage({ viewport: { width: 390, height: 900 } });
  let sentMessage = null;
  let openedUrl = "";

  await panel.exposeFunction("__chamberExecuteScript", async ({ source, args, files }) => {
    if (files?.length) return [{ result: null }];
    if (source.includes("getAccountContext")) return [{ result: { handle: liveHandle } }];
    if (source.includes("startPicker")) {
      const result = await threads.evaluate(
        ({ platform, pageUrl, expectedHandle }) => {
          const adapter = platform === "threads" ? globalThis.ChamberThreadsPlatform : globalThis.ChamberFacebookPlatform;
          return adapter.startPicker(pageUrl, expectedHandle);
        },
        { platform: args[0], pageUrl: args[1], expectedHandle: args[2] }
      );
      return [{ result }];
    }
    if (source.includes("refreshSelected")) {
      const result = await threads.evaluate(
        ({ platform, pageUrl, sourceUrl, selectedText, expectedHandle }) => {
          const adapter = platform === "threads" ? globalThis.ChamberThreadsPlatform : globalThis.ChamberFacebookPlatform;
          return adapter.refreshSelected(pageUrl, sourceUrl, selectedText, expectedHandle);
        },
        { platform: args[0], pageUrl: args[1], sourceUrl: args[2], selectedText: args[3], expectedHandle: args[4] }
      );
      return [{ result }];
    }
    if (source.includes("chamber:cancel-picker")) {
      await threads.evaluate(() => {
        document.dispatchEvent(new CustomEvent("chamber:cancel-picker"));
        globalThis.__chamberPickerCancel?.();
      });
      return [{ result: { cancelled: true } }];
    }
    throw new Error(`Unhandled injected function: ${source.slice(0, 100)}`);
  });
  await panel.exposeFunction("__chamberSendMessage", async (message) => {
    sentMessage = message;
    return {
      success: true,
      txId: "threads-sidepanel-test-tx",
      arweaveUrl: "https://devnet.irys.xyz/threads-sidepanel-test-tx",
      echoUrl: "https://studio.milkcat.org/echo/threadstest/threads?post=threads-sidepanel-test-tx",
      network: "devnet"
    };
  });
  await panel.exposeFunction("__chamberOpenTab", async (url) => { openedUrl = url; return { id: 2, url }; });

  await panel.addInitScript(({ activeUrl }) => {
    const store = {
      lastFbUserId: "owner-1",
      activeChamberProfileId: "profile-1",
      chamberProfiles: [{
        id: "profile-1",
        name: "Threads Tester",
        alias: "threadstest",
        walletAddress: "0x1111111111111111111111111111111111111111",
        ownerUserId: "owner-1"
      }],
      "user_owner-1_identityAlias": "threadstest",
      "user_owner-1_nativeWalletAddress": "0x1111111111111111111111111111111111111111",
      "user_owner-1_nativeWalletPrivateKey": "1".repeat(64),
      "user_owner-1_recoveryExportedAt": "2026-08-14T00:00:00.000Z",
      "user_owner-1_recoveryLocalShare": "local-a",
      "user_owner-1_recoveryExportConfirmedVersion": "2-of-3-vault-v1"
    };
    const pick = (keys) => {
      if (keys == null) return { ...store };
      if (typeof keys === "string") return { [keys]: store[keys] };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, store[key]]));
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, store[key] ?? fallback]));
    };
    globalThis.fetch = async () => ({ ok: true, status: 202, json: async () => ({ success: true }), text: async () => "" });
    globalThis.chrome = {
      runtime: {
        lastError: null,
        getManifest: () => ({ version: "0.7.0" }),
        sendMessage: (message, callback) => globalThis.__chamberSendMessage(message).then(callback)
      },
      tabs: {
        query: async () => [{ id: 1, url: activeUrl, active: true }],
        create: ({ url }) => globalThis.__chamberOpenTab(url)
      },
      cookies: { get: async ({ name }) => name === "ds_user_id" ? { value: "threads-user-1" } : null },
      scripting: {
        executeScript: ({ files, func, args = [] }) => globalThis.__chamberExecuteScript({
          files: files || [],
          source: func ? String(func) : "",
          args
        })
      },
      storage: {
        local: {
          get: (keys, callback) => {
            const value = pick(keys);
            if (callback) { callback(value); return; }
            return Promise.resolve(value);
          },
          set: (values, callback) => {
            Object.assign(store, values);
            callback?.();
            return Promise.resolve();
          },
          remove: (keys, callback) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
            callback?.();
            return Promise.resolve();
          }
        },
        onChanged: { addListener: () => {} }
      }
    };
  }, { activeUrl: threadsUrl });

  await panel.goto(`file://${path.join(root, "extension/sidepanel.html")}`);
  await panel.waitForFunction(() => document.querySelector("#selectButton")?.textContent?.includes("Threads"));
  assert.equal(await panel.locator("#selectButton").isEnabled(), true, "mapped Threads account should enable selection");
  assert.match(await panel.locator("#profileSelect").inputValue(), /profile-1/);

  await panel.locator("#selectButton").click();
  await threads.waitForSelector(".chamber-picker-banner");
  const pickedUrl = await threads.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a[href*="/@threads/post/"]')).find((item) => item.querySelector("time"))
      || document.querySelector('a[href*="/@threads/post/"]');
    if (!link) throw new Error("No live Threads post was rendered");
    link.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window }));
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return link.href;
  });
  await panel.waitForSelector("#postList .post button");
  assert.match(await panel.locator("#postList").innerText(), /threads\.com|Threads|\S/);

  await panel.locator("#postList button").click();
  await panel.waitForSelector("#result a[href*='/echo/']");
  assert.equal(sentMessage?.action, "BACKUP_HISTORIC_POST");
  assert.equal(sentMessage?.payload?.platform, "threads");
  assert.equal(sentMessage?.payload?.fbUserId, "owner-1");
  assert.equal(sentMessage?.payload?.identityActorId, "threads-user-1");
  assert.equal(sentMessage?.payload?.isOwnAuthor, true);
  assert.equal(sentMessage?.payload?.sourceUrl, new URL(pickedUrl).origin + new URL(pickedUrl).pathname);

  await panel.locator("#declarationButton").click();
  await panel.locator("#recoveryExport").click();
  await panel.waitForTimeout(50);
  assert.equal(openedUrl, "https://studio.milkcat.org/echo/threadstest/all?recovery=true");

  await panel.locator("#settingsBack").click();
  await panel.locator("#selectButton").click();
  await threads.waitForSelector(".chamber-picker-banner");
  await panel.keyboard.press("Escape");
  await threads.waitForFunction(() => !document.querySelector(".chamber-picker-banner"));
  await panel.waitForFunction(() => document.querySelector("#selectButton")?.textContent?.includes("Threads"));
  assert.equal(await threads.locator(".chamber-picker-target").count(), 0);

  console.log(JSON.stringify({
    success: true,
    platform: sentMessage.payload.platform,
    sourceUrl: sentMessage.payload.sourceUrl,
    contentLength: sentMessage.payload.textContent.length,
    mediaCount: sentMessage.payload.mediaUrls.length,
    recoveryUrl: openedUrl,
    cancelClean: true
  }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
