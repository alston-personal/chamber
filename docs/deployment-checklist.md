# Chamber Deployment Checklist

This checklist verifies the current Chamber test release across the extension, API, and Echo.

The closed-alpha deployment remains Web2-distributed. Before mainnet, the separate Genesis Root of Trust checklist in [`docs/echo-genesis-root.md`](echo-genesis-root.md) must be completed; a checksum served by the same website is not sufficient proof of official identity.

## 1. Confirm The Code On Disk

Make sure the live server is using the current repo version:

- `api/server.js`
- `api/identity-registry.js`
- `extension/popup.js`
- `extension/popup.html`
- `extension/background.js`
- `extension/inject.js`

The identity routes must exist in `api/server.js`:

- `GET /chamber-api/identity`
- `GET /chamber-api/identity/resolve`
- `GET /chamber-api/identity/check`
- `POST /chamber-api/identity/register`
- `POST /chamber-api/identity/transfer`

## 2. Restart The API Service

The most likely fix is that the PM2 process is still running an older build.

Expected service:

- PM2 name: `chamber-api`
- Port: `3011`
- Base URL: `http://localhost:3011/chamber-api`

Suggested commands:

```bash
pm2 restart chamber-api
pm2 logs chamber-api --lines 100
```

If the service is not present, start it from the `api/` folder:

```bash
cd /home/ubuntu/metashield-protocol/api
pm2 start server.js --name chamber-api
```

## 3. Verify Local API Health

Run these checks on the host:

```bash
curl -i http://localhost:3011/chamber-api/health
curl -i http://localhost:3011/chamber-api/identity
curl -i "http://localhost:3011/chamber-api/identity/check?alias=sunlake"
curl -i -X POST http://localhost:3011/chamber-api/identity/register \
  -H "Content-Type: application/json" \
  --data '{"alias":"sunlake","platform":"facebook","actorType":"personal","actorId":"test","displayName":"sunlake","walletAddress":"0x123"}'
```

Expected outcomes:

- `/health` returns `200`
- `/identity` returns `200`
- `/identity/check` returns JSON, not `404`
- `/identity/register` returns JSON, not `404`

## 4. Verify Nginx Proxy

The public domain should proxy:

- `https://studio.milkcat.org/echo` -> `localhost:3010`
- `https://studio.milkcat.org/chamber-api` -> `localhost:3011`

If the local API works but public URLs still fail:

- reload Nginx
- confirm the `studio.milkcat.org` site config still contains the `chamber-api` location block

Suggested commands:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Verify Extension Version

The extension version should be bumped whenever the popup or API flow changes.

Current version target:

- `0.5.8`

Check these files for matching version strings:

- `extension/manifest.json`
- `extension/popup.html`
- `extension/background.js`
- `extension/inject.js`
- `api/server.js`

The extension must send `network: "devnet"` independently from `isDebug: false`. The live Echo must not require `?debug=true` or display a per-post DEBUG badge.

Version 0.4.0 also requires:

- `secret-sharing.js` included in the extension package
- new backups carrying `encryption_version=post-key-v2` and `key_envelope`
- `api/access-store.js` using the AgentOS data layer
- `POST/GET /chamber-api/access/*` routes responding
- Echo owner timelines auto-unlocking through the Extension
- Extension-local share A, Passkey-protected encrypted Recovery Vault share B, and user-held offline emergency code C
- same-device A+C restore and replacement-device Passkey+B+C restore both verified

## 6. Confirm The User Flow

After deploy:

- first-time users land on the setup UI
- existing users land on the normal dashboard
- alias check returns availability or suggestions
- occupied aliases show suggestions like `sunlake#3321`

## 7. If It Still Fails

If `health` works but `identity/*` is still 404 after restart:

- the wrong process is bound to port `3011`
- the code path used by PM2 is not the repo you edited
- Nginx is forwarding to a different service than expected

In that case, inspect:

- `pm2 list`
- `pm2 logs chamber-api`
- `sudo lsof -i :3011`
- the active Nginx config for `studio.milkcat.org`
