import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CliArgumentParser, ToolArgumentBuilder } from '../lib/arguments.js';

const schema = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		limit: { type: 'integer' },
		triaged: { type: 'boolean' },
		to: { type: 'array', items: { type: 'string' } },
		mailbox: { type: 'string', enum: ['inbox', 'archived'] },
		body_text: { type: 'string' },
	},
	required: ['id'],
};

describe('Streamient CLI arguments', () => {
	it('parses global options and coerces live-schema flags', async () => {
		const parsed = new CliArgumentParser().parse(['emails', 'read', 'email-1', '--limit', '3', '--triaged', '--to', 'a@example.com', '--to', 'b@example.com', '--mailbox', 'inbox', '--pretty']);
		const input = await new ToolArgumentBuilder().build({ parsed, schema, positionalNames: ['id'], commandPositionals: parsed.positionals.slice(2) });
		assert.deepEqual(input, { id: 'email-1', limit: 3, triaged: true, to: ['a@example.com', 'b@example.com'], mailbox: 'inbox' });
		assert.equal(parsed.options.pretty, true);
	});

	it('parses safe token selectors and rejects raw token arguments', () => {
		const account = new CliArgumentParser().parse(['emails', 'list', '--account', 'work']);
		assert.equal(account.options.account, 'work');
		const tokenEnv = new CliArgumentParser().parse(['emails', 'list', '--token-env', 'WORK_TOKEN']);
		assert.equal(tokenEnv.options.tokenEnv, 'WORK_TOKEN');
		assert.throws(() => new CliArgumentParser().parse(['emails', 'list', '--token', 'actual-token-value']), (error) => error.code === 'UNSAFE_TOKEN_OPTION' && !error.message.includes('actual-token-value'));
	});

	it('supports explicit false boolean flags', async () => {
		const parsed = new CliArgumentParser().parse(['emails', 'read', 'email-1', '--no-triaged']);
		const input = await new ToolArgumentBuilder().build({ parsed, schema, positionalNames: ['id'], commandPositionals: parsed.positionals.slice(2) });
		assert.deepEqual(input, { id: 'email-1', triaged: false });
	});

	it('merges JSON and file input before explicit flags', async () => {
		const parsed = new CliArgumentParser().parse(['emails', 'read', 'email-2', '--input', '{"id":"email-1","limit":1}', '--file', 'body-text=body.txt', '--limit', '5']);
		const builder = new ToolArgumentBuilder({ readTextFile: async (path) => path === 'body.txt' ? 'Hello from file' : '' });
		const input = await builder.build({ parsed, schema, positionalNames: ['id'], commandPositionals: parsed.positionals.slice(2) });
		assert.deepEqual(input, { id: 'email-2', limit: 5, body_text: 'Hello from file' });
	});

	it('supports JSON from stdin', async () => {
		const parsed = new CliArgumentParser().parse(['tools', 'call', 'read_email', '--input', '-']);
		const input = await new ToolArgumentBuilder({ readStdin: async () => '{"id":"email-1"}' }).build({ parsed, schema });
		assert.deepEqual(input, { id: 'email-1' });
	});

	it('applies the global project override to tools that accept project_id', async () => {
		const projectSchema = { type: 'object', properties: { project_id: { type: 'string' } } };
		const parsed = new CliArgumentParser().parse(['emails', 'list', '--project-id', 'project-2']);
		const input = await new ToolArgumentBuilder().build({ parsed, schema: projectSchema });
		assert.deepEqual(input, { project_id: 'project-2' });
	});

	it('rejects unknown flags and missing required arguments', async () => {
		const unknown = new CliArgumentParser().parse(['emails', 'read', 'email-1', '--bogus', 'yes']);
		await assert.rejects(() => new ToolArgumentBuilder().build({ parsed: unknown, schema, positionalNames: ['id'], commandPositionals: unknown.positionals.slice(2) }), (error) => error.code === 'UNKNOWN_OPTION');
		const missing = new CliArgumentParser().parse(['emails', 'read']);
		await assert.rejects(() => new ToolArgumentBuilder().build({ parsed: missing, schema }), (error) => error.code === 'MISSING_REQUIRED_ARGUMENT');
	});
});
