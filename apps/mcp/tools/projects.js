import { z } from 'zod';

/**
 * MCP tool definitions: Projects
 */
export function projectTools(api) {
  return {
    list_projects: {
      description: 'List all projects',
      inputSchema: {},
      handler: async () => {
        const { projects } = await api.get('/projects');
        return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
      },
    },

    get_project: {
      description: 'Get a project by ID',
      inputSchema: {
        id: z.string().describe('Project ID'),
      },
      handler: async (args) => {
        const { project } = await api.get(`/projects/${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
      },
    },

    create_project: {
      description: 'Create a new project',
      inputSchema: {
        name: z.string().describe('Project name'),
        color: z.string().optional().describe('Project color (hex code)'),
      },
      handler: async (args) => {
        const { project } = await api.post('/projects', args);
        return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
      },
    },

    update_project: {
      description: 'Update a project',
      inputSchema: {
        id: z.string().describe('Project ID'),
        name: z.string().optional().describe('Project name'),
        color: z.string().optional().describe('Project color (hex code)'),
      },
      handler: async (args) => {
        const { id, ...data } = args;
        const { project } = await api.put(`/projects/${id}`, data);
        return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
      },
    },

    delete_project: {
      description: 'Delete a project by ID (cannot delete the default project)',
      inputSchema: {
        id: z.string().describe('Project ID'),
      },
      handler: async (args) => {
        await api.delete(`/projects/${args.id}`);
        return { content: [{ type: 'text', text: 'Project deleted' }] };
      },
    },

    get_project_counts: {
      description: 'Get per-project document counts (notes, memories, URLs)',
      inputSchema: {},
      handler: async () => {
        const counts = await api.get('/counts');
        return { content: [{ type: 'text', text: JSON.stringify(counts, null, 2) }] };
      },
    },
  };
}
