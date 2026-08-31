import { readFile } from 'node:fs/promises';

import { CliError, EXIT_CODES } from './errors.js';

const VALUE_OPTIONS = new Set(['server', 'project-id', 'timeout', 'input', 'account', 'token-env']);
const BOOLEAN_OPTIONS = new Set(['pretty', 'table', 'yes', 'help', 'version']);

function usageError(code, message, details) {
	return new CliError(code, message, { exitCode: EXIT_CODES.USAGE, details });
}

function propertyName(flag) {
	return flag.replace(/-/g, '_');
}

function valueType(schema = {}) {
	if (schema.type) return schema.type;
	const variant = schema.anyOf?.find((item) => item.type && item.type !== 'null');
	return variant?.type;
}

export class CliArgumentParser {
	parse(argv) {
		const options = { server: 'https://mcp.streamient.com/mcp', projectId: '', timeout: 60, account: '', tokenEnv: '', pretty: false, table: false, yes: false, help: false, version: false, input: null, files: [] };
		const positionals = [];
		const flags = new Map();
		let positionalOnly = false;

		for (let index = 0; index < argv.length; index += 1) {
			const token = argv[index];
			if (positionalOnly) {
				positionals.push(token);
				continue;
			}
			if (token === '--') {
				positionalOnly = true;
				continue;
			}
			if (token === '-h') {
				options.help = true;
				continue;
			}
			if (token === '-v') {
				options.version = true;
				continue;
			}
			if (!token.startsWith('--')) {
				positionals.push(token);
				continue;
			}

			const equalsAt = token.indexOf('=');
			const rawName = token.slice(2, equalsAt === -1 ? undefined : equalsAt);
			const inlineValue = equalsAt === -1 ? undefined : token.slice(equalsAt + 1);
			if (rawName === 'token') throw usageError('UNSAFE_TOKEN_OPTION', 'Do not pass secrets with --token; use --account or --token-env');
			if (rawName === 'file') {
				const value = inlineValue ?? argv[++index];
				if (!value) throw usageError('MISSING_OPTION_VALUE', '--file requires field=path');
				options.files.push(value);
				continue;
			}
			if (VALUE_OPTIONS.has(rawName)) {
				const value = inlineValue ?? argv[++index];
				if (value === undefined) throw usageError('MISSING_OPTION_VALUE', `--${rawName} requires a value`);
				if (rawName === 'project-id') options.projectId = value;
				else if (rawName === 'token-env') options.tokenEnv = value;
				else if (rawName === 'timeout') options.timeout = Number(value);
				else options[rawName] = value;
				continue;
			}
			if (BOOLEAN_OPTIONS.has(rawName)) {
				if (inlineValue !== undefined) throw usageError('INVALID_OPTION_VALUE', `--${rawName} does not accept a value`);
				options[rawName] = true;
				continue;
			}

			const negative = rawName.startsWith('no-');
			const name = negative ? rawName.slice(3) : rawName;
			let value = negative ? false : inlineValue;
			if (value === undefined && argv[index + 1] !== undefined && !argv[index + 1].startsWith('--')) value = argv[++index];
			if (value === undefined) value = true;
			const values = flags.get(name) || [];
			values.push(value);
			flags.set(name, values);
		}

		if (!Number.isFinite(options.timeout) || options.timeout <= 0) throw usageError('INVALID_TIMEOUT', '--timeout must be a positive number of seconds');
		return { options, positionals, flags };
	}
}

export class ToolArgumentBuilder {
	constructor({ readTextFile = (path) => readFile(path, 'utf8'), readStdin } = {}) {
		this.readTextFile = readTextFile;
		this.readStdin = readStdin;
	}

	/** Convert shell values with the live MCP JSON schema before any tool call. */
	async build({ parsed, schema = {}, positionalNames = [], commandPositionals = [] }) {
		const input = await this.readInput(parsed.options.input);
		await this.applyFiles(input, parsed.options.files);
		if (commandPositionals.length > positionalNames.length) throw usageError('TOO_MANY_ARGUMENTS', `Expected at most ${positionalNames.length} positional argument(s)`);
		for (let index = 0; index < commandPositionals.length; index += 1) input[positionalNames[index]] = commandPositionals[index];
		if (parsed.options.projectId && schema.properties?.project_id) input.project_id = parsed.options.projectId;
		for (const [flag, values] of parsed.flags) {
			const name = propertyName(flag);
			const propertySchema = schema.properties?.[name];
			if (!propertySchema) throw usageError('UNKNOWN_OPTION', `Unknown tool option --${flag}`);
			input[name] = this.coerceFlag(name, values, propertySchema);
		}
		this.validateInput(input, schema);
		return input;
	}

