# Chamber Identity Binding Model

This document defines the stable identity layer for Chamber Protocol.

## Goals

- Keep a stable public identity even if the active wallet changes.
- Preserve all historic backups when ownership transfers from one wallet to another.
- Let extension code stay focused on capture and dispatch.
- Let backend code own binding, mapping, transfer history, and canonical URL resolution.

## Core Concepts

### Platform Actor
An account or page on a specific platform.

Examples:

- `facebook:personal:123456789`
- `facebook:page:987654321`
- `instagram:personal:556677`
- `threads:account:778899`
- `x:account:abc123`

### Identity Alias
A short, human-friendly public key for routing.

Examples:

- `abcde`
- `alston`

Canonical routes:

- `/echo/<alias>/fb`
- `/echo/<alias>/ig`
- `/echo/<alias>/threads`
- `/echo/<alias>/x`

### Content Key
The stable storage/query key for historical posts.

Current implementation uses the existing `FB-User-Hash` value as the primary content key.
The alias resolver maps short URLs to this key so historic posts remain queryable after wallet changes.

### Wallet Binding
The current wallet that owns a specific identity alias.

Bindings are mutable. Historic backups are not.

### Transfer History
Ownership changes are appended as immutable transfer events.

## Rules

1. The alias is stable.
2. The wallet can change.
3. Existing backup records stay immutable.
4. A wallet change must be atomic: identity mapping, article-key access, and owner-management capability move together.
5. Public URLs resolve through the backend registry, not through extension storage.
6. Ordinary registration must never overwrite an existing wallet binding; it must enter the verified transfer flow.

## Backend API

### `GET /chamber-api/identity/resolve?alias=<alias>&platform=<platform>`
Returns the current mapping for an alias.

### `GET /chamber-api/identity/check?alias=<alias>&walletAddress=<wallet>`
Checks whether an alias is available for the requesting wallet and returns suggested alternatives when it is taken.

### `POST /chamber-api/identity/register`
Creates or updates a binding record.

### `POST /chamber-api/identity/transfer`
Reserved for the verified transfer coordinator. The current test release returns
`OWNERSHIP_TRANSFER_NOT_READY` instead of creating a broken partial transfer.

### `GET /chamber-api/identity`
Returns the full registry for debugging and administration.

## Backup Flow

1. Extension captures post text and media.
2. Extension sends the payload to the backend.
3. Backend enriches the payload with identity metadata if present.
4. Backend writes the immutable backup to Irys.
5. Backend returns `txId`, `echoUrl`, and the resolved identity fields.

## Transfer Flow

1. User initiates a transfer in Echo.
2. Old owner authorizes release and new owner accepts with a registered Chamber sharing key.
3. The old owner's Extension unwraps every `post-key-v2` article key and wraps it for the new owner's sharing key. Legacy owner-key articles must first be republished as a new encrypted revision.
4. Backend verifies that the handover manifest covers every transferable article.
5. Backend rotates the owner-management capability used for reading requests.
6. Only after steps 2–5 succeed does the registry append the transfer event and change `current_wallet`.
7. The alias, content key, public URL, posts, history, and recipient grants remain unchanged. Echo uses the new owner's transfer envelopes to unlock historic articles.

If any step fails, the registry remains with the old owner; Chamber must never display a partially transferred identity.

## Implementation Notes

- The registry is stored in the AgentOS data layer, not in the code repo.
- Extension state remains lightweight.
- Web feed routes can accept an alias and resolve it to the current content key.
