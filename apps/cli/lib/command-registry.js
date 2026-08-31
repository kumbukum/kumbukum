export const COMMAND_GROUPS = [
	{
		name: 'notes',
		description: 'Create, read, search, and manage notes',
		commands: [
			{ name: 'create', tool: 'create_note', description: 'Create a note' },
			{ name: 'read', tool: 'read_note', description: 'Read one note', positionals: ['id'] },
			{ name: 'update', tool: 'update_note', description: 'Update a note', positionals: ['id'] },
			{ name: 'delete', tool: 'delete_note', description: 'Delete a note', positionals: ['id'] },
			{ name: 'list', tool: 'list_notes', description: 'List notes' },
			{ name: 'search', tool: 'search_notes', description: 'Search notes', positionals: ['query'] },
		],
	},
	{
		name: 'memories',
		description: 'Store, recall, search, and manage memories',
		commands: [
			{ name: 'store', tool: 'store_memory', description: 'Store a memory' },
			{ name: 'recall', tool: 'recall_memory', description: 'Recall relevant memories', positionals: ['query'] },
			{ name: 'search', tool: 'search_memory', description: 'Search memories', positionals: ['query'] },
			{ name: 'read', tool: 'read_memory', description: 'Read one memory', positionals: ['id'] },
			{ name: 'update', tool: 'update_memory', description: 'Update a memory', positionals: ['id'] },
			{ name: 'delete', tool: 'delete_memory', description: 'Delete a memory', positionals: ['id'] },
			{ name: 'tags', tool: 'suggest_memory_tags', description: 'Suggest existing memory tags' },
		],
	},
	{
		name: 'knowledge',
		description: 'Search all knowledge or use Streamient chat',
		commands: [
			{ name: 'search', tool: 'search_knowledge', description: 'Search across all knowledge', positionals: ['query'] },
			{ name: 'chat', tool: 'chat', description: 'Chat with Streamient', positionals: ['query'] },
		],
	},
	{
		name: 'urls',
		description: 'Save, inspect, search, and manage URLs',
		commands: [
			{ name: 'save', tool: 'save_url', description: 'Save and extract a URL' },
			{ name: 'list', tool: 'list_urls', description: 'List saved URLs' },
			{ name: 'search', tool: 'search_urls', description: 'Search saved URLs', positionals: ['query'] },
			{ name: 'read', tool: 'read_url', description: 'Read one saved URL', positionals: ['id'] },
			{ name: 'update', tool: 'update_url', description: 'Update a saved URL', positionals: ['id'] },
			{ name: 'delete', tool: 'delete_url', description: 'Delete a saved URL', positionals: ['id'] },
		],
	},
	{
		name: 'emails',
		description: 'Ingest, inspect, search, and manage email records',
		commands: [
			{ name: 'ingest', tool: 'ingest_email', description: 'Ingest raw or parsed email' },
			{ name: 'read', tool: 'read_email', description: 'Read one email', positionals: ['id'] },
			{ name: 'list', tool: 'list_emails', description: 'List emails' },
			{ name: 'search', tool: 'search_emails', description: 'Search emails', positionals: ['query'] },
			{ name: 'thread', tool: 'get_email_thread', description: 'Read a linked email thread', positionals: ['id'] },
			{ name: 'delete', tool: 'delete_email', description: 'Delete one email', positionals: ['id'] },
		],
	},
	{
		name: 'projects',
		description: 'Inspect and manage Streamient projects',
		commands: [
			{ name: 'list', tool: 'list_projects', description: 'List projects' },
			{ name: 'get', tool: 'get_project', description: 'Read one project', positionals: ['id'] },
			{ name: 'create', tool: 'create_project', description: 'Create a project' },
			{ name: 'update', tool: 'update_project', description: 'Update a project', positionals: ['id'] },
			{ name: 'delete', tool: 'delete_project', description: 'Delete a project', positionals: ['id'] },
			{ name: 'counts', tool: 'get_project_counts', description: 'Get project content counts' },
		],
	},
	{
		name: 'graph',
		description: 'Inspect and manage knowledge graph links',
		commands: [
			{ name: 'link', tool: 'create_link', description: 'Link two knowledge items' },
			{ name: 'links', tool: 'get_links', description: 'List links for one item', positionals: ['item_id'] },
			{ name: 'show', tool: 'get_graph', description: 'Read the knowledge graph' },
			{ name: 'traverse', tool: 'traverse_graph', description: 'Traverse direct item connections', positionals: ['item_id'] },
			{ name: 'unlink', tool: 'delete_link', description: 'Delete a knowledge graph link', positionals: ['link_id'] },
		],
	},
	{
		name: 'git',
		description: 'Configure and operate Git synchronization',
		commands: [
			{ name: 'list', tool: 'list_git_repos', description: 'List configured Git repositories' },
			{ name: 'add', tool: 'add_git_repo', description: 'Add a Git repository' },
			{ name: 'update', tool: 'update_git_repo', description: 'Update Git repository settings', positionals: ['id'] },
			{ name: 'remove', tool: 'remove_git_repo', description: 'Remove a Git repository', positionals: ['id'] },
			{ name: 'sync', tool: 'trigger_git_sync', description: 'Trigger Git synchronization', positionals: ['id'] },
			{ name: 'status', tool: 'git_sync_status', description: 'Read Git synchronization status', positionals: ['id'] },
		],
	},
];

export class CommandRegistry {
	constructor(groups = COMMAND_GROUPS) {
		this.groups = groups;
	}

	findGroup(name) {
		return this.groups.find((group) => group.name === name);
	}

	findCommand(groupName, commandName) {
		const group = this.findGroup(groupName);
		const command = group?.commands.find((item) => item.name === commandName);
		return command ? { ...command, group: group.name } : null;
	}

	allCommands() {
		return this.groups.flatMap((group) => group.commands.map((command) => ({ ...command, group: group.name, positionals: command.positionals || [] })));
	}
}
