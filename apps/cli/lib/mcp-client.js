import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { CliError, EXIT_CODES } from './errors.js';

export function validatedServerUrl(value) {
	let url;
	try {
		url = new URL(String(value || '').trim());
	} catch {
		throw new CliError('INVALID_SERVER_URL', '--server must be a complete HTTP or HTTPS MCP URL', { exitCode: EXIT_CODES.USAGE });
	}
	if (!['http:', 'https:'].includes(url.protocol)) throw new CliError('INVALID_SERVER_URL', '--server must use HTTP or HTTPS', { exitCode: EXIT_CODES.USAGE });
	if (url.username || url.password) throw new CliError('SERVER_URL_CREDENTIALS', '--server cannot contain credentials', { exitCode: EXIT_CODES.USAGE });
	if (url.search) throw new CliError('SERVER_URL_QUERY', '--server cannot contain query parameters', { exitCode: EXIT_CODES.USAGE });
	const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !loopback) throw new CliError('INSECURE_SERVER_URL', 'Non-loopback Streamient MCP servers must use HTTPS', { exitCode: EXIT_CODES.USAGE });
	url.hash = '';
	return url;
}

export class StreamientMcpClient {
	constructor({ server, token, projectId = '', timeoutMs = 60000, version = '0.1.0' }) {
		if (!String(token || '').trim()) throw new CliError('ACCESS_TOKEN_REQUIRED', 'Set STREAMIENT_CLI_ACCESS_TOKEN before running authenticated commands', { exitCode: EXIT_CODES.AUTH });
		this.server = validatedServerUrl(server);
		this.token = String(token).trim();
		this.projectId = projectId;
		this.timeoutMs = timeoutMs;
		this.client = new Client({ name: 'streamient-cli', version }, { capabilities: {} });
		this.connected = false;
	}

	async connect() {
		if (this.connected) return;
		// Personal tokens stay exclusively in request headers and are never copied
		// into URLs, command output, cached metadata, or MCP arguments.
		const headers = { Authorization: `Token ${this.token}` };
		if (this.projectId) headers['X-Project-Id'] = this.projectId;
		const transport = new StreamableHTTPClientTransport(this.server, { requestInit: { headers } });
		await this.client.connect(transport);
		this.connected = true;
	}

	async listTools() {
		await this.connect();
		return (await this.client.listTools({}, { timeout: this.timeoutMs })).tools;
	}

	async callTool(name, args) {
		await this.connect();
		return this.client.callTool({ name, arguments: args }, undefined, { timeout: this.timeoutMs });
	}

	serverDetails() {
		return { version: this.client.getServerVersion(), instructions: this.client.getInstructions() };
	}

	async close() {
		if (!this.connected) return;
		await this.client.close();
		this.connected = false;
	}
}

