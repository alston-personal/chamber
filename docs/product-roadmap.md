# Chamber Product Roadmap

## Current test release behavior

- Storage network is explicitly `devnet`; mainnet remains disabled.
- Network selection is independent from internal diagnostics. New records use `Is-Debug=false`, Echo does not require `?debug=true`, and legacy debug-tagged devnet records remain visible.
- Owner content and supported images are encrypted locally with AES-GCM.
- New backups use a random per-post content key wrapped by an owner envelope; legacy owner-key records remain readable.
- Echo automatically unlocks the owner's visible timeline and provides an Echo-native reading-request inbox for permanent single-post grants.
- Recovery uses Shamir `2-of-3`: Extension-local A, encrypted Recovery Vault B protected by a Passkey, and an offline emergency code C held by the user. Same-device recovery can use A+C; replacement-device recovery authenticates the Passkey and uses B+C.
- Facebook video backup is link/poster only; complete video files remain deferred.
- Echo supports one-click page decryption, bounded album-media decryption, single-post links, full-timeline links, and immutable revision history.
- Echo is a replaceable official reader. Raw article/media transactions remain directly addressable by transaction ID; a standalone/offline compatible reader is still required for fully independent human-readable decryption.

## MVP scope

The MVP remains focused on validating the core path:

- Explicitly select the user's own Facebook post.
- Capture complete text and supported media/album content.
- Encrypt locally and back up to the Irys devnet.
- Confirm the transaction ID and render the result in Echo.
- Allow another Chamber identity to request and receive an encrypted single-post reading grant without receiving the owner's recovery key.

The MVP does not implement user-paid storage, platform fees, production-wallet payments, or mainnet billing.

## Next: alias-based reading permissions

Echo will present reading permissions in terms of Chamber identities, never raw wallet addresses:

- The article owner opens `閱讀權限` on a single article.
- The default remains `只有自己`.
- The owner searches or selects Chamber contacts by nickname/alias and checks who may read.
- Echo resolves each alias to that identity's registered public sharing key. The owner's Extension wraps only that article's content key for each selected recipient; neither Echo nor the recipient receives the owner's recovery key.
- Existing `向作者申請閱讀` remains available for people who are not already selected. Owner notifications and decisions show the requester's alias first and the shortened technical address only as secondary detail.
- The recipient list and social graph remain off-chain. Revoking access blocks future key retrieval, but cannot erase plaintext or a key the recipient already saved.

This is a Chamber contact list, not an imported Facebook friends list. Importing Facebook friends would require additional platform authorization and is outside the backup MVP.

## Required before ownership transfer is enabled

- Old and new owner must both authorize the transfer.
- Every `post-key-v2` article key must be wrapped for the new owner's Chamber sharing key before the registry changes owner.
- Legacy owner-key records require a new encrypted revision; transferring only their alias/wallet metadata is forbidden.
- Reading-request administration must rotate to the new owner's capability.
- Echo keeps the stable alias/content key and resolves historic articles through new-owner transfer envelopes.
- The operation is atomic: failure leaves the old owner and all mappings unchanged.

The existing raw transfer endpoint is intentionally closed until this coordinator and its coverage checks are implemented.

## Required before mainnet: portable reader and public schema

- Publish a versioned JSON schema for article payloads, media items, owner envelopes, and recipient envelopes.
- Publish test vectors for owner-envelope unwrap, recipient-envelope unwrap, text decryption, and media decryption.
- Provide a standalone/offline reader that accepts a transaction ID and explicit owner-controlled recovery/key input.
- Keep direct gateway and GraphQL discovery instructions independent from Echo routes.
- Define migration rules so a reader can support older protocol versions without depending on the current Echo implementation.

## Required before mainnet: Echo Genesis Root of Trust

Status: planned — specification recorded in [`docs/echo-genesis-root.md`](echo-genesis-root.md).

