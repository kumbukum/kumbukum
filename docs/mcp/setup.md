# MCP Server Setup

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
                "KUMBUKUM_TOKEN": "your-access-token"
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
                "KUMBUKUM_TOKEN": "your-access-token",
                "KUMBUKUM_URL": "https://your-instance.com"
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
node apps/mcp/server.js --transport http --port 3002
```

The server will listen at `http://localhost:3002/mcp` for Streamable HTTP connections and `http://localhost:3002/sse` for SSE connections.

In Docker Compose, the MCP server runs as a separate service on port 3002.
:::

## Environment Variables

| Variable              | Description                           | Default                  |
| --------------------- | ------------------------------------- | ------------------------ |
| `KUMBUKUM_TOKEN`      | Personal access token (required)      | —                        |
| `KUMBUKUM_URL`        | Base URL of the Kumbukum instance     | `http://localhost:3000`  |
| `KUMBUKUM_PROJECT_ID` | Override default project ID           | Auto-detected            |
| `PORT`                | HTTP transport port                   | `3002`                   |

## Default Project

On startup, the MCP server calls `GET /projects` and picks the project with `is_default: true`. All create tools (`create_note`, `store_memory`, `save_url`) fall back to this project when `project_id` is omitted.

Set `KUMBUKUM_PROJECT_ID` to override this behavior.
