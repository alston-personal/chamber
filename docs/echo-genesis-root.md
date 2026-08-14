# Echo Genesis Root of Trust

Status: planned; required before Echo mainnet. This document records the target architecture and does not change the current closed-alpha runtime.

## Decision

Echo does not place an entire website inside an immutable genesis block. Genesis anchors the permanent rules used to identify official Echo resources:

```text
Genesis Anchor
  -> governance keyset and signature threshold
  -> protocol specification hash
  -> Root Manifest hash / transaction ID
  -> manifest update, key rotation, revocation and rollback rules

Signed Root Manifest
  -> website bundle
  -> Chamber Extension release
  -> documentation
  -> explorer and standalone reader
  -> bootstrap gateways
```

DNS names and HTTP gateways are convenience aliases. A resource is official only when its content hash and manifest ancestry verify from the Genesis Anchor.

## Current implementation boundary

Echo currently reconstructs Chamber timelines from Irys/Arweave transactions; it is not yet an independent blockchain with its own block 0. The first implementation will therefore use an immutable **Genesis Anchor transaction** on the selected storage network.

If Echo later launches an independent chain, its block 0 will embed the same protocol identifier, governance rules and Root Manifest commitment. Existing manifest history remains valid instead of being replaced by a second release system.

The current `web-feed/public/releases/latest.json` is only a Web2-served release index. Its version, artifact path and SHA-256 fields are a useful precursor, but it is not canonical until it is signed and linked to the Genesis Anchor.

## Genesis Anchor fields

The versioned genesis payload must include at least:

```json
{
  "type": "echo-genesis-anchor",
  "schema_version": 1,
  "protocol_id": "echo",
  "network_id": "echo-mainnet",
  "created_at": "<RFC3339 timestamp>",
  "spec": {
    "uri": "<content-addressed URI>",
    "sha256": "<hex digest>"
  },
  "governance": {
    "scheme": "threshold-signature-set",
    "threshold": 2,
    "keys": ["<public key A>", "<public key B>", "<public key C>"]
  },
  "root_manifest": {
    "uri": "<content-addressed URI>",
    "sha256": "<hex digest>"
  },
  "rules_hash": "<update and recovery rules digest>"
}
```

Private governance keys must never be stored in the repository, website, Extension package or Genesis payload.

## Signed Root Manifest

Every manifest is immutable and links to its predecessor. A minimum schema contains:

- `manifest_version` and monotonically increasing `sequence`
- `previous_manifest` hash or transaction ID
- `genesis_anchor` transaction ID
- `valid_from`, optional expiry and network
- resource entries containing logical name, semantic version, content-addressed URI, SHA-256, media type and size
- governance keyset version and threshold signatures over canonical manifest bytes
- optional `supersedes`, `revokes` and release notes references

Initial resources:

- Echo website static bundle
- Chamber Extension ZIP and manifest version
- public protocol schema and cryptographic test vectors
- standalone/offline reader
- documentation and explorer
- bootstrap gateway list

## Update and recovery events

The official history must support four signed operations without deleting old data:

1. `ManifestPublished`: activate a newly signed manifest.
2. `ActiveManifestChanged`: deliberately return to an older valid manifest after a regression.
3. `ManifestRevoked`: mark a compromised release invalid for future bootstrap while retaining history.
4. `GovernanceKeysetRotated`: replace lost or compromised governance keys under the existing threshold rules.

A single founder key is not sufficient. Mainnet requires threshold governance, an offline recovery ceremony, documented signer replacement and protection against sequence replay or downgrade attacks.

## Trusted bootstrap

The website cannot prove its own authenticity if DNS, hosting or JavaScript delivery has already been compromised. Verification must begin in a separately trusted component:

- Chamber Extension pins the Genesis Anchor transaction ID and protocol identifier.
- The standalone/offline reader ships the same pin and verification implementation.
- Both fetch manifests from multiple gateways, verify content hashes, manifest ancestry, sequence and threshold signatures, then verify each resource before opening it.
- The website may display verification status, but that display is informative unless the page was launched through a trusted verifier.

No verifier may silently fall back to an unsigned `latest.json` when canonical verification fails.

## Implementation milestones

### G0 — Specification and threat model

- Define canonical JSON encoding and versioned schemas.
- Select signature algorithms and governance threshold.
- Define replay, downgrade, gateway disagreement, signer compromise and recovery behavior.
- Publish deterministic test vectors.

### G1 — Devnet Genesis Anchor

- Publish one immutable devnet anchor transaction.
- Publish a signed Root Manifest referencing the existing versioned website and Extension artifacts.
- Store transaction IDs and public keys in configuration; never private signing material.

### G2 — Independent verifier

- Add a verifier shared by the Extension and standalone reader.
- Resolve through at least two configurable gateways.
- Reject modified artifacts, invalid ancestry, insufficient signatures and sequence rollback.

### G3 — Signed release pipeline

- Build website and Extension artifacts reproducibly.
- Produce hashes and a candidate manifest without activating it.
- Collect threshold signatures in an auditable release ceremony.
- Publish the manifest and update human-readable DNS aliases only after verification.

### G4 — Rotation, revocation and rollback

- Exercise governance key rotation on devnet.
- Revoke a deliberately bad test release and restore a prior valid version.
- Preserve the full manifest/event history in Echo Explorer.

### G5 — Mainnet genesis commitment

- Complete external security review and signer recovery rehearsal.
- Freeze the mainnet genesis payload and governance rules.
- Publish the Genesis Anchor transaction or embed the commitment in Echo block 0 if the independent chain exists by then.

## Mainnet acceptance criteria

- A clean verifier can discover and validate official resources without using `studio.milkcat.org` or GitHub.
- Tampered website, Extension or manifest bytes are rejected.
- One compromised signer cannot publish, revoke or rotate resources below the threshold.
- A bad release can be superseded or rolled back without rewriting history.
- Governance keys can rotate without changing Echo's protocol identity.
- The complete official release history remains independently retrievable from content-addressed storage.
