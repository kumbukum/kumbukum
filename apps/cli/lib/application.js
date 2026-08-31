import { CliArgumentParser, ToolArgumentBuilder } from './arguments.js';
import { CommandRegistry } from './command-registry.js';
import { CompletionRenderer } from './completion.js';
import { CliError, EXIT_CODES, normalizeCliError } from './errors.js';
import { StreamientMcpClient } from './mcp-client.js';
import { OutputWriter } from './output.js';
import { TokenResolver } from './token-resolver.js';

function optionLabel(name, schema, required) {
	const type = schema.type === 'array' ? `${schema.items?.type || 'value'}...` : schema.type || 'json';
	const choices = schema.enum ? ` (${schema.enum.join('|')})` : '';
	return `  --${name.replace(/_/g, '-')} <${type}>${required ? ' required' : ''}${choices}`;
}

export class CliApplication {
	constructor({ version = '0.1.0', env = process.env, stdout = process.stdout, stderr = process.stderr, readStdin, clientFactory } = {}) {
		this.version = version;
		this.env = env;
		this.registry = new CommandRegistry();
		this.parser = new CliArgumentParser();
		this.argumentBuilder = new ToolArgumentBuilder({ readStdin: readStdin || (() => this.readProcessStdin()) });
		const configuredToken = String(env.STREAMIENT_CLI_ACCESS_TOKEN || '');
		this.writer = new OutputWriter({ stdout, stderr, secrets: [configuredToken, configuredToken.trim()] });
		this.tokenResolver = new TokenResolver(env);
		this.clientFactory = clientFactory || ((options) => new StreamientMcpClient(options));
	}

	async run(argv) {
		let parsed;
		try {
			parsed = this.parser.parse(argv);
			if (parsed.options.version) {
				this.writer.writeText(this.version);
				return EXIT_CODES.SUCCESS;
			}
			if (!parsed.positionals.length || parsed.positionals[0] === 'help') {
				this.writer.writeText(this.rootHelp());
				return EXIT_CODES.SUCCESS;
			}
			if (parsed.positionals[0] === 'completion') return this.runCompletion(parsed);
			if (parsed.positionals[0] === 'doctor') return await this.runDoctor(parsed);
			if (parsed.positionals[0] === 'tools') return await this.runTools(parsed);
			return await this.runFriendlyCommand(parsed);
		} catch (error) {
			const normalized = normalizeCliError(error);
			this.writer.writeError(normalized, { pretty: parsed?.options.pretty });
			return normalized.exitCode;
		}
	}

	async runDoctor(parsed) {
		if (parsed.options.help) {
			this.writer.writeText('Usage: streamient-cli doctor [--account ALIAS | --token-env NAME] [--server URL] [--project-id ID]');
			return EXIT_CODES.SUCCESS;
		}
		const environmentName = this.tokenResolver.environmentName(parsed.options);
		const token = String(this.env[environmentName] || '').trim();
		if (!token) {
			this.writer.write({ ok: false, checks: { token: { ok: false, source: environmentName, message: `${environmentName} is not set` }, server: { ok: false, skipped: true } } }, parsed.options);
			return EXIT_CODES.AUTH;
		}
		this.writer.addSecret(token);
		const client = this.createClient(parsed, token);
		try {
			const tools = await client.listTools();
			this.writer.write({ ok: true, checks: { token: { ok: true, source: environmentName }, server: { ok: true, url: parsed.options.server, identity: client.serverDetails().version, tools: tools.length } } }, parsed.options);
			return EXIT_CODES.SUCCESS;
		} finally {
			await client.close();
		}
	}

