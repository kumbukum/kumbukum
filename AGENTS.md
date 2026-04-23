# Kumbukum Instructions

- When reporting information, be extremely concise and sacrifice grammar for the sake of concision. 

# Project Instructions

## Knowledge Management
This project uses Kumbukum as its knowledge store via MCP.

For **Cursor** (global User Rules, `.cursor/rules`, MCP server naming such as `user-kumbukum`), see [docs/mcp/cursor-ide.md](docs/mcp/cursor-ide.md) in this repo — VitePress: **MCP → Cursor (IDE)**.

### Before Starting Any Task
1. Call `recall_memory` or `search_knowledge` with a query describing the task to check for relevant prior context, decisions, or notes
2. Review any related notes with `search_notes`
3. Use the returned context to inform your approach

### After Completing Significant Work
1. Call `store_memory` to save key decisions, outcomes, and context for future sessions; use `create_note` when the outcome is structured documentation (specs, ADRs)
2. Use descriptive titles and tag memories for easy retrieval
3. Use `create_link` to connect newly created items to related notes, memories, or URLs in the knowledge graph

### Creating Notes
Use `create_note` for structured documentation:
- Architecture decisions
- API designs
- Meeting notes
- Technical specs

After creating a note, use `create_link` to connect it to related items.

### Creating Memories
Use `store_memory` for agent-scoped learnings:
- Debugging insights and solutions
- User preferences and patterns
- Task outcomes and what worked
- Codebase conventions discovered during work

After storing a memory, use `create_link` to connect it to related notes, URLs, or other memories.

### Saving URLs
Use `save_url` to bookmark and extract content from web pages.

After saving a URL, use `create_link` to connect it to related notes or memories.

### Searching
- `search_knowledge` — Search across ALL types (notes, memories, URLs). **Use this first.**
- `search_notes` — Search only notes
- `recall_memory` — Search only memories
- `search_urls` — Search only saved URLs

### Tagging
- Before creating tags, call `suggest_memory_tags` to reuse existing tags and avoid duplicates
- Use consistent, descriptive tags (e.g., `architecture`, `debugging`, `api-design`)

### Knowledge Graph
- Use `create_link` to connect related notes, memories, and URLs
- Use `traverse_graph` to explore connections from a known item
- Use `get_graph` to see the full picture

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

