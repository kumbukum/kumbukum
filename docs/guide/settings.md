# Settings

Access settings from the gear icon in the navigation bar. Each section is described below.

## Profile

Edit your personal information:

- **Name** — Your display name, shown in the navigation bar and chat avatars
- **Email** — Your account email address
- **Timezone** — Select your timezone for date/time display throughout the app

## Security

Manage your account security with three options:

### Reset Password

Generate a new random password. Copy it before closing the dialog — it cannot be retrieved afterwards.

### Two-Factor Authentication (2FA)

Enable or disable TOTP-based two-factor authentication. When enabled, you'll need an authenticator app (like Google Authenticator or Authy) to sign in.

### Passkeys

Register WebAuthn passkeys for passwordless authentication. You can add multiple passkeys (hardware keys, biometrics, etc.) and remove them individually.

## Access Tokens

Create and manage API access tokens. Tokens are used to authenticate with:

- The **REST API** for programmatic access
- The **MCP Server** for connecting LLM clients like Claude Desktop

To create a token:

1. Enter a descriptive name (e.g., "MCP Server", "CI Pipeline")
2. Click Create
3. Copy the generated token — it is shown only once

Existing tokens are listed with their names and creation dates. You can revoke any token at any time.

## Search Index

Rebuild your search indexes. Click **Reindex All Data** to rebuild all search collections (notes, memories, URLs) from the database.

Use this if search results seem incomplete or out of sync. Requires confirmation before executing.

## Usage

View your storage usage dashboard showing total counts of:

- Notes
- Memories
- URLs
- Projects

:::tabs
== Cloud
## Subscription

View and manage your subscription status:

- **Trialing** — Shows trial end date
- **Active** — Your subscription is current
- **Past Due** — Payment issue; a grace period is provided
- **Canceled** — Subscription has been canceled

Click **Manage Subscription** to open the Stripe billing portal where you can update payment methods, view invoices, or cancel.

== Self-Hosted
The Subscription section is not available on self-hosted installations.
:::
