# Account

## Signup & Login

Create your account at [app.kumbukum.com](https://app.kumbukum.com). You can sign up with:

- **Email & Password** — Standard registration
- **Magic Link** — Passwordless login via email

After signup you'll be taken to your dashboard where you can create your first project.

## Profile & Settings

Manage your profile at **Settings > Profile**:

- Display name
- Email address
- Password change
- Two-factor authentication (TOTP)
- Passkey registration (WebAuthn)

## API Tokens

Generate personal access tokens at **Settings > Tokens**. Tokens are used for:

- REST API access (`Authorization: Token <access_token>`)
- MCP server authentication (`ACCESS-TOKEN` environment variable or `Authorization: Bearer` header)

Tokens do not expire. You can revoke them at any time from the settings page.

## Usage & Limits

View your current usage at **Settings > Usage**:

- Notes count
- Memories count
- URLs count
- Storage used

Usage limits depend on your [billing plan](/cloud/billing).
