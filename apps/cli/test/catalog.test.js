import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createMcpToolCatalog } from '../../mcp/tools/catalog.js';
import { MCP_TOOL_PROFILES, PUBLIC_APP_ALLOWED_TOOLS } from '../../mcp/tools/profile.js';
import { CommandReferenceRenderer } from '../lib/command-reference.js';
import { CommandRegistry } from '../lib/command-registry.js';

const root = new URL('../../../', import.meta.url);

describe('Streamient MCP, CLI, and docs catalog', () => {
	it('keeps all 44 full-profile tools mapped and documented', async () => {
		const tools = createMcpToolCatalog({}, { defaultProjectId: 'project-1' });
		const toolNames = Object.keys(tools).sort();
		const aliases = new CommandRegistry().allCommands();
		const aliasNames = aliases.map((command) => command.tool).sort();
		assert.equal(toolNames.length, 44);
		assert.equal(new Set(aliasNames).size, 44);
		assert.deepEqual(aliasNames, toolNames);

		const mcpDocs = await readFile(new URL('docs/mcp/tools.md', root), 'utf8');
		const documented = [...mcpDocs.matchAll(/^### `([a-z][a-z0-9_]+)`$/gm)].map((match) => match[1]).sort();
		assert.deepEqual(documented, toolNames);
		assert.match(mcpDocs, /44 tools/);
	});

	it('keeps the 12-tool app profile tied to the canonical catalog', () => {
		const tools = createMcpToolCatalog({}, { defaultProjectId: 'project-1', toolProfile: MCP_TOOL_PROFILES.APP });
		assert.equal(Object.keys(tools).length, 12);
		assert.deepEqual(Object.keys(tools).sort(), [...PUBLIC_APP_ALLOWED_TOOLS].sort());
	});

	it('keeps the generated command reference current', async () => {
		const current = await readFile(new URL('docs/cli/commands.md', root), 'utf8');
		assert.equal(current, new CommandReferenceRenderer().render());
	});
});