- Publish an immutable Genesis Anchor transaction containing Echo's protocol identity, specification commitment, initial Root Manifest commitment and threshold-governance rules.
- Replace the unsigned Web2 `latest.json` trust model with immutable, predecessor-linked Root Manifests signed by the required governance threshold.
- Put content-addressed website, Extension, documentation, explorer and standalone-reader artifacts in each manifest; never place the complete mutable website directly in genesis.
- Pin the Genesis Anchor in Chamber Extension and the standalone reader so DNS and gateways remain replaceable aliases rather than the source of official identity.
- Implement governance-key rotation, manifest revocation, deliberate rollback and downgrade/replay protection before mainnet.
- Demonstrate independent recovery of the official frontend and clients without `studio.milkcat.org` or GitHub.

Implementation order is G0 specification/threat model, G1 devnet anchor, G2 independent verifier, G3 signed release pipeline, G4 rotation/revocation/rollback rehearsal, and G5 mainnet commitment.

## Deferred: full-quality paid backups

Status: Future version — explicitly out of MVP scope.

Goal: allow users to pay for original/full-quality permanent storage while Chamber receives a transparent maintenance fee.

Planned model:

1. Calculate the encrypted upload's final byte size.
2. Request the current Irys storage quote.
3. Present an itemized quote before payment:
   - Irys permanent-storage cost
   - pricing/risk buffer
   - Chamber maintenance fee
   - total paid by the user
4. Accept USDC or another supported payment asset through Chamber credits or a non-custodial payment contract.
5. Let the Chamber uploader pay Irys and return the Irys receipt, transaction ID, quote ID, and payment breakdown.
6. Never expose or transfer the user's content-encryption key during payment.

Recommended first implementation: prepaid USDC Chamber credits with one user approval and server-side Irys settlement. Avoid requiring one wallet signature per image.

Prerequisites:

- Replace the current locally generated address/secret placeholder with a real signable wallet or embedded-wallet integration.
- Separate devnet and mainnet accounting.
- Add signed, expiring upload quotes and idempotent settlement records.
- Define refund behavior for partial album failures.
- Add transparent receipts and an account-level usage/credit history.
- Complete security, tax, payment, and regulatory review before public mainnet billing.

Alternative considered: user funds Irys directly and separately pays Chamber. This remains lower priority because it requires multiple payment steps and cannot provide a clean atomic upload/fee experience.

## Deferred: complete Facebook video backup

Status: Future version — explicitly out of MVP scope.

The MVP may preserve a video's text, canonical Facebook permalink, and HTTP poster image. It must not claim that a `blob:` or Media Source Extensions stream is the original video file.

Complete video support requires:

- Resolve a stable Facebook video permalink and video identifier.
- Detect direct MP4 sources or capture the DASH/HLS manifest and all required segments.
- Download and, when necessary, mux segments into a portable media file.
- Enforce duration/size limits and show a storage quote before upload.
- Encrypt the completed file locally before permanent storage.
- Store MIME type, dimensions, duration, checksum, and source metadata.
- Render decrypted video with a native Echo video player instead of the image gallery.
- Review Facebook platform terms and copyright implications before public release.

### Upgrade semantics for link-only video records

Video records created by the MVP carry a stable `logical_source_id`, a `video_backup_status` of `link_only` or `poster_only`, and the canonical `video_source_url`.

When full video capture becomes available, Chamber must not mutate the immutable MVP transaction. It creates a new revision with the same `logical_source_id`, marks the new media as `complete`, and may reference the earlier transaction through a future `enriches_tx` or `supersedes_tx` field.

Echo behavior:

- Normal timeline groups by `logical_source_id` and displays the newest usable revision.
- History mode shows both the original link-only transaction and the later full-video revision.
- If the Facebook source disappears before enrichment, retain the link-only record and report that the media can no longer be recovered; never fabricate a completed backup.

Existing transactions without `logical_source_id` remain compatible because Echo derives the same logical key from `source_url` at read time.
