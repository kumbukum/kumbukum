# MCP Server

Kumbukum includes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes 28 tools for LLM clients like Claude Desktop, Cursor, and other MCP-compatible applications.

## Features

- **28 tools** across notes, memories, URLs, projects, graph, search, and AI chat
- **Automatic default project** — tools work without specifying a project
- **Three transports**: stdio (default), SSE, and Streamable HTTP
- **Token-based auth** via personal access token

## Quick Start

```bash
# Set your Kumbukum access token
export KUMBUKUM_TOKEN=your-access-token
export KUMBUKUM_URL=https://your-instance.com

# Run with stdio transport (default)
node apps/mcp/server.js

# Run with HTTP transport
node apps/mcp/server.js --transport http --port 3002
```

See [Setup](./setup) for Claude Desktop configuration and [Tools](./tools) for the full tool reference.

## Tool Categories

| Category | Tools | Description |
| -------- | ----- | ----------- |
| Notes    | 6     | Create, read, update, delete, list, search notes |
| Memories | 9     | Store, recall, search, CRUD memories + tags + knowledge search + AI chat |
| URLs     | 6     | Save, list, search, read, update, delete URLs |
| Projects | 2     | List and get projects |
| Graph    | 5     | Create/delete links, get graph, traverse connections |
