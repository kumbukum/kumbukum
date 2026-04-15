# Getting Started

Kumbukum is a personal knowledge management system with AI chat, MCP server integration, and a knowledge graph. It's available as a managed cloud service or a self-hosted open-source application — both editions share the exact same features.

## Choose Your Edition

:::tabs
== Cloud
**Kumbukum Cloud** — We handle hosting, updates, and backups.

1. Sign up at [app.kumbukum.com](https://app.kumbukum.com)
2. Create your first project
3. Start adding notes, memories, and URLs

[Cloud documentation →](/cloud/)

== Self-Hosted
**Self-Hosted** — Run Kumbukum on your own infrastructure.

```bash
curl -O https://raw.githubusercontent.com/kumbukum/kumbukum/main/compose.prod.yml
docker compose -f compose.prod.yml up -d
```

[Installation guide →](/selfhosted/installation)
:::

## Next Steps

- [API Reference](/api/) — REST API for notes, memories, URLs, and search
- [MCP Server](/mcp/) — 28 tools for Claude Desktop and other LLM clients
- [Knowledge Graph](/api/search) — Connect your data with manual, tag-based, and semantic links
