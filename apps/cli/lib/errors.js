export const EXIT_CODES = {
	SUCCESS: 0,
	INTERNAL: 1,
	USAGE: 2,
	AUTH: 3,
	NETWORK: 4,
	TOOL: 5,
};

export class CliError extends Error {
	constructor(code, message, { exitCode = EXIT_CODES.INTERNAL, details = undefined } = {}) {
		super(message);
		this.name = 'CliError';
		this.code = code;
		this.exitCode = exitCode;
		this.details = details;
	}
}

/** Normalize transport failures without exposing request headers or credentials. */
export function normalizeCliError(error) {
	if (error instanceof CliError) return error;
	const message = String(error?.message || error || 'Unexpected CLI failure');
	if (error?.status === 401 || /\b401\b|unauthori[sz]ed|invalid access token|authentication required/i.test(message)) return new CliError('AUTHENTICATION_FAILED', 'Streamient rejected STREAMIENT_CLI_ACCESS_TOKEN', { exitCode: EXIT_CODES.AUTH });
	if (error?.name === 'AbortError' || /timed? out|requesttimeout/i.test(message)) return new CliError('TIMEOUT', 'Streamient request timed out', { exitCode: EXIT_CODES.NETWORK });
	if (/fetch failed|econnrefused|enotfound|eai_again|socket|network/i.test(message)) return new CliError('NETWORK_ERROR', 'Could not connect to the Streamient MCP server', { exitCode: EXIT_CODES.NETWORK });
	return new CliError('INTERNAL_ERROR', message, { exitCode: EXIT_CODES.INTERNAL });
}

