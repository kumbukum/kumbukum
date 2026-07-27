import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import config from '../config.js';
import { SystemSetting } from '../model/system_setting.js';

async function createServer(isAdmin = true) {
	const { default: adminRoutes } = await import(`../routes/admin.js?admin_settings_test=${Date.now()}_${Math.random()}`);
	const app = express();
	app.use(express.json());
	app.use((req, res, next) => {
		req.session = isAdmin ? { isAdmin: true } : {};
		next();
	});
	app.use('/admin', adminRoutes);
	return app.listen(0);
}

async function request(server, method, path, body) {
	const { port } = server.address();
	return fetch(`http://127.0.0.1:${port}/admin${path}`, {
		method,
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: 'manual',
	});
}

describe('backend admin settings API', () => {
	const originalEncryptionKey = config.gitEncryptionKey;
	const originalFindOne = SystemSetting.findOne;
	const originalFindOneAndUpdate = SystemSetting.findOneAndUpdate;
	let values;

	beforeEach(() => {
		config.gitEncryptionKey = '12345678901234567890123456789012';
		values = new Map();
		SystemSetting.findOne = async ({ key }) => values.has(key) ? { value: structuredClone(values.get(key)) } : null;
		SystemSetting.findOneAndUpdate = async ({ key }, update) => {
			values.set(key, structuredClone(update.$set.value));
			return { key, value: structuredClone(update.$set.value) };
		};
	});

	afterEach(() => {
		config.gitEncryptionKey = originalEncryptionKey;
		SystemSetting.findOne = originalFindOne;
		SystemSetting.findOneAndUpdate = originalFindOneAndUpdate;
	});

	it('saves and reads safe Managani settings without exposing the secret', async () => {
		const server = await createServer();
		try {
			const saveResponse = await request(server, 'PUT', '/api/settings/managani', {
				enabled: true,
				base_url: 'https://app.managani.com/',
				site_key: 'public-key',
				site_secret: 'private-secret',
			});
			const saveJson = await saveResponse.json();

			assert.equal(saveResponse.status, 200);
			assert.equal(saveJson.settings.base_url, 'https://app.managani.com');
			assert.equal(saveJson.settings.site_secret_configured, true);
			assert.equal(saveJson.settings.site_secret_masked, '********');
			assert.equal(saveJson.settings.site_secret, undefined);
			assert.notEqual(values.get('integration.managani').site_secret_encrypted, 'private-secret');

			const getResponse = await request(server, 'GET', '/api/settings/managani');
			const getJson = await getResponse.json();
			assert.equal(getResponse.status, 200);
			assert.equal(getJson.settings.site_secret_configured, true);
			assert.equal(JSON.stringify(getJson).includes('private-secret'), false);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it('rejects enabling incomplete Managani settings', async () => {
		const server = await createServer();
		try {
			const response = await request(server, 'PUT', '/api/settings/managani', {
				enabled: true,
				base_url: 'https://app.managani.com',
				site_key: 'public-key',
			});
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.code, 'MANAGANI_CONFIGURATION_INCOMPLETE');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it('round-trips trusted custom footer markup unchanged', async () => {
		const server = await createServer();
		const cssSnippet = '<style>.brand { color: red; }</style>';
		const jsSnippet = '<script>window.customLoaded = true;</script><noscript>Required</noscript>';
		try {
			const saveResponse = await request(server, 'PUT', '/api/settings/custom-code', {
				css_snippet: cssSnippet,
				js_snippet: jsSnippet,
			});
			const saveJson = await saveResponse.json();
			assert.equal(saveResponse.status, 200);
			assert.equal(saveJson.settings.css_snippet, cssSnippet);
			assert.equal(saveJson.settings.js_snippet, jsSnippet);

			const getResponse = await request(server, 'GET', '/api/settings/custom-code');
			const getJson = await getResponse.json();
			assert.equal(getJson.settings.css_snippet, cssSnippet);
			assert.equal(getJson.settings.js_snippet, jsSnippet);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it('rejects non-object custom code settings', async () => {
		const server = await createServer();
		try {
			const response = await request(server, 'PUT', '/api/settings/custom-code', []);
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.code, 'CUSTOM_CODE_INVALID');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it('requires a backend-admin session', async () => {
		const server = await createServer(false);
		try {
			const response = await request(server, 'GET', '/api/settings/managani');
			assert.equal(response.status, 403);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
