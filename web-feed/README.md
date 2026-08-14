# Chamber Echo

Echo is the Chamber web reader for encrypted social-post backups.

## Current behavior

- Resolves a Chamber alias to its stable identity/content key.
- Reads the current test release from Irys Devnet; mainnet is disabled.
- Shows either one focused backup (`?post=<txId>`) or the complete timeline.
- Groups immutable revisions by logical source and shows the newest revision by default.
- Requests owner-only AES-GCM decryption from the installed Chamber extension.
- Decrypts album media with bounded concurrency and preserves partial success.
- Displays Facebook video backups as source-link/poster records; it does not claim the video file was archived.
- Legacy `Is-Debug=true` records remain visible, but Debug is no longer a user-facing mode or URL requirement.

## Local development

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
npm run start -- -p 3010
```
