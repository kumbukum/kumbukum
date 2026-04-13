# Authentication

Kumbukum supports multiple authentication methods.

## Bearer Token (JWT)

Obtain a JWT by logging in:

:::tabs
== Cloud
```bash
curl -X POST https://app.kumbukum.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}'
```
== Self-Hosted
```bash
curl -X POST https://your-instance.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}'
```
:::

Use the returned token in subsequent requests:

:::tabs
== Cloud
```bash
curl https://app.kumbukum.com/api/v1/notes \
  -H "Authorization: Bearer <jwt_token>"
```
== Self-Hosted
```bash
curl https://your-instance.com/api/v1/notes \
  -H "Authorization: Bearer <jwt_token>"
```
:::

JWT tokens expire after 7 days.

## Access Token (Personal Token)

Generate a personal access token in **Settings > Tokens** within the app. Use it as:

:::tabs
== Cloud
```bash
curl https://app.kumbukum.com/api/v1/notes \
  -H "Authorization: Token <access_token>"
```
== Self-Hosted
```bash
curl https://your-instance.com/api/v1/notes \
  -H "Authorization: Token <access_token>"
```
:::

Access tokens do not expire and are ideal for integrations and the MCP server.

## Additional Auth Methods

The web interface also supports:

- **Magic Links** — passwordless login via email (15-min expiry)
- **Passkeys** — WebAuthn-based biometric/hardware key authentication
- **2FA (TOTP)** — Time-based one-time passwords via authenticator apps
