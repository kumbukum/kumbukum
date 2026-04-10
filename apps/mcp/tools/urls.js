/**
 * MCP tool definitions: URLs
 */
export function urlTools(api) {
  return {
    save_url: {
      description: 'Save a URL — extracts content automatically. Set crawl_enabled to true for full-site crawling.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to save' },
          title: { type: 'string', description: 'Optional custom title' },
          description: { type: 'string', description: 'Optional description' },
          crawl_enabled: { type: 'boolean', description: 'Enable full-site crawling' },
          project: { type: 'string', description: 'Project ID' },
        },
        required: ['url', 'project'],
      },
      handler: async (args) => {
        const { url } = await api.post('/urls', args);
        return { content: [{ type: 'text', text: JSON.stringify(url, null, 2) }] };
      },
    },

    list_urls: {
      description: 'List saved URLs, optionally filtered by project',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project ID filter' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
      handler: async (args) => {
        const params = new URLSearchParams();
        if (args.project) params.set('project', args.project);
        if (args.page) params.set('page', args.page);
        if (args.limit) params.set('limit', args.limit);
        const { urls } = await api.get(`/urls?${params}`);
        return { content: [{ type: 'text', text: JSON.stringify(urls, null, 2) }] };
      },
    },

    search_urls: {
      description: 'Search saved URLs using semantic/text search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const { results } = await api.post('/urls/search', { query: args.query });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },

    read_url: {
      description: 'Read a saved URL by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'URL ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const { url } = await api.get(`/urls/${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify(url, null, 2) }] };
      },
    },

    update_url: {
      description: 'Update a saved URL',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'URL ID' },
          title: { type: 'string' },
          description: { type: 'string' },
          crawl_enabled: { type: 'boolean' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const { id, ...data } = args;
        const { url } = await api.put(`/urls/${id}`, data);
        return { content: [{ type: 'text', text: JSON.stringify(url, null, 2) }] };
      },
    },

    delete_url: {
      description: 'Delete a saved URL by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'URL ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        await api.delete(`/urls/${args.id}`);
        return { content: [{ type: 'text', text: 'URL deleted' }] };
      },
    },
  };
}
