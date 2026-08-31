---
title: Streamient CLI Installation and Setup
description: "Install the Streamient CLI, configure personal access tokens for one or more accounts, and verify MCP connectivity."
---

# Streamient CLI

`streamient-cli` gives people, shell scripts, CI jobs, and coding agents composable access to the complete Streamient MCP tool catalog. It discovers tools and schemas from the connected server, so commands use the same validation, permissions, rate limits, and account features as MCP clients.

## Requirements

- Node.js 24 or newer
- A Streamient personal access token from **Settings → Access Tokens**

The CLI reads tokens only from environment variables. It does not store credentials or accept tokens in URLs or command arguments.

## Install

:::tabs
== pnpm
```fish
pnpm add --global @streamient/cli
```
== npm
```fish
npm install --global @streamient/cli
```
== npx
```fish
npx --package @streamient/cli streamient-cli --help
```
:::

## Configure the token

:::tabs
== Fish
```fish
set -gx STREAMIENT_CLI_ACCESS_TOKEN 'your-personal-access-token'
```
== Bash
```bash
export STREAMIENT_CLI_ACCESS_TOKEN='your-personal-access-token'
```
== Zsh
```zsh
export STREAMIENT_CLI_ACCESS_TOKEN='your-personal-access-token'
```
:::

Environment variables set this way last for the current shell session. Use your operating system or CI secret store when you need durable configuration; never commit the token.

### Multiple Streamient accounts

Keep the default account in `STREAMIENT_CLI_ACCESS_TOKEN`. Give additional account tokens an alias:

```fish
set -gx STREAMIENT_CLI_ACCESS_TOKEN_WORK 'work-account-token'
set -gx STREAMIENT_CLI_ACCESS_TOKEN_CLIENT_A 'client-a-token'

streamient-cli knowledge search 'launch decision' --account work
streamient-cli projects list --account client-a
```

`--account client-a` reads `STREAMIENT_CLI_ACCESS_TOKEN_CLIENT_A`. Aliases are case-insensitive; hyphens become underscores. Use `--token-env NAME` when the token already has another environment-variable name.

Do not pass a token value with `--token`. Command arguments can be exposed in shell history and process listings, so the CLI rejects that option.

## Verify the connection

```fish
streamient-cli doctor
streamient-cli knowledge search 'release decision' --per-page 3 --pretty
```

Cloud commands use `https://mcp.streamient.com/mcp`. Pass `--server` with a complete MCP endpoint for a self-hosted installation.

## Next steps

- [Command reference](./commands)
- [Using the CLI](./using)
- [Troubleshooting](./troubleshooting)
- [MCP tools](../mcp/tools)
