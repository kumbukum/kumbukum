import { CliError, EXIT_CODES } from './errors.js';

const DEFAULT_TOKEN_ENVIRONMENT = 'STREAMIENT_CLI_ACCESS_TOKEN';

export class TokenResolver {
	constructor(env = process.env) {
		this.env = env;
	}

	environmentName({ account = '', tokenEnv = '' } = {}) {
		if (account && tokenEnv) throw new CliError('TOKEN_SELECTOR_CONFLICT', '--account and --token-env cannot be used together', { exitCode: EXIT_CODES.USAGE });
		if (tokenEnv) {
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv)) throw new CliError('INVALID_TOKEN_ENVIRONMENT', '--token-env must be a valid environment-variable name', { exitCode: EXIT_CODES.USAGE });
			return tokenEnv;
		}
		if (account) {
			if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(account)) throw new CliError('INVALID_ACCOUNT_ALIAS', '--account accepts letters, numbers, underscores, and hyphens', { exitCode: EXIT_CODES.USAGE });
			return `${DEFAULT_TOKEN_ENVIRONMENT}_${account.replace(/-/g, '_').toUpperCase()}`;
		}
		return DEFAULT_TOKEN_ENVIRONMENT;
	}

	resolve(options = {}) {
		const environmentName = this.environmentName(options);
		const token = String(this.env[environmentName] || '').trim();
		if (!token) throw new CliError('ACCESS_TOKEN_REQUIRED', `Set ${environmentName} before running authenticated commands`, { exitCode: EXIT_CODES.AUTH, details: { environment_variable: environmentName } });
		return { token, environmentName };
	}
}

