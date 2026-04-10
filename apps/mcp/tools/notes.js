/**
 * MCP tool definitions: Notes
 */
export function noteTools(api) {
  return {
    create_note: {
      description: 'Create a new note in a project',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          content: { type: 'string', description: 'Note content (HTML)' },
          text_content: { type: 'string', description: 'Plain text content for search' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          project: { type: 'string', description: 'Project ID' },
        },
        required: ['title', 'project'],
      },
      handler: async (args) => {
        const { note } = await api.post('/notes', args);
        return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
      },
    },

    read_note: {
      description: 'Read a note by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Note ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const { note } = await api.get(`/notes/${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
      },
    },

    update_note: {
      description: 'Update a note',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Note ID' },
          title: { type: 'string' },
          content: { type: 'string' },
          text_content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const { id, ...data } = args;
        const { note } = await api.put(`/notes/${id}`, data);
        return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
      },
    },

    delete_note: {
      description: 'Delete a note by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Note ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        await api.delete(`/notes/${args.id}`);
        return { content: [{ type: 'text', text: 'Note deleted' }] };
      },
    },

    list_notes: {
      description: 'List notes, optionally filtered by project',
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
        const { notes } = await api.get(`/notes?${params}`);
        return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] };
      },
    },

    search_notes: {
      description: 'Search notes using semantic/text search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const { results } = await api.post('/notes/search', { query: args.query });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },
  };
}
