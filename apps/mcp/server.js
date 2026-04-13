import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import { ApiClient } from './lib/api-client.js';
import { noteTools } from './tools/notes.js';
import { memoryTools } from './tools/memory.js';
import { urlTools } from './tools/urls.js';
import { projectTools } from './tools/projects.js';
import { graphTools } from './tools/graph.js';

const PORT = parseInt(process.env.PORT, 10) || 3002;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const PROJECT_ID_OVERRIDE = process.env.KUMBUKUM_PROJECT_ID || null;

async function resolveDefaultProjectId(api) {
  if (PROJECT_ID_OVERRIDE) return PROJECT_ID_OVERRIDE;
  const { projects } = await api.get('/projects');
  const def = projects?.find((p) => p.is_default);
  if (!def) throw new Error('No default project found — set KUMBUKUM_PROJECT_ID or create a default project');
  return def._id;
}

async function createServer(token) {
  const api = new ApiClient(API_BASE_URL, token);
  const defaultProjectId = await resolveDefaultProjectId(api);

  const server = new McpServer({
    name: 'kumbukum',
    version: '0.1.0',
    instructions: `You are connected to Kumbukum, a personal knowledge management system.

## Primary Search
Use \`search_knowledge\` as your primary tool for ANY search query — it returns results from notes, memories, URLs, and crawled pages in a single call.

## Memory
Periodically call \`store_memory\` to persist important conversation context, decisions, or learnings for future sessions.
Before creating tags, call \`suggest_memory_tags\` to reuse existing tags.

## Data Types
- **Notes**: Rich text documents organized by project
- **Memory**: Facts, decisions, context — your personal knowledge base
- **URLs**: Saved web pages with extracted content, optionally with full-site crawling
- **Projects**: Organize all data into projects`,
  });

  // Register all tools
  const allTools = {
    ...noteTools(api, defaultProjectId),
    ...memoryTools(api, defaultProjectId),
    ...urlTools(api, defaultProjectId),
    ...projectTools(api),
    ...graphTools(api),
  };

  for (const [name, tool] of Object.entries(allTools)) {
    server.tool(name, tool.description, tool.inputSchema, tool.handler);
  }

  return server;
}

// Determine transport mode
const transportArg = process.argv[2];

if (transportArg === '--stdio' || !transportArg) {
  // stdio transport (default for Claude Desktop etc.)
  const token = process.env.KUMBUKUM_TOKEN;
  if (!token) {
    console.error('KUMBUKUM_TOKEN environment variable required for stdio transport');
    process.exit(1);
  }

  const server = await createServer(token);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  // HTTP/SSE transport
  const app = express();
  app.use(express.json());

  // SSE endpoint
  const sseTransports = new Map();

  app.get('/sse', async (req, res) => {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token required' });

    const server = await createServer(token);
    const transport = new SSEServerTransport('/messages', res);
    sseTransports.set(transport.sessionId, { server, transport });

    res.on('close', () => {
      sseTransports.delete(transport.sessionId);
    });

    server.connect(transport);
  });

  app.post('/messages', (req, res) => {
    const sessionId = req.query.sessionId;
    const session = sseTransports.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    session.transport.handlePostMessage(req, res);
  });

  // Streamable HTTP endpoint — stateless (no sessions)
  // Shared handler for all methods on /mcp
  const handleMcp = async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token required' });

    const server = await createServer(token);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };

  app.post('/mcp', handleMcp);
  app.get('/mcp', handleMcp);
  app.delete('/mcp', handleMcp);

  app.listen(PORT, () => {
    console.log(`Kumbukum MCP server running on port ${PORT}`);
    console.log(`  SSE: http://localhost:${PORT}/sse`);
    console.log(`  HTTP: http://localhost:${PORT}/mcp`);
  });
}
