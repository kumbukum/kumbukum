# Cursor (IDE) and Kumbukum MCP

Cursor can use Kumbukum as a **persistent memory layer** for Agent (Chat) via the Model Context Protocol. Configure three layers so every session follows the same workflow: **global User Rules** (all repos on your machine), **project rules** (per repository), and optionally **`AGENTS.md`**.

## 1. Global User Rules (recommended)

User Rules apply to **every project** in Cursor Agent (Chat). They are **not** stored in a Git repo; they live in Cursor Settings.

1. Open **Cursor Settings** → **Rules, Commands** (or **General** → **Rules for AI**, depending on your Cursor version).
2. Find **User Rules** (global).
3. Paste the block below (or keep it in a file and copy when onboarding a new machine).

### Paste this into User Rules

```markdown
## Kumbukum MCP (all projects)

When Kumbukum MCP is enabled in Cursor for this profile:

**Before non-trivial work** (features, debugging, multi-file changes): call `search_knowledge` or `recall_memory` with a short task query; use `search_notes` for written specs. Use returned context to inform the approach.

**After completing meaningful work**: call `store_memory` (title + content + tags) for outcomes and learnings; use `create_note` for structured specs or ADRs when appropriate. Use `suggest_memory_tags` before inventing new tags. Use `create_link` to connect related items when useful.

**MCP server id**: invoke tools on the Kumbukum server Cursor shows for this workspace (often `user-kumbukum` in the MCP panel, not necessarily `kumbukum`). If a tool call fails with “server does not exist”, check the exact server name in **Cursor Settings → MCP**.

If Kumbukum MCP is unavailable, continue work and say so in the reply so the user can fix MCP or capture notes manually.

Respect each repository’s own **AGENTS.md** and **`.cursor/rules/`** for stack-specific conventions; this block is only for shared memory hygiene.
```

::: tip Team rollout
For **organization-wide** enforcement, Cursor **Team Rules** (dashboard) can carry the same text so members cannot disable them.
:::

## 2. Project rules (`.cursor/rules/`)

For repositories you control, add versioned rules so teammates get the same behavior without touching each laptop:

- Create **`.cursor/rules/*.mdc`** with YAML frontmatter.
- Set **`alwaysApply: true`** when the workflow should run on every Agent chat in that repo.

Example for a product monorepo: duplicate the workflow above into `.cursor/rules/kumbukum-mcp-workflow.mdc` and commit it.

## 3. `AGENTS.md` in the repo root

Cursor loads **`AGENTS.md`** as a simple alternative to `.cursor/rules`. Use the template on the [Agent configuration](./agents) page. It matches the User Rules content; keeping both avoids gaps when one source is missing.

## 4. Connect the MCP server

Follow [MCP setup](./setup) (token, URL or stdio). After adding the server in **Cursor Settings → MCP**, confirm tools appear and note the **exact server label** (e.g. `user-kumbukum`) for `call_mcp_tool` / automation.

## 5. Related docs

| Topic | Link |
| --- | --- |
| MCP install & transports | [Setup](./setup) |
| Tool reference | [Tools](./tools) |
| `AGENTS.md` template | [Agent configuration](./agents) |
| MCP overview | [MCP home](./) |
