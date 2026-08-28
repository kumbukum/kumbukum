---
title: Streamient Obsidian Sync Guide
description: Synchronize Markdown, Canvas, Bases, documents, and attachments between an Obsidian vault and Streamient.
---

# Obsidian Sync

Streamient Sync is a first-party Obsidian plugin for two-way synchronization between one vault and one Streamient project. It runs inside Obsidian, connects to hosted or self-hosted Streamient, works on desktop and mobile, and supports multiple devices on the same connection.

::: info Availability
Obsidian Sync requires the **Pro** plan or a **self-hosted** installation. The server must enable `OBSIDIAN_SYNC_ENABLED`.
:::

## What Syncs

- Markdown files become Streamient Notes by default.
- Markdown with `streamient_type: memory` becomes Streamient Memory.
- Canvas and Bases content is mirrored and indexed.
- Supported PDFs, Word documents, and text files are mirrored and text-indexed.
- Images, audio, video, and other attachments are mirrored and metadata-indexed.
- Notes created in Streamient are written below `Streamient/`; Memories use `Streamient/Memories/`.

The plugin excludes `.obsidian`, `.git`, `.trash`, other dot-folders, operating-system metadata, and temporary files.

## Beta Installation

Until Streamient Sync is accepted into the Obsidian Community directory, install it through BRAT:

1. Install and enable **BRAT** from Obsidian Community plugins.
2. Run **BRAT: Add a beta plugin for testing** from the Obsidian command palette.
3. Enter `https://github.com/streamient/streamient-obsidian`.
4. Enable **Streamient Sync** under Obsidian Community plugins.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the [latest Streamient Sync release](https://github.com/streamient/streamient-obsidian/releases) and place them in `<vault>/.obsidian/plugins/streamient-sync/`.

## Connect a Vault

1. Open **Settings → Streamient Sync**.
2. Enter the hosted or self-hosted Streamient URL.
3. Select **Sign in** and approve `vault:read` and `vault:write` access.
4. Choose any active project.
5. Review the first-sync upload/download preview and confirm.

Each device authorizes separately. OAuth refresh credentials use Obsidian SecretStorage and are never stored in the vault plugin configuration.

Large vault manifests are uploaded in ordered batches of 500 entries. The preview pass is non-mutating; Streamient creates export files only after confirmation.

## Conflict Handling

Every file has a server revision. When both sides changed from the same older revision, the newest normalized modification time wins. Device times more than five minutes away from server time use the server receipt time; exact ties keep the current server version. The losing version remains recoverable for 30 days.

Project settings shows the conflict history. API responses include the losing revision identifier and authenticated download URL while that recovery snapshot is retained.

Duplicate operations, repeated file hashes, and changes relayed through Obsidian Sync are idempotent. Renaming onto an unrelated existing path creates a conflict-suffixed file instead of destroying either file.

## Trash and Disconnect

Deletes move the file and projected Streamient item to trash. Restoring on either side restores the other side. File bytes are removed after the 30-day retention period, while a lightweight tombstone prevents stale offline devices from silently resurrecting old data.

Disconnecting stops synchronization. Existing Streamient knowledge remains until explicitly deleted.

Project settings also offers **Remove connection**. This removes the encrypted vault mirror, attachments, revisions, and sync history while retaining the projected Streamient Notes and Memories as normal project content.

## Privacy

Vault content is sent over TLS in server-readable form because Streamient must read it for indexing, previews, extraction, and editing. Synchronized file chunks are encrypted at rest with AES-256-GCM. The Obsidian plugin contains no advertising, analytics, or telemetry.

## Server Configuration

| Variable | Description | Default |
|---|---|---|
| `OBSIDIAN_SYNC_ENABLED` | Enables the API and project settings UI | `false` |
| `OBSIDIAN_VAULTS_DIR` | Shared persistent encrypted blob directory | `assets/obsidian-vaults` |
| `OBSIDIAN_VAULT_ENCRYPTION_KEY` | Required 32-byte or 64-character hexadecimal AES key | — |
| `OBSIDIAN_SYNC_MAX_FILE_BYTES` | Maximum synchronized file size | `200000000` |
| `OBSIDIAN_SYNC_MAX_VAULT_BYTES` | Maximum stored bytes per connection | `10000000000` |
| `API_RATE_LIMIT_OBSIDIAN_PER_MINUTE` | Credential-scoped request ceiling for large vault synchronization | `3000` |

The web and scheduler replicas must see the same `OBSIDIAN_VAULTS_DIR`. Generate a key with `openssl rand -hex 32` and keep it in deployment secrets.