	async readInput(source) {
		if (source === null || source === undefined) return {};
		let json = source;
		if (source === '-') {
			if (!this.readStdin) throw usageError('STDIN_UNAVAILABLE', 'Standard input is unavailable');
			json = await this.readStdin();
		} else if (source.startsWith('@')) {
			json = await this.readTextFile(source.slice(1));
		}
		let parsed;
		try {
			parsed = JSON.parse(json);
		} catch {
			throw usageError('INVALID_JSON', '--input must contain a valid JSON object');
		}
		if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw usageError('INVALID_JSON_OBJECT', '--input must contain a JSON object');
		return parsed;
	}

	async applyFiles(input, files) {
		for (const assignment of files) {
			const separator = assignment.indexOf('=');
			if (separator < 1 || separator === assignment.length - 1) throw usageError('INVALID_FILE_ASSIGNMENT', '--file requires field=path');
			const field = propertyName(assignment.slice(0, separator));
			input[field] = await this.readTextFile(assignment.slice(separator + 1));
		}
	}

	coerceFlag(name, values, schema) {
		const type = valueType(schema);
		if (type === 'array') return values.map((value) => this.coerceScalar(name, value, schema.items || {}));
		if (values.length > 1) throw usageError('REPEATED_OPTION', `--${name.replace(/_/g, '-')} may only be provided once`);
		return this.coerceScalar(name, values[0], schema);
	}

	coerceScalar(name, value, schema) {
		const type = valueType(schema);
		let output = value;
		if (type === 'boolean') {
			if (value === true || value === false) output = value;
			else if (value === 'true' || value === 'false') output = value === 'true';
			else throw usageError('INVALID_BOOLEAN', `${name} must be true or false`);
		} else if (type === 'number' || type === 'integer') {
			output = Number(value);
			if (!Number.isFinite(output) || type === 'integer' && !Number.isInteger(output)) throw usageError('INVALID_NUMBER', `${name} must be a valid ${type}`);
		} else if (type === 'object') {
			try {
				output = JSON.parse(value);
			} catch {
				throw usageError('INVALID_JSON_VALUE', `${name} must be valid JSON`);
			}
		} else if (!type && typeof value === 'string' && /^[{[]/.test(value.trim())) {
			try { output = JSON.parse(value); } catch {}
		} else if (typeof value !== 'string') {
			output = String(value);
		}
		if (schema.enum && !schema.enum.includes(output)) throw usageError('INVALID_ENUM', `${name} must be one of: ${schema.enum.join(', ')}`);
		return output;
	}

	validateInput(input, schema) {
		for (const required of schema.required || []) {
			if (input[required] === undefined || input[required] === null || input[required] === '') throw usageError('MISSING_REQUIRED_ARGUMENT', `Missing required argument: ${required}`);
		}
		for (const key of Object.keys(input)) {
			if (schema.properties && !schema.properties[key]) throw usageError('UNKNOWN_ARGUMENT', `Unknown tool argument: ${key}`);
			this.validateValue(key, input[key], schema.properties?.[key] || {});
		}
	}

	validateValue(name, value, schema) {
		const type = valueType(schema);
		if (value === null && schema.anyOf?.some((item) => item.type === 'null')) return;
		if (type === 'string' && typeof value !== 'string') throw usageError('INVALID_ARGUMENT_TYPE', `${name} must be a string`);
		if (type === 'boolean' && typeof value !== 'boolean') throw usageError('INVALID_ARGUMENT_TYPE', `${name} must be a boolean`);
		if (type === 'number' && typeof value !== 'number' || (type === 'integer' && !Number.isInteger(value))) throw usageError('INVALID_ARGUMENT_TYPE', `${name} must be a valid ${type}`);
		if (type === 'object' && (!value || Array.isArray(value) || typeof value !== 'object')) throw usageError('INVALID_ARGUMENT_TYPE', `${name} must be an object`);
		if (type === 'array') {
			if (!Array.isArray(value)) throw usageError('INVALID_ARGUMENT_TYPE', `${name} must be an array`);
			for (const item of value) this.validateValue(name, item, schema.items || {});
		}
		if (schema.enum && !schema.enum.includes(value)) throw usageError('INVALID_ENUM', `${name} must be one of: ${schema.enum.join(', ')}`);
		if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) throw usageError('ARGUMENT_TOO_SMALL', `${name} must be at least ${schema.minimum}`);
		if (typeof value === 'number' && schema.maximum !== undefined && value > schema.maximum) throw usageError('ARGUMENT_TOO_LARGE', `${name} must be at most ${schema.maximum}`);
		if (typeof value === 'string' && schema.maxLength !== undefined && value.length > schema.maxLength) throw usageError('ARGUMENT_TOO_LONG', `${name} must contain at most ${schema.maxLength} characters`);
	}
}

