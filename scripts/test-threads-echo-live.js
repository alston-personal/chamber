#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const playwrightPath = process.env.CHAMBER_PLAYWRIGHT_MODULE || "playwright";
const chromiumExecutable = process.env.CHAMBER_CHROMIUM_EXECUTABLE;
const { chromium } = require(playwrightPath);
const baseUrl = process.env.CHAMBER_ECHO_BASE_URL || "https://studio.milkcat.org/echo";

const posts = {
  "threads-new": {
    protocol_version: "0.2.0",
    extension_version: "0.7.2",
    identity_alias: "threadstest",
    identity_key: "threads-content-key",
    author_wallet: "0x1111111111111111111111111111111111111111",
    timestamp: 1786661000,
    published_at: 1786660000,
    platform: "threads",
    content: JSON.stringify({ ciphertext: "cipher-new", iv: "iv-new" }),
    is_encrypted: true,
    encryption_version: "post-key-v2",
    key_envelope: { version: "chamber-owner-envelope-v1", wrapped_key: "wrapped-new", iv: "wrap-iv" },
    media: { urls: [], items: [], album: false },
    source_url: "https://www.threads.com/@threadstest/post/SamePost",
    logical_source_id: "same-logical-post",
    backup_timestamp: 1786661000
  },
  "threads-old": {
    protocol_version: "0.2.0",
    extension_version: "0.7.2",
    identity_alias: "threadstest",
    identity_key: "threads-content-key",
    author_wallet: "0x1111111111111111111111111111111111111111",
    timestamp: 1786660000,
    published_at: 1786659000,
    platform: "threads",
    content: JSON.stringify({ ciphertext: "cipher-old", iv: "iv-old" }),
    is_encrypted: true,
    encryption_version: "post-key-v2",
    key_envelope: { version: "chamber-owner-envelope-v1", wrapped_key: "wrapped-old", iv: "wrap-iv" },
    media: { urls: [], items: [], album: false },
    source_url: "https://www.threads.com/@threadstest/post/SamePost",
    logical_source_id: "same-logical-post",
    backup_timestamp: 1786660000
  }
};

