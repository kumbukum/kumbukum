import { z } from 'zod';

/**
 * MCP tool definitions: Memory
 */
export function memoryTools(api) {
  return {
    store_memory: {
      description: 'Store a new memory — use this to persist important conversation context, decisions, or learnings',
      inputSchema: {
        title: z.string().describe('Memory title/subject'),
        content: z.string().describe('Memory content'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        source: z.string().optional().describe('Where this memory came from'),
        project: z.string().describe('Project ID'),
      },
      handler: async (args) => {
        const { memory } = await api.post('/memories', args);
        return { content: [{ type: 'text', text: JSON.stringify(memory, null, 2) }] };
      },
    },

    recall_memory: {
      description: 'Search memories semantically — find memories by meaning, not just keywords',
      inputSchema: {
        query: z.string().describe('What to search for'),
      },
      handler: async (args) => {
        const { results } = await api.post('/memories/search', { query: args.query });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },

    search_memory: {
      description: 'Alias for recall_memory — search memories semantically',
      inputSchema: {
        query: z.string().describe('What to search for'),
      },
      handler: async (args) => {
        const { results } = await api.post('/memories/search', { query: args.query });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },

    read_memory: {
      description: 'Read a specific memory by ID',
      inputSchema: {
        id: z.string().describe('Memory ID'),
      },
      handler: async (args) => {
        const { memory } = await api.get(`/memories/${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify(memory, null, 2) }] };
      },
    },

    update_memory: {
      description: 'Update an existing memory',
      inputSchema: {
        id: z.string().describe('Memory ID'),
        title: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
      handler: async (args) => {
        const { id, ...data } = args;
        const { memory } = await api.put(`/memories/${id}`, data);
        return { content: [{ type: 'text', text: JSON.stringify(memory, null, 2) }] };
      },
    },

    delete_memory: {
      description: 'Delete a memory by ID',
      inputSchema: {
        id: z.string().describe('Memory ID'),
      },
      handler: async (args) => {
        await api.delete(`/memories/${args.id}`);
        return { content: [{ type: 'text', text: 'Memory deleted' }] };
      },
    },

    suggest_memory_tags: {
      description: 'Get suggested tags based on existing memory tags',
      inputSchema: {},
      handler: async () => {
        const { tags } = await api.get('/memories/tags/suggest');
        return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
      },
    },

    search_knowledge: {
      description: 'Search across ALL data types (notes, memories, URLs, crawled pages) — use this as your primary search tool for any query. Optionally scope to a project.',
      inputSchema: {
        query: z.string().describe('Search query'),
        project_id: z.string().optional().describe('Filter results to a specific project (optional)'),
        per_page: z.number().optional().describe('Results per collection (default 5)'),
      },
      handler: async (args) => {
        const { results } = await api.post('/search/knowledge', {
          query: args.query,
          project_id: args.project_id,
          per_page: args.per_page,
        });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },

    chat: {
      description: 'AI chat with intent classification — search, create items, or get analysis. Maintains conversation context across calls.',
      inputSchema: {
        query: z.string().describe('User message, search query, or command (e.g. "create a note about X", "remember that Y", "find my notes about Z")'),
        conversation_id: z.string().optional().describe('Continue an existing conversation (optional)'),
        project_id: z.string().optional().describe('Scope search/actions to a project (optional)'),
      },
      handler: async (args) => {
        const res = await api.post('/chat', {
          query: args.query,
          conversation_id: args.conversation_id,
          project_id: args.project_id,
        });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      },
    },
  };
}
