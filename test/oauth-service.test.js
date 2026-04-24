import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import pug from 'pug';

import { parseAuthorizationRequest, validateAuthorizationRequest } from '../services/oauth_service.js';
import { signMcpAccessToken, verifyMcpAccessToken } from '../modules/oauth.js';

const oauthAuthorizeViewPath = fileURLToPath(new URL('../views/auth/oauth_authorize.pug', import.meta.url));

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

	it('accepts metadata clients that list extra grant types when authorization_code is supported', async () => {
		const clientId = 'https://example.com/oauth/device-capable-client.json';
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url) => {
			assert.equal(String(url), clientId);
			return {
				ok: true,
				status: 200,
				headers: {
					get() {
						return null;
					},
				},
				async json() {
					return {
						client_id: clientId,
						client_name: 'Example MCP Client',
						redirect_uris: ['http://127.0.0.1:3000/callback'],
						grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
						response_types: ['code'],
						token_endpoint_auth_method: 'none',
					};
				},
			};
		};

		try {
			const parsed = await validateAuthorizationRequest({
				client_id: clientId,
				redirect_uri: 'http://127.0.0.1:3000/callback',
				response_type: 'code',
				code_challenge: 'challenge',
				code_challenge_method: 'S256',
				resource: 'http://localhost:3002/mcp',
			}, { host_id: 'host-1' });

			assert.deepEqual(parsed.client.grant_types, ['authorization_code', 'refresh_token']);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('renders the OAuth authorize template with an active tenant name', () => {
		const html = pug.renderFile(oauthAuthorizeViewPath, {
			v: 'test',
			sentry: {},
			openpanel: {},
			user: null,
			host_id: '',
			error: null,
			client: {
				client_id: 'client-1',
				client_name: 'Example App',
				client_uri: 'https://example.com',
			},
			oauth_request: {
				client_id: 'client-1',
				redirect_uri: 'http://127.0.0.1:3000/callback',
				response_type: 'code',
				scopes: ['mcp:read'],
				state: 'abc123',
				code_challenge: 'challenge',
				code_challenge_method: 'S256',
				resource: 'http://localhost:3002/mcp',
			},
			scope_details: [{ label: 'Read knowledge', description: 'List and search knowledge.' }],
			active_tenant: { name: 'Acme Inc' },
		});

		assert.match(html, /Example App wants to access your account/);
		assert.match(html, /Allow access to/);
		assert.match(html, /Acme Inc/);
		assert.match(html, /oauth-authorize-page/);
		assert.match(html, /oauth-meta-list/);
		assert.match(html, /OAuth consent/);
		assert.match(html, /Only authorize access if you trust this application/);
	});
});
