# Agent Configuration

To get the most out of Kumbukum with AI coding agents (GitHub Copilot, Cursor, Windsurf, Claude Code, etc.), add an `AGENTS.md` file to the root of your project. This tells agents how to use Kumbukum as their persistent memory and knowledge store.

## Why?

Without instructions, AI agents don't know Kumbukum exists. An `AGENTS.md` file tells them to:

- **Search before acting** — Check Kumbukum for existing context before starting work
- **Store learnings** — Save decisions, patterns, and outcomes after completing tasks
- **Use notes for documentation** — Keep project knowledge in Kumbukum, not scattered in files
- **Connect knowledge** — Link related items in the knowledge graph

## Recommended AGENTS.md

Copy the following into an `AGENTS.md` file at the root of your project:

````markdown
# Project Instructions

## Knowledge Management
This project uses Kumbukum as its knowledge store via MCP.

### Before Starting Any Task
1. Call `recall_memory` or `search_knowledge` with a query describing the task to check for relevant prior context, decisions, or notes
2. Review any related notes with `search_notes`
3. Use the returned context to inform your approach

### After Completing Significant Work
1. Call `store_memory` to save key decisions, outcomes, and context for future sessions
2. Use descriptive titles and tag memories for easy retrieval
3. If you created something that relates to existing items, use `create_link` to connect them in the knowledge graph

### Creating Notes
Use `create_note` for structured documentation:
- Architecture decisions
- API designs
- Meeting notes
- Technical specs

### Creating Memories
Use `store_memory` for agent-scoped learnings:
- Debugging insights and solutions
- User preferences and patterns
- Task outcomes and what worked
- Codebase conventions discovered during work

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
````

## Customizing

Adapt the template to your workflow. Common additions:

- **Project-specific tags** — Define standard tags for your domain (e.g., `frontend`, `backend`, `database`)
- **Team conventions** — Note which types of knowledge go into notes vs memories
- **Search-first rules** — Require agents to search before creating duplicates

## Where to Place It

| AI Client | File Location |
| --- | --- |
| GitHub Copilot | `AGENTS.md` in repo root (or any directory) |
| Cursor | `.cursor/rules/` directory |
| Windsurf | `.windsurfrules` file |
| Claude Code | `CLAUDE.md` in repo root |

The content is the same — only the file name and location differ per client.