	async runTools(parsed) {
		const action = parsed.positionals[1];
		if (parsed.options.help || !action) {
			this.writer.writeText('Usage:\n  streamient-cli tools list\n  streamient-cli tools describe <tool>\n  streamient-cli tools call <tool> [--input JSON] [tool flags]');
			return EXIT_CODES.SUCCESS;
		}
		if (!['list', 'describe', 'call'].includes(action)) throw new CliError('UNKNOWN_COMMAND', `Unknown tools command: ${action}`, { exitCode: EXIT_CODES.USAGE });
		const client = this.createClient(parsed, this.requiredToken(parsed.options));
		try {
			const tools = await client.listTools();
			if (action === 'list') {
				this.writer.write(tools.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description, annotations: tool.annotations, inputSchema: tool.inputSchema })), parsed.options);
				return EXIT_CODES.SUCCESS;
			}
			const name = parsed.positionals[2];
			if (!name) throw new CliError('TOOL_NAME_REQUIRED', `tools ${action} requires a tool name`, { exitCode: EXIT_CODES.USAGE });
			const tool = tools.find((item) => item.name === name);
			if (!tool) throw this.unavailableTool(name);
			if (action === 'describe') {
				this.writer.write(tool, parsed.options);
				return EXIT_CODES.SUCCESS;
			}
			const args = await this.argumentBuilder.build({ parsed, schema: tool.inputSchema, commandPositionals: parsed.positionals.slice(3) });
			this.requireConfirmation(tool, parsed.options.yes);
			return await this.callAndWrite(client, tool, args, parsed.options);
		} finally {
			await client.close();
		}
	}

	async runFriendlyCommand(parsed) {
		const groupName = parsed.positionals[0];
		const group = this.registry.findGroup(groupName);
		if (!group) throw new CliError('UNKNOWN_COMMAND_GROUP', `Unknown command group: ${groupName}`, { exitCode: EXIT_CODES.USAGE });
		const commandName = parsed.positionals[1];
		if (!commandName || parsed.options.help && !this.registry.findCommand(groupName, commandName)) {
			this.writer.writeText(this.groupHelp(group));
			return EXIT_CODES.SUCCESS;
		}
		const command = this.registry.findCommand(groupName, commandName);
		if (!command) throw new CliError('UNKNOWN_COMMAND', `Unknown ${groupName} command: ${commandName}`, { exitCode: EXIT_CODES.USAGE });
		const tokenEnvironment = this.tokenResolver.environmentName(parsed.options);
		if (parsed.options.help && !this.env[tokenEnvironment]) {
			this.writer.writeText(this.staticCommandHelp(command, tokenEnvironment));
			return EXIT_CODES.SUCCESS;
		}
		const client = this.createClient(parsed, this.requiredToken(parsed.options));
		try {
			const tools = await client.listTools();
			const tool = tools.find((item) => item.name === command.tool);
			if (!tool) throw this.unavailableTool(command.tool);
			if (parsed.options.help) {
				this.writer.writeText(this.dynamicCommandHelp(command, tool));
				return EXIT_CODES.SUCCESS;
			}
			const args = await this.argumentBuilder.build({ parsed, schema: tool.inputSchema, positionalNames: command.positionals || [], commandPositionals: parsed.positionals.slice(2) });
			this.requireConfirmation(tool, parsed.options.yes);
			return await this.callAndWrite(client, tool, args, parsed.options);
		} finally {
			await client.close();
		}
	}

	async callAndWrite(client, tool, args, options) {
		const result = await client.callTool(tool.name, args);
		if (result.isError) throw new CliError('TOOL_ERROR', this.resultErrorMessage(result), { exitCode: EXIT_CODES.TOOL, details: result.structuredContent?.data });
		this.writer.write(this.resultData(result), options);
		return EXIT_CODES.SUCCESS;
	}

	createClient(parsed, token) {
		return this.clientFactory({ server: parsed.options.server, token, projectId: parsed.options.projectId, timeoutMs: parsed.options.timeout * 1000, version: this.version });
	}

	requiredToken(options) {
		const resolved = this.tokenResolver.resolve(options);
		this.writer.addSecret(resolved.token);
		return resolved.token;
	}

	requireConfirmation(tool, confirmed) {
		// Server annotations remain the source of truth so newly destructive tools
		// cannot bypass CLI confirmation when the live catalog changes.
		if ((tool.annotations?.destructiveHint === true || ['add_git_repo', 'trigger_git_sync'].includes(tool.name)) && !confirmed) throw new CliError('CONFIRMATION_REQUIRED', `${tool.name} requires --yes`, { exitCode: EXIT_CODES.USAGE, details: { tool: tool.name } });
	}

	unavailableTool(name) {
		return new CliError('TOOL_UNAVAILABLE', `${name} is not available for this Streamient account, endpoint profile, or server`, { exitCode: EXIT_CODES.TOOL, details: { tool: name } });
	}

	resultData(result) {
		// Streamient publishes sanitized structured data; text is compatibility-only.
		if (result.structuredContent && Object.hasOwn(result.structuredContent, 'data')) return result.structuredContent.data;
		const text = result.content?.find((item) => item.type === 'text')?.text;
		if (text !== undefined) {
			try { return JSON.parse(text); } catch { return text; }
		}
		return result.content || null;
	}

	resultErrorMessage(result) {
		const data = result.structuredContent?.data;
		if (data?.error) return String(data.error);
		return result.content?.find((item) => item.type === 'text')?.text || 'Streamient tool failed';
	}

	runCompletion(parsed) {
		const shell = parsed.positionals[1];
		if (parsed.options.help || !shell) {
			this.writer.writeText('Usage: streamient-cli completion fish|bash|zsh');
			return EXIT_CODES.SUCCESS;
		}
		const completion = new CompletionRenderer(this.registry).render(shell);
		if (!completion) throw new CliError('UNSUPPORTED_SHELL', `Unsupported shell: ${shell}`, { exitCode: EXIT_CODES.USAGE });
		this.writer.writeText(completion);
		return EXIT_CODES.SUCCESS;
	}

	rootHelp() {
		const groups = this.registry.groups.map((group) => `  ${group.name.padEnd(12)} ${group.description}`).join('\n');
		return `Streamient CLI ${this.version}\n\nUsage: streamient-cli <group> <command> [arguments] [options]\n\nGroups:\n${groups}\n  doctor       Validate token and MCP connectivity\n  tools        Inspect or call live MCP tools\n  completion   Generate shell completion\n\nGlobal options:\n  --account <alias>    Use STREAMIENT_CLI_ACCESS_TOKEN_<ALIAS>\n  --token-env <name>   Read a token from another environment variable\n  --server <url>       MCP endpoint\n  --project-id <id>    Override the default project\n  --timeout <seconds>  Request timeout (default: 60)\n  --input <json|@file|->\n  --file <field=path>\n  --pretty             Pretty-print JSON\n  --table              Render human-readable tables\n  --yes                Confirm destructive operations\n  --help, -h\n  --version, -v`;
	}

	groupHelp(group) {
		const commands = group.commands.map((command) => `  ${command.name.padEnd(12)} ${command.description}`).join('\n');
		return `${group.description}\n\nUsage: streamient-cli ${group.name} <command> [arguments] [options]\n\nCommands:\n${commands}`;
	}

	staticCommandHelp(command, tokenEnvironment = 'STREAMIENT_CLI_ACCESS_TOKEN') {
		const positionals = (command.positionals || []).map((name) => `<${name.replace(/_/g, '-')}>`).join(' ');
		return `${command.description}\n\nUsage: streamient-cli ${command.group} ${command.name}${positionals ? ` ${positionals}` : ''} [tool options]\n\nSet ${tokenEnvironment} to load live tool options.`;
	}

	dynamicCommandHelp(command, tool) {
		const positionals = (command.positionals || []).map((name) => `<${name.replace(/_/g, '-')}>`).join(' ');
		const required = new Set(tool.inputSchema?.required || []);
		const flags = Object.entries(tool.inputSchema?.properties || {}).filter(([name]) => !(command.positionals || []).includes(name)).map(([name, schema]) => optionLabel(name, schema, required.has(name))).join('\n');
		return `${tool.title || command.description}\n\n${tool.description || ''}\n\nUsage: streamient-cli ${command.group} ${command.name}${positionals ? ` ${positionals}` : ''} [options]${flags ? `\n\nTool options:\n${flags}` : ''}`;
	}

	async readProcessStdin() {
		const chunks = [];
		for await (const chunk of process.stdin) chunks.push(chunk);
		return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))).toString('utf8');
	}
}
