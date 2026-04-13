# Search API

## Combined Knowledge Search

The recommended search endpoint searches across **all data types** in a single request.

```
POST /api/v1/search/knowledge
```

```json
{
    "query": "search term",
    "workspace_id": "optional",
    "document_tags": ["optional-filter"],
    "page": 1,
    "per_page": 10
}
```

**Response:**

```json
{
    "success": true,
    "results": {
        "notes": [...],
        "memories": [...]
    },
    "total_found": {
        "notes": 5,
        "memories": 3
    },
    "page": 1
}
```

This endpoint queries both notes and memories in parallel using Typesense BM25 search.

- `workspace_id` is optional — omit to search notes across all workspaces the user can access
- Use `document_tags` to filter results by tags

## Type-Specific Search

For searching within a single type:

| Type     | Endpoint                          |
| -------- | --------------------------------- |
| Notes    | `POST /api/v1/files/notes/search` |
| Memories | `POST /api/v1/memories/search`    |
| URLs     | via `search_urls` MCP tool        |

## AI Chat

```
POST /api/v1/chat
```

```json
{
    "query": "What did I save about Redis caching?",
    "conversation_id": "optional-for-context",
    "project_id": "optional-project-filter"
}
```

Uses semantic search across all collections, builds context from top results, and generates a response via the configured LLM provider (OpenAI, Google Gemini, Groq, or Cerebras).
