# MCP Tools Reference

All 28 tools available in the Kumbukum MCP server. Use `search_knowledge` first when you want the fastest path to relevant context across notes, memories, URLs, and pages. Parameters marked with `*` are required.

## Notes

### `create_note`
Create a new note in a project.

| Parameter      | Type   | Required | Description                |
| -------------- | ------ | -------- | -------------------------- |
| `title`        | string | yes      | Note title                 |
| `content`      | string | no       | Rich HTML content          |
| `text_content` | string | no       | Plain text version         |
| `tags`         | array  | no       | List of tags               |
| `project_id`   | string | no       | Project ID (default: auto) |

### `read_note`
Read a note by ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

### `update_note`
Update a note.

| Parameter      | Type   | Required |
| -------------- | ------ | -------- |
| `id`           | string | yes      |
| `title`        | string | no       |
| `content`      | string | no       |
| `text_content` | string | no       |
| `tags`         | array  | no       |

### `delete_note`
Delete a note by ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

### `list_notes`
List notes, optionally filtered by project.

| Parameter    | Type   | Required |
| ------------ | ------ | -------- |
| `project_id` | string | no       |
| `page`       | number | no       |
| `limit`      | number | no       |

### `search_notes`
Search notes using semantic/text search.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `query`   | string | yes      |

## Memories

### `store_memory`
Store a new memory — persist conversation context, decisions, or learnings.

| Parameter    | Type   | Required | Description                   |
| ------------ | ------ | -------- | ----------------------------- |
| `title`      | string | yes      | Memory title                  |
| `content`    | string | yes      | Memory content                |
| `tags`       | array  | no       | List of tags                  |
| `source`     | string | no       | Source attribution             |
| `project_id` | string | no       | Project ID (default: auto)    |

### `recall_memory`
Search memories semantically — find by meaning, not keywords.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `query`   | string | yes      |

### `search_memory`
Alias for `recall_memory`.

### `read_memory`
Read a specific memory by ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

### `update_memory`
Update an existing memory.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |
| `title`   | string | no       |
| `content` | string | no       |
| `tags`    | array  | no       |

### `delete_memory`
Delete a memory by ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

### `suggest_memory_tags`
Get suggested tags based on existing memory tags. No parameters.

### `search_knowledge`
Search across ALL data types (notes, memories, URLs, pages). **This is the primary search tool.**

| Parameter    | Type   | Required |
| ------------ | ------ | -------- |
| `query`      | string | yes      |
| `project_id` | string | no       |
| `per_page`   | number | no       |

### `chat`
AI chat with intent classification — search, create items, or analyze. Maintains context across messages.

| Parameter         | Type   | Required |
| ----------------- | ------ | -------- |
| `query`           | string | yes      |
| `conversation_id` | string | no       |
| `project_id`      | string | no       |

## URLs

### `save_url`
Save a URL with auto-extracted content. Set `crawl_enabled` for full-site crawling.

| Parameter       | Type    | Required | Description                     |
| --------------- | ------- | -------- | ------------------------------- |
| `url`           | string  | yes      | URL to save                     |
| `title`         | string  | no       | Title override                  |
| `description`   | string  | no       | Description override            |
| `crawl_enabled` | boolean | no       | Enable full-site crawling       |
| `project_id`    | string  | no       | Project ID (default: auto)      |

### `list_urls`
List saved URLs, optionally filtered by project.

| Parameter    | Type   | Required |
| ------------ | ------ | -------- |
| `project_id` | string | no       |
| `page`       | number | no       |
| `limit`      | number | no       |

### `search_urls`
Search saved URLs using semantic/text search.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `query`   | string | yes      |

### `read_url`
Read a saved URL by ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

### `update_url`
Update a saved URL.

| Parameter       | Type    | Required |
| --------------- | ------- | -------- |
| `id`            | string  | yes      |
| `title`         | string  | no       |
| `description`   | string  | no       |
| `crawl_enabled` | boolean | no       |

### `delete_url`
Delete a saved URL by ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

## Projects

### `list_projects`
List all projects. No parameters.

### `get_project`
Get a project by ID.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `id`      | string | yes      |

## Knowledge Graph

Links connect any two items (notes, memories, URLs) in the knowledge graph. After creating an item with `create_note`, `store_memory`, or `save_url`, use `create_link` to connect it to related items. This is a two-step pattern: create the item first, then link it.

### `create_link`
Create a link between two items.

| Parameter     | Type   | Required | Values                    |
| ------------- | ------ | -------- | ------------------------- |
| `source_id`   | string | yes      |                           |
| `source_type` | enum   | yes      | notes, memory, urls       |
| `target_id`   | string | yes      |                           |
| `target_type` | enum   | yes      | notes, memory, urls       |
| `label`       | string | no       | Optional link label       |

### `get_links`
Get all links for a specific item.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `item_id` | string | yes      |

### `get_graph`
Get full knowledge graph with nodes and edges.

| Parameter            | Type    | Required | Description                        |
| -------------------- | ------- | -------- | ---------------------------------- |
| `project_id`         | string  | no       | Filter by project                  |
| `include_tags`       | boolean | no       | Include tag-based edges            |
| `include_semantic`   | boolean | no       | Include semantic similarity edges  |
| `semantic_threshold` | number  | no       | Similarity threshold (0-1)         |

### `traverse_graph`
Get item and all its direct connections in the knowledge graph.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `item_id` | string | yes      |

### `delete_link`
Delete a link between two items.

| Parameter | Type   | Required |
| --------- | ------ | -------- |
| `link_id` | string | yes      |
