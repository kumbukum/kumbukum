import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import rateLimit from 'express-rate-limit';

import { ApiClient } from './lib/api-client.js';
import { noteTools } from './tools/notes.js';
import { memoryTools } from './tools/memory.js';
import { urlTools } from './tools/urls.js';
import { projectTools } from './tools/projects.js';
import { graphTools } from './tools/graph.js';
import { gitSyncTools } from './tools/git_sync.js';

const PORT = parseInt(process.env.PORT, 10) || 3002;
const API_BASE_URL = process.env['API-BASE-URL'] || 'http://localhost:3000';

async function resolveDefaultProjectId(api, projectIdOverride) {
  if (projectIdOverride) return projectIdOverride;
  const { projects } = await api.get('/projects');
  const def = projects?.find((p) => p.is_default);
  if (!def) throw new Error('No default project found — pass X-Project-Id header or create a default project');
  return def._id;
}

async function createServer(token, { projectId } = {}) {
  const api = new ApiClient(API_BASE_URL, token);
  const defaultProjectId = await resolveDefaultProjectId(api, projectId);

  const server = new McpServer({
    name: 'kumbukum',
    version: '0.1.0',
    instructions: `You are connected to Kumbukum, a shared memory layer platform.

## Primary Search
Use \`search_knowledge\` as your primary tool for ANY search query — it returns results from notes, memories, URLs, and crawled pages in a single call.

## Memory
- You have persistent memory via the \`store_memory\` and \`recall_memory\` tools.
- **Before starting any task**, call \`recall_memory\` with a query describing the task to check for relevant prior context, decisions, or notes.
- **After completing significant work**, call \`store_memory\` to save key decisions, outcomes, or context for future sessions.
- **Before creating tags**, call \`suggest_memory_tags\` to reuse existing tags and avoid duplicates.
- You can also use \`search_memory\` (alias of \`recall_memory\`) if your client prefers search-style naming.
- Memories are personal — scoped to the authenticated user — and searchable by meaning, not just keywords.

## Data Types
- **Notes**: Rich text documents organized by project
- **Memory**: Facts, decisions, context — your personal knowledge base
- **URLs**: Saved web pages with extracted content, optionally with full-site crawling
- **Projects**: Organize all data into projects`,
  });

  // Register all tools, wrapping handlers to inject MCP client identity
  const allTools = {
    ...noteTools(api, defaultProjectId),
    ...memoryTools(api, defaultProjectId),
    ...urlTools(api, defaultProjectId),
    ...projectTools(api),
    ...graphTools(api),
    ...gitSyncTools(api, defaultProjectId),
  };

  for (const [name, tool] of Object.entries(allTools)) {
    const originalHandler = tool.handler;
    const wrappedHandler = async (params, extra) => {
      const cv = server.server.getClientVersion();
      if (cv) {
        api.setMcpClient(`${cv.name || 'unknown'}/${cv.version || '?'}`);
      }
      return originalHandler(params, extra);
    };
    server.tool(name, tool.description, tool.inputSchema, wrappedHandler);
  }

  return server;
}

// Determine transport mode
const transportArg = process.argv[2];

if (transportArg === '--stdio' || !transportArg) {
  // stdio transport (default for Claude Desktop etc.)
  const token = process.env['ACCESS-TOKEN'];
  if (!token) {
    console.error('ACCESS-TOKEN environment variable required for stdio transport');
    process.exit(1);
  }

  const projectId = process.env['PROJECT-ID'] || null;
  const server = await createServer(token, { projectId });
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  // HTTP/SSE transport
  const app = express();
  app.use(express.json());

  // Health check — no auth, no rate limit
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'http' });
  });

  // MCP rate limiter — 120 req/min per token (in-memory store)
  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    keyGenerator: (req) => req.headers.authorization?.replace('Bearer ', '') || 'anon',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'MCP rate limit exceeded (120 requests/min).' },
  });
  app.use(mcpLimiter);

  // SSE endpoint
  const sseTransports = new Map();

  app.get('/sse', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authorization: Bearer <access-token> header required' });

    const projectId = req.headers['x-project-id'] || null;
    const server = await createServer(token, { projectId });
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
    if (!token) return res.status(401).json({ error: 'Authorization: Bearer <access-token> header required' });

    const projectId = req.headers['x-project-id'] || null;
    const server = await createServer(token, { projectId });
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