const decrypted = {
  "cipher-new": "Threads latest encrypted revision",
  "cipher-old": "Threads earlier encrypted revision"
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutable || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const graphqlQueries = [];
  const decryptRequests = [];
  const messageEvents = [];
  let approvalDecision = null;
  let readingRequest = null;
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("requestfailed", (request) => browserErrors.push(`${request.url()}: ${request.failure()?.errorText || "failed"}`));

  const waitForText = async (text) => {
    try {
      await page.waitForFunction((value) => document.body?.innerText?.includes(value), text, { timeout: 30_000 });
    } catch (error) {
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1200);
      throw new Error(`${error.message}\nURL: ${page.url()}\nBody: ${body}\nBrowser errors: ${browserErrors.join(" | ")}\nGraphQL calls: ${graphqlQueries.length}\nDecrypt calls: ${decryptRequests.join(",")}\nMessages: ${messageEvents.join(" | ")}`);
    }
  };

  await page.addInitScript(({ decryptedText }) => {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.source !== "echo-portal") return;
      if (event.data.type === "GET_EXTENSION_WALLET") {
        let identity = null;
        try { identity = JSON.parse(localStorage.getItem("chamber-test-identity") || "null"); } catch (_) {}
        identity ||= {
          walletAddress: "0x1111111111111111111111111111111111111111",
          identityAlias: "threadstest",
          identityDisplayName: "Threads Tester",
          sharingKeyId: "threads-owner-sharing-key",
          sharingPublicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
          accessCapability: "owner-capability"
        };
        window.postMessage({
          source: "chamber-extension",
          type: "EXTENSION_WALLET_RESPONSE",
          requestId: event.data.requestId,
          ...identity
        }, window.location.origin);
      }
      if (event.data.type === "DECRYPT_ECHO_CONTENT") {
        window.postMessage({
          source: "chamber-extension",
          type: "DECRYPT_ECHO_CONTENT_RESPONSE",
          requestId: event.data.requestId,
          success: true,
          plaintext: decryptedText[event.data.ciphertext] || "",
          data: ""
        }, window.location.origin);
      }
      if (event.data.type === "CREATE_ECHO_READING_GRANT") {
        window.postMessage({
          source: "chamber-extension",
          type: "CREATE_ECHO_READING_GRANT_RESPONSE",
          requestId: event.data.requestId,
          success: true,
          recipientKeyEnvelope: {
            version: "chamber-recipient-envelope-v1",
            recipient_key_id: event.data.recipientKeyId,
            wrapped_key: "recipient-wrapped-key"
          }
        }, window.location.origin);
      }
    });
  }, { decryptedText: decrypted });

  await page.exposeFunction("__recordDecrypt", (ciphertext) => { decryptRequests.push(ciphertext); });
  await page.exposeFunction("__recordEchoMessage", (value) => { messageEvents.push(value); });
  await page.addInitScript(() => {
    window.addEventListener("message", (event) => {
      if (event.source === window && event.data?.type) {
        globalThis.__recordEchoMessage(`${event.data.source || "?"}:${event.data.type}:${event.data.success ?? ""}:${String(event.data.plaintext || "").slice(0, 40)}`);
      }
      if (event.source === window && event.data?.source === "echo-portal" && event.data.type === "DECRYPT_ECHO_CONTENT") {
        globalThis.__recordDecrypt(event.data.ciphertext);
      }
    });
  });

  await page.route("**/chamber-api/identity/resolve?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        alias: "threadstest",
        platform: "threads",
        displayName: "Threads Tester",
        currentWallet: "0x1111111111111111111111111111111111111111",
        contentKey: "threads-content-key",
        canonicalUrl: "/echo/threadstest/threads"
      })
    });
  });
  await page.route("https://devnet.irys.xyz/graphql", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    graphqlQueries.push(body.query || "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          transactions: {
            edges: ["threads-new", "threads-old"].map((id) => ({
              node: {
                id,
                tags: [
                  { name: "App-Name", value: "Chamber" },
                  { name: "Identity-Key", value: "threads-content-key" },
                  { name: "Platform", value: "threads" },
                  { name: "Backup-Time", value: String(posts[id].backup_timestamp) },
                  { name: "Is-Debug", value: "false" }
                ]
              }
            }))
          }
        }
      })
    });
  });
  await page.route("https://devnet.irys.xyz/threads-*", async (route) => {
    const id = new URL(route.request().url()).pathname.slice(1);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(posts[id]) });
  });
  await page.route("**/chamber-api/access/grants?**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) }));
  await page.route("**/chamber-api/access/requests?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      requests: [{
        id: "threads-reading-request",
        postTxId: "threads-old",
        requesterWallet: "0x2222222222222222222222222222222222222222",
        requesterAlias: "threads-reader",
        requesterKeyId: "threads-reader-key",
        requesterPublicKey: { kty: "EC", crv: "P-256", x: "reader-x", y: "reader-y" },
        status: "pending",
        createdAt: "2026-08-14T03:00:00.000Z"
      }]
    })
  }));
  await page.route("**/chamber-api/access/requests/threads-reading-request/decision", async (route) => {
    approvalDecision = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });
  await page.route("https://studio.milkcat.org/chamber-api/access/requests", async (route) => {
    readingRequest = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, request: { id: "reader-created-request", status: "pending" } })
    });
  });
  await page.route("**/chamber-api/dev-errors", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ success: true }) }));

  await page.goto(`${baseUrl}/threadstest/threads`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForText(decrypted["cipher-new"]);
  assert.equal((await page.locator("body").innerText()).includes(decrypted["cipher-old"]), false, "default timeline keeps latest revision only");
  assert.ok(graphqlQueries.some((query) => /Platform[\s\S]*threads/.test(query)), "Threads route must query only Threads tags");

  await page.goto(`${baseUrl}/threadstest/threads?history=true`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForText(decrypted["cipher-new"]);
  await waitForText(decrypted["cipher-old"]);

  await page.goto(`${baseUrl}/threadstest/threads?post=threads-old`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForText(decrypted["cipher-old"]);
  assert.equal((await page.locator("body").innerText()).includes(decrypted["cipher-new"]), false, "focused Echo link must show exactly its transaction");
  assert.ok(decryptRequests.includes("cipher-new") && decryptRequests.includes("cipher-old"));

  await page.getByRole("button", { name: /Reading requests|閱讀申請/i }).click();
  await page.getByRole("button", { name: /Approve|Allow|核准|允許/i }).click();
  for (let attempt = 0; attempt < 50 && !approvalDecision; attempt += 1) await page.waitForTimeout(100);
  assert.ok(approvalDecision, "approval decision API must be called");
  assert.equal(approvalDecision?.decision, "approved");
  assert.equal(approvalDecision?.ownerIdentityKey, "threads-content-key");
  assert.equal(approvalDecision?.recipientKeyEnvelope?.recipient_key_id, "threads-reader-key");

  await page.evaluate(() => localStorage.setItem("chamber-test-identity", JSON.stringify({
    walletAddress: "0x2222222222222222222222222222222222222222",
    identityAlias: "threads-reader",
    identityDisplayName: "Threads Reader",
    sharingKeyId: "threads-reader-key",
    sharingPublicKey: { kty: "EC", crv: "P-256", x: "reader-x", y: "reader-y" },
    accessCapability: "reader-capability"
  })));
  await page.goto(`${baseUrl}/threadstest/threads?post=threads-old`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const requestButton = page.getByRole("button", { name: /Request author|Request access|申請作者|申請閱讀/i });
  try {
    await requestButton.waitFor({ timeout: 30_000 });
  } catch (error) {
    throw new Error(`${error.message}\nReader body: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1500)}\nMessages: ${messageEvents.slice(-12).join(" | ")}`);
  }
  await requestButton.click();
  for (let attempt = 0; attempt < 50 && !readingRequest; attempt += 1) await page.waitForTimeout(100);
  assert.ok(readingRequest, "reader request API must be called");
  assert.equal(readingRequest.postTxId, "threads-old");
  assert.equal(readingRequest.ownerIdentityKey, "threads-content-key");
  assert.equal(readingRequest.requesterAlias, "threads-reader");
  assert.equal(readingRequest.requesterKeyId, "threads-reader-key");

  console.log(JSON.stringify({
    success: true,
    threadsFilter: true,
    ownerAutoUnlock: true,
    latestRevisionDefault: true,
    history: true,
    focusedPost: true,
    readerRequest: true,
    ownerApproval: true,
    decryptRequestCount: decryptRequests.length
  }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
