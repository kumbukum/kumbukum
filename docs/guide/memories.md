# Memories

Memories are quick, focused knowledge entries — facts, decisions, context, and learnings that you or your AI tools want to recall later.

## Memories vs Notes

Notes are for longer, structured writing. Memories are for bite-sized pieces of knowledge: a decision that was made, a preference to remember, a piece of context that matters. Think of memories as things you'd tell a colleague to get them up to speed quickly.

Memories are especially powerful when used through the [MCP Server](/mcp/) — your AI assistant can store what it learns in one conversation and recall it in the next.

## What You Can Do

### Create & Edit

Click **New Memory** to store something. Give it a title and content. Memories are plain text — no rich formatting, just the information that matters.

### Tags

Tag your memories to group them by topic. Tags drive automatic connections in the [Knowledge Graph](/guide/graph), linking memories to notes and URLs that share the same tags. Use the tag autocomplete to reuse existing tags and keep things consistent.

### Source

Memories have an optional **source** field to track where the information came from — a meeting, a document, a conversation, an AI session. This helps you trace back to the origin when reviewing later.

### Project Assignment

Like notes and URLs, every memory belongs to a project. Filter by project in the sidebar to focus on what's relevant.

### Search

Memories are indexed with both keyword and vector search. The AI Chat and MCP tools search memories alongside notes and URLs, so stored context surfaces automatically when it's relevant.

### Links

Connect a memory to related notes, URLs, or other memories. Open a memory, scroll to the **Links** section, and search for items to connect. Links appear as removable badges and show up in the [Knowledge Graph](/guide/graph).

### Batch Operations

Select multiple memories with checkboxes to move them between projects or trash them in bulk.

## How It Works

When you store a memory, it's saved to MongoDB and indexed in Typesense with a vector embedding. This makes it searchable by meaning — not just exact keywords. Changes are broadcast in real-time to keep all connected clients and tools in sync.
