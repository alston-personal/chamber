# Chamber Data Portability and Independent Reading

## Echo is a reader, not the storage

Echo is Chamber's official discovery, authorization, decryption, timeline, and album UI. It is not the canonical location of a backup. The canonical objects are the article transaction and its referenced media transactions on the selected Irys/Arweave network.

A backup receipt contains:

- `txId`: immutable article transaction ID
- `arweaveUrl`: direct raw article payload URL
- `echoUrl`: an optional Chamber reading URL
- `network`: `devnet` or `mainnet`

For a known transaction ID:

```text
Devnet: https://devnet.irys.xyz/<TX_ID>
Mainnet: https://arweave.net/<TX_ID>
```

Opening this URL returns the stored JSON payload without using Echo. Encrypted media objects are independently retrievable through the URLs in `media.items[]` or `media.urls[]`.

## What direct access returns

Current encrypted records include these important fields:

- `protocol_version`: payload schema version
- `platform`, `source_url`, `published_at`, `source_author`: source metadata
- `content`: a JSON-encoded AES-GCM encrypted text object
- `is_encrypted`, `encryption_version`: encryption flags and version
- `key_envelope`: the per-post AES key wrapped for the owner
- `media.items[]`: encrypted media URL, IV, content type, and encryption metadata
- `identity_key`, `identity_alias`: discovery metadata
- `logical_source_id`, `backup_timestamp`: revision grouping and backup time

The transaction ID protects the integrity of the stored object, but a raw gateway does not turn encrypted ciphertext into readable text or images.

## How a compatible reader decrypts a post

A non-Echo reader can be implemented from the open payload format:

1. Fetch the article JSON by transaction ID.
2. Parse the encrypted `content` object.
3. Obtain authorized key material:
   - owner path: recover the owner secret through the user's Extension/recovery material and unwrap `key_envelope`;
   - recipient path: obtain the approved recipient envelope and unwrap it with the recipient's P-256 private key.
4. Decrypt article text with the unwrapped per-post AES-GCM key and the text IV.
5. Fetch every referenced encrypted media transaction.
6. Decrypt each media object with the same per-post key and that item's IV, then render it using its recorded content type.

The owner secret, recovery shares, Passkey assertions, and private recipient key must never be sent to a public gateway or embedded in a share URL.

## Discovery without Echo

When the transaction ID is unknown, a reader can query the Irys/Arweave GraphQL index using Chamber's public tags:

- `App-Name=Chamber`
- `Protocol-Version`
- `Identity-Key` or `FB-User-Hash`
- `Platform`
- `Logical-Source-ID`
- `Backup-Time`
- `Irys-Network`

The query result supplies transaction IDs; each transaction can then be fetched directly from its network gateway.

## Current portability boundary

The stored ciphertext and media are independently retrievable today. Echo remains the only completed user-facing reader, and the current Extension bridge intentionally answers only pages on `studio.milkcat.org`; arbitrary websites cannot silently ask it to decrypt owner data.

True application independence therefore requires a compatible reader that implements the schema and cryptography above, plus an explicit owner-controlled key import or authorization flow. A standalone/offline Chamber reader and a versioned public protocol schema are release requirements before mainnet—not prerequisites for proving that the raw Web3 transaction is accessible without Echo.
