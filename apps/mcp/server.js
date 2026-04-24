import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import rateLimit from 'express-rate-limit';

import mcpConfig from './config.js';
import { ApiClient } from './lib/api-client.js';
import { authenticateHttpRequest, checkRequestScopes, extractRequestAuth } from './lib/http-auth.js';
import { noteTools } from './tools/notes.js';
import { memoryTools } from './tools/memory.js';
import { urlTools } from './tools/urls.js';
import { emailTools } from './tools/emails.js';
import { projectTools } from './tools/projects.js';
import { graphTools } from './tools/graph.js';
import { gitSyncTools } from './tools/git_sync.js';
import { buildProtectedResourceMetadata } from '../../modules/oauth.js';

const PORT = mcpConfig.port;
const API_BASE_URL = mcpConfig.apiBaseUrl;

function extractToken(req) {
  return extractRequestAuth(req.headers)?.token || null;
}

function authKeyForContext(authContext) {
  if (!authContext) return 'anon';
  if (authContext.mode === 'oauth') {
    return `${authContext.tokenClaims.sub}:${authContext.tokenClaims.client_id}`;
  }
  return `legacy:${authContext.apiAuth}`;
}

function sendAuthResponse(res, response) {
  if (response?.headers) {
    for (const [key, value] of Object.entries(response.headers)) {
      res.setHeader(key, value);
    }
  }
  return res.status(response?.status || 401).json(response?.body || { error: 'Authentication required' });
}

async function resolveDefaultProjectId(api, projectIdOverride) {
  if (projectIdOverride) return projectIdOverride;
  const { projects } = await api.get('/projects');
  const def = projects?.find((p) => p.is_default);
  if (!def) throw new Error('No default project found — pass X-Project-Id header or create a default project');
  return def._id;
}

async function createServer(apiAuth, { projectId } = {}) {
  const api = new ApiClient(API_BASE_URL, apiAuth);
  const defaultProjectId = await resolveDefaultProjectId(api, projectId);
  let emailFeatureEnabled = true;
  let gitSyncFeatureEnabled = true;
  try {
    const { features } = await api.get('/features');
    emailFeatureEnabled = features?.email_ingest !== false;
    gitSyncFeatureEnabled = features?.git_sync !== false;
  } catch {
    // Fallback for older API versions: keep enabled by default.
    emailFeatureEnabled = true;
    gitSyncFeatureEnabled = true;
  }

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
- **Emails**: Ingested emails with subject, recipients, body text, and thread references
- **Projects**: Organize all data into projects — create, update, delete, and list projects`,
  });

  // Register all tools, wrapping handlers to inject MCP client identity
  const allTools = {
    ...noteTools(api, defaultProjectId),
    ...memoryTools(api, defaultProjectId),
    ...urlTools(api, defaultProjectId),
    ...(emailFeatureEnabled ? emailTools(api, defaultProjectId) : {}),
    ...projectTools(api),
    ...graphTools(api),
    ...(gitSyncFeatureEnabled ? gitSyncTools(api, defaultProjectId) : {}),
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

  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
	res.json(buildProtectedResourceMetadata(mcpConfig.mcpBaseUrl));
  });

  app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
	res.json(buildProtectedResourceMetadata(`${mcpConfig.mcpBaseUrl}/mcp`));
  });

  app.get('/.well-known/oauth-protected-resource/sse', (_req, res) => {
	res.json(buildProtectedResourceMetadata(`${mcpConfig.mcpBaseUrl}/sse`));
  });

  // MCP rate limiter — 120 req/min per token (in-memory store)
  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    keyGenerator: (req) => extractToken(req) || 'anon',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'MCP rate limit exceeded (120 requests/min).' },
  });
  app.use(mcpLimiter);

  // SSE endpoint
  const sseTransports = new Map();

  app.get('/sse', async (req, res) => {
    const authContext = authenticateHttpRequest(req);
    if (!authContext.ok) return sendAuthResponse(res, authContext.response);

    const projectId = req.headers['x-project-id'] || null;
    const server = await createServer(authContext.apiAuth, { projectId });
    const transport = new SSEServerTransport('/messages', res);
    sseTransports.set(transport.sessionId, {
		server,
		transport,
		authKey: authKeyForContext(authContext),
		mode: authContext.mode,
	});

    res.on('close', () => {
      sseTransports.delete(transport.sessionId);
    });

    server.connect(transport);
  });

  app.post('/messages', (req, res) => {
    const authContext = authenticateHttpRequest(req);
    if (!authContext.ok) return sendAuthResponse(res, authContext.response);
    const sessionId = req.query.sessionId;
    const session = sseTransports.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.authKey !== authKeyForContext(authContext)) {
		return sendAuthResponse(res, authContext.response || { status: 401, body: { error: 'Session authentication mismatch' } });
	}
	const scopeResponse = checkRequestScopes(authContext, req.body);
	if (scopeResponse) return sendAuthResponse(res, scopeResponse);
    session.transport.handlePostMessage(req, res);
  });

  // Streamable HTTP endpoint — stateless (no sessions)
  // Shared handler for all methods on /mcp
  const handleMcp = async (req, res) => {
    const authContext = authenticateHttpRequest(req);
    if (!authContext.ok) return sendAuthResponse(res, authContext.response);
	const scopeResponse = checkRequestScopes(authContext, req.body);
	if (scopeResponse) return sendAuthResponse(res, scopeResponse);

    const projectId = req.headers['x-project-id'] || null;
    const server = await createServer(authContext.apiAuth, { projectId });
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
