import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CliError, EXIT_CODES, normalizeCliError } from '../lib/errors.js';

describe('Streamient CLI error exit codes', () => {
	it('preserves explicit CLI errors', () => {
		const error = new CliError('INVALID_ARGUMENT', 'Invalid argument', { exitCode: EXIT_CODES.USAGE });
		assert.equal(normalizeCliError(error), error);
	});

	it('maps authentication, timeout, network, and internal failures', () => {
		assert.equal(normalizeCliError(new Error('HTTP 401 Unauthorized')).exitCode, EXIT_CODES.AUTH);
		assert.equal(normalizeCliError(new DOMException('Timed out', 'AbortError')).exitCode, EXIT_CODES.NETWORK);
		assert.equal(normalizeCliError(new Error('fetch failed: ECONNREFUSED')).exitCode, EXIT_CODES.NETWORK);
		assert.equal(normalizeCliError(new Error('unexpected failure')).exitCode, EXIT_CODES.INTERNAL);
	});
});
