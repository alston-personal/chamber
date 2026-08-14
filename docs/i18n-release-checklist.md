# Chamber 0.6.0 Internationalization Release Checklist

Status: release candidate on `develop`; stable website download remains 0.5.8 until this checklist is signed off.

## Supported locales

- Traditional Chinese (`zh-TW`) — complete.
- English (`en`) — complete.
- Additional locales can be added without changing backup, encryption, mapping, recovery, or access-control logic. Add a catalog to `extension/i18n.js`, a matching Chrome `_locales` catalog, and matching typed Web/Echo catalogs.

## Automated gate

Run from the repository root unless a working directory is shown:

```bash
node scripts/test-i18n.js
node scripts/test-mvp-validation.js
node scripts/test-secret-sharing.js
node scripts/test-recovery-vault.js
node scripts/test-access-store.js
node scripts/test-identity-transfer-guard.js
cd web-feed
npm run test:i18n
npm run build
```

Expected results:

- Extension locale catalogs have identical, non-empty keys.
- Chrome manifest locale catalogs exist for `zh_TW` and `en`.
- Echo functional JSX contains no hardcoded Chinese outside locale catalogs and mock post content.
- `/echo/en`, `/echo/en/guide`, and `/echo/en/{identity}/{platform}` build successfully.
- English and Traditional Chinese timeline metadata provide reciprocal `hreflang` links.
- Backup validation, per-post encryption, reading grants, and 2-of-3 recovery remain unchanged.
- Stable homepage and guide downloads remain pinned to `chamber-extension-v0.5.8.zip` until promotion is authorized.

## Manual verification matrix / 人工驗證矩陣

Perform each row once in Traditional Chinese and once in English.

| Surface | Traditional Chinese | English | Acceptance criteria |
|---|---|---|---|
| Chrome Extensions page | Browser UI set to `zh-TW` | Browser UI set to English | Name and description use the browser locale; manifest loads without error. |
| Side Panel | Select `繁體中文` | Select `English` | Current tab, account, post preview, buttons, errors, status, and version label switch immediately. |
| Persistence | Close and reopen Side Panel | Close and reopen Side Panel | The selected locale persists. |
| Account settings | Check alias, save mapping, return | Same flow in English | Meaning and validation behavior are identical. |
| Recovery | Open setup, provider choice, C confirmation, restore tools | Same flow in English | A/B/C terminology and warnings remain semantically identical; no key material is logged. |
| Facebook picker | Select, cancel with Esc, expand text, load album | Same flow in English | Picker overlays, album progress, author/permalink errors, and success states use the selected language. |
| Backup | Back up one own text/image post | Same flow in English | Encryption, mapping, transaction creation, and Echo links are unchanged. |
| Reborn declaration | Generate and return | Same flow in English | Default declaration, privacy warning, and generation status are localized. |
| Homepage | `/echo` | `/echo/en` | Language switch changes route, copy, document language, and metadata. |
| Guide | `/echo/guide` | `/echo/en/guide` | Installation, Developer mode, mapping, recovery, sharing, and limitations are complete. |
| Echo timeline | `/echo/{identity}/all` | `/echo/en/{identity}/all` | Platform tabs, dates, encrypted states, media labels, and album viewer are localized. |
| Private reading | Request, approve, reject, unlock | Same flow in English | Requests and grants remain per-post; recovery keys are never shared. |
| Share preview | Share Chinese timeline URL | Share English timeline URL | Title, description, canonical URL, locale, and reciprocal language alternatives match the URL. |

## Promotion rule

Do not run `python3 scripts/pack-extension.py --release 0.6.0 --promote`, merge to `main`, create a release tag, deploy the English routes, or update the website download until every manual row above is recorded as passed. Development testing may load `extension/` directly or build an unpromoted ZIP outside `web-feed/public/releases/`.
