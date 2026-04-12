import { z } from 'zod';

/**
 * MCP tool definitions: Notes
 */
export function noteTools(api) {
  return {
    create_note: {
      description: 'Create a new note in a project',
      inputSchema: {
        title: z.string().describe('Note title'),
        content: z.string().optional().describe('Note content (HTML)'),
        text_content: z.string().optional().describe('Plain text content for search'),
        tags: z.array(z.string()).optional().describe('Tags'),
        project: z.string().describe('Project ID'),
      },
      handler: async (args) => {
        const { note } = await api.post('/notes', args);
        return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
      },
    },

    read_note: {
      description: 'Read a note by ID',
      inputSchema: {
        id: z.string().describe('Note ID'),
      },
      handler: async (args) => {
        const { note } = await api.get(`/notes/${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
      },
    },

    update_note: {
      description: 'Update a note',
      inputSchema: {
        id: z.string().describe('Note ID'),
        title: z.string().optional(),
        content: z.string().optional(),
        text_content: z.string().optional(),
        tags: z.array(z.string()).optional(),
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
        id: z.string().describe('Note ID'),
      },
      handler: async (args) => {
        await api.delete(`/notes/${args.id}`);
        return { content: [{ type: 'text', text: 'Note deleted' }] };
      },
    },

    list_notes: {
      description: 'List notes, optionally filtered by project',
      inputSchema: {
        project: z.string().optional().describe('Project ID filter'),
        page: z.number().optional(),
        limit: z.number().optional(),
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
        query: z.string().describe('Search query'),
      },
      handler: async (args) => {
        const { results } = await api.post('/notes/search', { query: args.query });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },
  };
}
