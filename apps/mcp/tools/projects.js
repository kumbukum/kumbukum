/**
 * MCP tool definitions: Projects
 */
export function projectTools(api) {
  return {
    list_projects: {
      description: 'List all projects',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const { projects } = await api.get('/projects');
        return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
      },
    },

    get_project: {
      description: 'Get a project by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const { project } = await api.get(`/projects/${args.id}`);
        return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
      },
    },
  };
}
