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
4. Changing the wallet updates ownership mapping only.
5. Public URLs resolve through the backend registry, not through extension storage.

## Backend API

### `GET /chamber-api/identity/resolve?alias=<alias>&platform=<platform>`
Returns the current mapping for an alias.

### `GET /chamber-api/identity/check?alias=<alias>&walletAddress=<wallet>`
Checks whether an alias is available for the requesting wallet and returns suggested alternatives when it is taken.

### `POST /chamber-api/identity/register`
Creates or updates a binding record.

### `POST /chamber-api/identity/transfer`
Transfers an alias from one wallet to another and appends a transfer event.

### `GET /chamber-api/identity`
Returns the full registry for debugging and administration.

## Backup Flow

1. Extension captures post text and media.
2. Extension sends the payload to the backend.
3. Backend enriches the payload with identity metadata if present.
4. Backend writes the immutable backup to Irys.
5. Backend returns `txId`, `echoUrl`, and the resolved identity fields.

## Transfer Flow

1. User initiates a transfer in the web UI.
2. Old wallet signs or approves release.
3. New wallet signs or accepts ownership.
4. Backend appends a transfer record.
5. Historic posts remain visible under the same alias.

## Implementation Notes

- The registry is stored in the AgentOS data layer, not in the code repo.
- Extension state remains lightweight.
- Web feed routes can accept an alias and resolve it to the current content key.
