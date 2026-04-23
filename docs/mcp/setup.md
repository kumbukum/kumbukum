# MCP Server Setup

Most MCP clients can be connected in about a minute. Use Cloud for the fastest path, or point a self-hosted client at your own Kumbukum instance.

## Prerequisites

- A running Kumbukum instance
- A personal access token (generate in **Settings > Tokens**)

## Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

:::tabs
== Cloud
```json
{
    "mcpServers": {
        "kumbukum": {
            "command": "npx",
            "args": ["-y", "mcp-remote", "https://app.kumbukum.com/mcp"],
            "env": {
                "ACCESS-TOKEN": "your-access-token"
            }
        }
    }
}
```
== Self-Hosted
```json
{
    "mcpServers": {
        "kumbukum": {
            "command": "node",
            "args": ["/path/to/kumbukum/apps/mcp/server.js"],
            "env": {
                "ACCESS-TOKEN": "your-access-token",
                "API_BASE_URL": "https://your-instance.com"
            }
        }
    }
}
```
:::

## HTTP Transport

For remote MCP access via Streamable HTTP:

:::tabs
== Cloud
The Cloud MCP endpoint is available at:

```
https://app.kumbukum.com/mcp
```

No additional setup required — the server is always running.

== Self-Hosted
```bash
env 'ACCESS-TOKEN'=your-access-token API_BASE_URL=https://your-instance.com \
node apps/mcp/server.js --transport http --port 3002
```

The server will listen at `http://localhost:3002/mcp` for Streamable HTTP connections and `http://localhost:3002/sse` for SSE connections.

In Docker Compose, the MCP server runs as a separate service on port 3002.
:::

## Environment Variables

| Variable              | Description                           | Default                  |
| --------------------- | ------------------------------------- | ------------------------ |
| `ACCESS-TOKEN`        | Personal access token for stdio transport | —                    |
| `API_BASE_URL`        | Base URL of the Kumbukum instance     | `http://localhost:3000`  |
| `PROJECT-ID`          | Override default project for stdio    | Auto-detected            |
| `PORT`                | HTTP transport port                   | `3002`                   |

::: tip Shell syntax note
`ACCESS-TOKEN` and `PROJECT-ID` contain hyphens because they are read directly by the MCP server. In shell commands, pass them with `env`, for example:

```bash
env 'ACCESS-TOKEN'=your-access-token 'PROJECT-ID'=your-project-id API_BASE_URL=https://your-instance.com node apps/mcp/server.js
```
:::

::: tip HTTP Transport Headers
When using the HTTP or SSE transport, pass your credentials as headers instead of environment variables:

- `Authorization: Bearer <access-token>` — recommended
- `Authorization: Token <access-token>` — also accepted
- `access-token: <access-token>` — alternative (mirrors Razuna MCP)
- `X-Project-Id: <project-id>` — optional, overrides the default project
:::

## Default Project

On startup, the MCP server calls `GET /projects` and picks the project with `is_default: true`. All create tools (`create_note`, `store_memory`, `save_url`) fall back to this project when `project_id` is omitted.

Set `PROJECT-ID` (passed via `env` for stdio) or the `X-Project-Id` header (HTTP/SSE) to override this behavior.

## Cursor (IDE)

After the MCP server appears under **Cursor Settings → MCP**, configure **global User Rules** and optional **project rules** so Agent chats search and store memories consistently. See **[Cursor (IDE)](./cursor-ide)**.
