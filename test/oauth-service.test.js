import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAuthorizationRequest } from '../services/oauth_service.js';
import { signMcpAccessToken, verifyMcpAccessToken } from '../modules/oauth.js';

describe('oauth helpers', () => {
	it('parses a valid authorization request for the MCP endpoint resource', () => {
		const parsed = parseAuthorizationRequest({
			client_id: 'https://example.com/oauth/client.json',
			redirect_uri: 'http://127.0.0.1:3000/callback',
			response_type: 'code',
			scope: 'mcp:read mcp:write',
			state: 'abc123',
			code_challenge: 'challenge',
			code_challenge_method: 'S256',
			resource: 'http://localhost:3002/mcp',
		});

		assert.equal(parsed.client_id, 'https://example.com/oauth/client.json');
		assert.equal(parsed.redirect_uri, 'http://127.0.0.1:3000/callback');
		assert.deepEqual(parsed.scopes, ['mcp:read', 'mcp:write']);
		assert.equal(parsed.resource, 'http://localhost:3002/mcp');
	});

	it('rejects authorization requests for unknown resources', () => {
		assert.throws(
			() => parseAuthorizationRequest({
				client_id: 'https://example.com/oauth/client.json',
				redirect_uri: 'http://127.0.0.1:3000/callback',
				response_type: 'code',
				code_challenge: 'challenge',
				code_challenge_method: 'S256',
				resource: 'https://evil.example.com/mcp',
			}),
			(err) => err.oauthError === 'invalid_target',
		);
	});

	it('signs and verifies MCP access tokens for allowed audiences', () => {
		const token = signMcpAccessToken({
			userId: 'user-1',
			tenantId: 'tenant-1',
			host_id: 'host-1',
			clientId: 'client-1',
			scopes: ['mcp:read'],
			audience: 'http://localhost:3002/mcp',
		});

		const payload = verifyMcpAccessToken(token);
		assert.equal(payload.sub, 'user-1');
		assert.equal(payload.tenantId, 'tenant-1');
		assert.equal(payload.host_id, 'host-1');
		assert.equal(payload.client_id, 'client-1');
		assert.equal(payload.aud, 'http://localhost:3002/mcp');
	});
});
