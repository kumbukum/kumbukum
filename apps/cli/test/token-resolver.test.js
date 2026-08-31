import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TokenResolver } from '../lib/token-resolver.js';

describe('Streamient CLI token selection', () => {
	it('uses the default token environment', () => {
		assert.deepEqual(new TokenResolver({ STREAMIENT_CLI_ACCESS_TOKEN: 'default-token' }).resolve(), { token: 'default-token', environmentName: 'STREAMIENT_CLI_ACCESS_TOKEN' });
	});

	it('maps account aliases to isolated token environments', () => {
		const resolver = new TokenResolver({ STREAMIENT_CLI_ACCESS_TOKEN_CLIENT_A: 'client-token' });
		assert.deepEqual(resolver.resolve({ account: 'client-a' }), { token: 'client-token', environmentName: 'STREAMIENT_CLI_ACCESS_TOKEN_CLIENT_A' });
	});

	it('uses an explicitly named token environment', () => {
		const resolver = new TokenResolver({ ACME_STREAMIENT_TOKEN: 'acme-token' });
		assert.deepEqual(resolver.resolve({ tokenEnv: 'ACME_STREAMIENT_TOKEN' }), { token: 'acme-token', environmentName: 'ACME_STREAMIENT_TOKEN' });
	});

	it('rejects conflicting, invalid, and missing selectors', () => {
		const resolver = new TokenResolver({});
		assert.throws(() => resolver.resolve({ account: 'work', tokenEnv: 'WORK_TOKEN' }), (error) => error.code === 'TOKEN_SELECTOR_CONFLICT');
		assert.throws(() => resolver.resolve({ tokenEnv: 'NOT-AN-ENV' }), (error) => error.code === 'INVALID_TOKEN_ENVIRONMENT');
		assert.throws(() => resolver.resolve({ account: 'bad alias' }), (error) => error.code === 'INVALID_ACCOUNT_ALIAS');
		assert.throws(() => resolver.resolve({ account: 'work' }), (error) => error.code === 'ACCESS_TOKEN_REQUIRED' && error.details.environment_variable === 'STREAMIENT_CLI_ACCESS_TOKEN_WORK');
	});
});

