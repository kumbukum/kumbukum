/**
 * MCP tool definitions: Memory
 */
export function memoryTools(api) {
  return {
    store_memory: {
      description: 'Store a new memory — use this to persist important conversation context, decisions, or learnings',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Memory title/subject' },
          content: { type: 'string', description: 'Memory content' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
          source: { type: 'string', description: 'Where this memory came from' },
          project: { type: 'string', description: 'Project ID' },
        },
        required: ['title', 'content', 'project'],
      },
      handler: async (args) => {
        const { memory } = await api.post('/memories', args);
        return { content: [{ type: 'text', text: JSON.stringify(memory, null, 2) }] };
      },
    },

    recall_memory: {
      description: 'Search memories semantically — find memories by meaning, not just keywords',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const { results } = await api.post('/memories/search', { query: args.query });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },

    search_memory: {
      description: 'Alias for recall_memory — search memories semantically',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const { results } = await api.post('/memories/search', { query: args.query });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },

    read_memory: {
      description: 'Read a specific memory by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const { memory } = await api.get(`/memories/${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify(memory, null, 2) }] };
      },
    },

    update_memory: {
      description: 'Update an existing memory',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory ID' },
          title: { type: 'string' },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
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
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        await api.delete(`/memories/${args.id}`);
        return { content: [{ type: 'text', text: 'Memory deleted' }] };
      },
    },

    suggest_memory_tags: {
      description: 'Get suggested tags based on existing memory tags',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const { tags } = await api.get('/memories/tags/suggest');
        return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
      },
    },

    search_knowledge: {
      description: 'Search across ALL data types (notes, memories, URLs, crawled pages) — use this as your primary search tool for any query. Optionally scope to a project.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          project_id: { type: 'string', description: 'Filter results to a specific project (optional)' },
          per_page: { type: 'number', description: 'Results per collection (default 5)' },
        },
        required: ['query'],
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
        type: 'object',
        properties: {
          query: { type: 'string', description: 'User message, search query, or command (e.g. "create a note about X", "remember that Y", "find my notes about Z")' },
          conversation_id: { type: 'string', description: 'Continue an existing conversation (optional)' },
          project_id: { type: 'string', description: 'Scope search/actions to a project (optional)' },
        },
        required: ['query'],
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
