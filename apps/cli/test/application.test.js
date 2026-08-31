import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CliApplication } from '../lib/application.js';
import { EXIT_CODES } from '../lib/errors.js';

class CaptureStream {
	constructor() {
		this.value = '';
	}

	write(chunk) {
		this.value += chunk;
	}
}

class FakeClient {
	constructor(tools, result = { structuredContent: { data: { ok: true } }, content: [] }) {
		this.tools = tools;
		this.result = result;
		this.calls = [];
	}

	async listTools() {
		return this.tools;
	}

	async callTool(name, args) {
		this.calls.push({ name, args });
		return this.result;
	}

	serverDetails() {
		return { version: { name: 'streamient-test', version: '1.0.0' } };
	}

	async close() {}
}

const searchTool = { name: 'search_knowledge', title: 'Search knowledge', description: 'Search all knowledge', annotations: { destructiveHint: false }, inputSchema: { type: 'object', properties: { query: { type: 'string' }, per_page: { type: 'integer' } }, required: ['query'] } };
const deleteTool = { name: 'delete_note', title: 'Delete note', description: 'Delete a note', annotations: { destructiveHint: true }, inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } };
const addGitTool = { name: 'add_git_repo', title: 'Add Git repository', description: 'Add a Git repository', annotations: { destructiveHint: false, openWorldHint: true }, inputSchema: { type: 'object', properties: { repo_url: { type: 'string' } }, required: ['repo_url'] } };

function harness({ tools = [searchTool], result, env = { STREAMIENT_CLI_ACCESS_TOKEN: 'secret-token' } } = {}) {
	const stdout = new CaptureStream();
	const stderr = new CaptureStream();
	const client = new FakeClient(tools, result);
	const application = new CliApplication({ version: '0.1.0', env, stdout, stderr, clientFactory: () => client });
	return { application, client, stdout, stderr };
}

describe('Streamient CLI application', () => {
	it('runs a friendly command and prints unwrapped compact JSON', async () => {
		const { application, client, stdout } = harness();
		assert.equal(await application.run(['knowledge', 'search', 'release decision', '--per-page', '3']), EXIT_CODES.SUCCESS);
		assert.deepEqual(client.calls, [{ name: 'search_knowledge', args: { query: 'release decision', per_page: 3 } }]);
		assert.equal(stdout.value, '{"ok":true}\n');
	});

	it('requires explicit confirmation for destructive live tools', async () => {
		const { application, client, stderr } = harness({ tools: [deleteTool] });
		assert.equal(await application.run(['notes', 'delete', 'note-1']), EXIT_CODES.USAGE);
		assert.equal(client.calls.length, 0);
		assert.match(stderr.value, /CONFIRMATION_REQUIRED/);
		assert.equal(await application.run(['notes', 'delete', 'note-1', '--yes']), EXIT_CODES.SUCCESS);
		assert.deepEqual(client.calls[0], { name: 'delete_note', args: { id: 'note-1' } });
	});

	it('requires confirmation for Git additions even when the live tool is not destructive', async () => {
		const { application, client, stderr } = harness({ tools: [addGitTool] });
		assert.equal(await application.run(['git', 'add', '--repo-url', 'https://example.com/repo.git']), EXIT_CODES.USAGE);
		assert.equal(client.calls.length, 0);
		assert.match(stderr.value, /CONFIRMATION_REQUIRED/);
	});

	it('reports tools hidden by account features or endpoint profiles', async () => {
		const { application, stderr } = harness({ tools: [] });
		assert.equal(await application.run(['git', 'status', 'repo-1']), EXIT_CODES.TOOL);
		assert.match(stderr.value, /TOOL_UNAVAILABLE/);
		assert.match(stderr.value, /endpoint profile/);
	});

	it('never prints the access token in normalized failures', async () => {
		const stdout = new CaptureStream();
		const stderr = new CaptureStream();
		const application = new CliApplication({ env: { STREAMIENT_CLI_ACCESS_TOKEN: 'super-secret' }, stdout, stderr, clientFactory: () => ({ listTools: async () => { throw new Error('failure super-secret'); }, close: async () => {} }) });
		assert.equal(await application.run(['tools', 'list']), EXIT_CODES.INTERNAL);
		assert.doesNotMatch(stderr.value, /super-secret/);
		assert.match(stderr.value, /\[REDACTED\]/);
	});

	it('returns a structured doctor result when the token is missing', async () => {
		const { application, stdout } = harness({ env: {} });
		assert.equal(await application.run(['doctor']), EXIT_CODES.AUTH);
		assert.equal(JSON.parse(stdout.value).checks.token.ok, false);
	});

	it('selects account and custom token environments without exposing secrets', async () => {
		for (const scenario of [
			{ args: ['--account', 'work'], env: { STREAMIENT_CLI_ACCESS_TOKEN_WORK: 'work-secret' }, expected: 'work-secret' },
			{ args: ['--token-env', 'CLIENT_TOKEN'], env: { CLIENT_TOKEN: 'client-secret' }, expected: 'client-secret' },
		]) {
			let selectedToken = '';
			const stdout = new CaptureStream();
			const stderr = new CaptureStream();
			const client = new FakeClient([searchTool]);
			const application = new CliApplication({ env: scenario.env, stdout, stderr, clientFactory: (options) => { selectedToken = options.token; return client; } });
			assert.equal(await application.run(['tools', 'list', ...scenario.args]), EXIT_CODES.SUCCESS);
			assert.equal(selectedToken, scenario.expected);
			assert.doesNotMatch(stdout.value, new RegExp(scenario.expected));
			assert.doesNotMatch(stderr.value, new RegExp(scenario.expected));
		}
	});

	it('reports which account token environment doctor expects', async () => {
		const { application, stdout } = harness({ env: {} });
		assert.equal(await application.run(['doctor', '--account', 'client-a']), EXIT_CODES.AUTH);
		assert.equal(JSON.parse(stdout.value).checks.token.source, 'STREAMIENT_CLI_ACCESS_TOKEN_CLIENT_A');
	});
});
