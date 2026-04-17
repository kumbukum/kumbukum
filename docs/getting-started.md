# Getting Started

Kumbukum is a memory layer for AI-native teams. It's available as a managed cloud service or a self-hosted open-source application — both editions share the same product features.

## Choose Your Edition

:::tabs
== Cloud
**Kumbukum Cloud** — We handle hosting, updates, backups, and MCP infrastructure.

1. Sign up at [app.kumbukum.com](https://app.kumbukum.com)
2. Create your first project
3. Generate a personal access token and connect your AI tools

[Cloud documentation →](/cloud/)

== Self-Hosted
**Self-Hosted** — Run Kumbukum on your own infrastructure.

```bash
curl -O https://raw.githubusercontent.com/kumbukum/kumbukum/main/compose.prod.yml

APP_URL=https://your-instance.com \
SESSION_SECRET=your-session-secret \
JWT_SECRET=your-jwt-secret \
TYPESENSE_API_KEY=your-typesense-key \
SMTP_HOST=smtp.example.com \
SMTP_USER=you@example.com \
SMTP_PASS=your-smtp-password \
SMTP_FROM=noreply@example.com \
GOOGLE_API_KEY=your-google-api-key \
docker compose -f compose.prod.yml up -d
```

[Installation guide →](/selfhosted/installation)
:::

## Next Steps

- [API Reference](/api/) — REST API for notes, memories, URLs, and search
- [MCP Server](/mcp/) — 28 tools for Claude Desktop and other LLM clients
- [Knowledge Graph](/guide/graph) — Connect your data with manual, tag-based, and semantic links
