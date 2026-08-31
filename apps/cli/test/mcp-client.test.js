import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validatedServerUrl } from '../lib/mcp-client.js';

describe('Streamient CLI server URL validation', () => {
	it('accepts HTTPS and loopback HTTP MCP endpoints', () => {
		assert.equal(validatedServerUrl('https://mcp.streamient.com/mcp').toString(), 'https://mcp.streamient.com/mcp');
		assert.equal(validatedServerUrl('http://127.0.0.1:3002/mcp').toString(), 'http://127.0.0.1:3002/mcp');
		assert.equal(validatedServerUrl('http://[::1]:3002/mcp').toString(), 'http://[::1]:3002/mcp');
	});

	it('rejects credentials and remote plaintext HTTP', () => {
		assert.throws(() => validatedServerUrl('https://token@example.com/mcp'), (error) => error.code === 'SERVER_URL_CREDENTIALS');
		assert.throws(() => validatedServerUrl('https://example.com/mcp?access-token=secret'), (error) => error.code === 'SERVER_URL_QUERY');
		assert.throws(() => validatedServerUrl('http://example.com/mcp'), (error) => error.code === 'INSECURE_SERVER_URL');
	});
});

