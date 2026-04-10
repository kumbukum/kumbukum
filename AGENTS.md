# Kumbukum Instructions

- When reporting information, be extremely concise and sacrifice grammar for the sake of concision. 

## Documentation
- IMPORTANT: BEFORE EXECUTING A REGEX SEARCH THROUGH OUR CODE BASE ALWAYS CHECK THE RAZUNA-MEMORY MCP SERVER FIRST
- IMPORTANT: For each fix, change, update, etc., create a new documentation note in the RAZUNA-MEMORY MCP server. You can create markdown notes or store and recall memory. Use both as needed.
- DO NOT store documentation files in the root of the project.
- Notes and memory should be tags with "kumbukum" for easy retrieval by agents.

## Knowledge APIs (Notes & Memories)
Razuna exposes two distinct knowledge stores for AI agents, both backed by Typesense BM25 search.

### Notes (`is_document:true` files)
Structured markdown/rich-text documents stored in workspace folders.
- `POST /api/v1/files/notes` — create. Body: `{ title, workspace_id, content?, folder_id?, document_type?, document_tags? }`
- `GET  /api/v1/files/notes` — list/keyword search. Query: `workspace_id, q?, folder_id?, document_type?, document_tags?, page?, per_page?`
- `POST /api/v1/files/notes/search` — **preferred search for agents**. Body: `{ query, workspace_id, folder_id?, document_type?, document_tags?, page?, per_page? }`. Returns `{ success, results[], total_found, page }` sorted by text match then recency.
- `GET  /api/v1/files/notes/tags/suggest` — tag autocomplete. Query: `q`
- `GET/PUT/DELETE /api/v1/files/notes/:id` — get, update, delete

### Memories (owner-scoped AI agent memory)
Personal knowledge store scoped to the authenticated user (not workspace).
- `POST /api/v1/memories` — create. Body: `{ title, content, document_tags?, related_file_ids?, workspace?, workspace_name? }`
- `POST /api/v1/memories/search` — **semantic/BM25 search**. Body: `{ query, document_tags?, page?, per_page? }`. Returns `{ success, results[], total_found, page }`.
- `GET  /api/v1/memories` — list. Query: `document_tags?, page?, per_page?`
- `GET  /api/v1/memories/tags/suggest` — tag autocomplete. Query: `q`
- `GET/PUT/DELETE /api/v1/memories/:id` — get, update, delete

### Combined Knowledge Search
- `POST /api/v1/search/knowledge` — **single query across both notes and memories in parallel**. Body: `{ query, workspace_id?, document_tags?, page?, per_page? }`. Returns `{ success, results: { notes[], memories[] }, total_found: { notes, memories }, page }`.
  - Use this when an agent needs "everything relevant to X" without knowing whether it lives in notes or memories.
  - `workspace_id` is optional: omit to search notes across all workspaces the user can access.

### When to use which
| Goal | Endpoint |
|---|---|
| Find notes in a specific workspace | `POST /api/v1/files/notes/search` |
| Find personal AI memories | `POST /api/v1/memories/search` |
| Find anything relevant (notes + memories) | `POST /api/v1/search/knowledge` |
| MCP tool layer (preferred for agents) | Razuna-Memory MCP server tools (`search_notes`, `recall_memory`) |

Implementation files: `api/v1/files_notes_api.js`, `api/v1/memories_api.js`, `api/v1/files_search_api.js`, `services/memory_service.js`.

## System Overview
- Node.js monolith serving Kumbukum; entrypoint `app.js`
- Environment variables are used and never checked into git
- Repo root hosts the main app;
- sub-app under `apps/`

## Architecture & Patterns
- HTTP stack = `routes/**` (Express routers) -> `services/**` (business logic) -> `model/**` (Mongoose schemas) with utilities in `modules/**`.
- Multi-tenant safety matters: `host_id` filtering stays intact. 
- When adding/editing API endpoints, always update the Swagger docs

## Implementation Conventions
- Before adding new dependencies, verify they are compatible with Node 24 and consider whether an existing custom module already covers the need.
- Do not write HTML directly into frontend JS files; use Pug templates in `views/ajax` instead.

## Testing
- Testing: compose.test.yml file
- Within tests-app-1 the file ./test_app.sh tests runs the tests.

## IMPORTANT: Code Formatting
- tab size: 4
- Indent code
- Never compress or “minify” code
- Log lines or variables are always writen in a single line

