import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { ManaganiSettingsError, createManaganiModule } from '../modules/managani_module.js';
import { _private as streamientPrivate } from '../modules/managani.js';

function createHarness(initialValue = null, overrides = {}) {
	let storedValue = initialValue;
	const savedValues = [];
	const clientCalls = [];
	const requestCalls = [];
	const errors = [];
	const warnings = [];
	const settingsStore = {
		async getSetting() {
			return storedValue;
		},
		async setSetting(key, value, category, description) {
			storedValue = structuredClone(value);
			savedValues.push({ key, value: structuredClone(value), category, description });
		},
	};
	const secretCodec = {
		encrypt(value) {
			if (overrides.throwEncrypt) throw new Error('encryption unavailable');
			return `encrypted:${value}`;
		},
		decrypt(value) {
			if (!value.startsWith('encrypted:')) throw new Error('decrypt failed');
			return value.slice('encrypted:'.length);
		},
	};
	const sdk = {
		createManaganiClient(options) {
			return {
				signUser(user) {
					return { token: user?.id ? `signed:${user.id}` : '' };
				},
				async track(user, event, data) {
					if (overrides.throwTrack) throw new Error('network failed');
					clientCalls.push({ user, event, data, baseUrl: options.baseUrl(), siteKey: options.siteKey(), siteSecret: options.siteSecret() });
					return { ok: true, stored: true };
				},
			};
		},
		managaniTracking(options) {
			return function(req, res, next) {
				if (overrides.throwAttach) throw new Error('attach failed');
				req.managani = {
					signUser(user) {
						return { token: `request:${user?.id || ''}` };
					},
					async track(event, data, user) {
						requestCalls.push({ event, data, user, baseUrl: options.baseUrl(), siteKey: options.siteKey(), siteSecret: options.siteSecret() });
						return { ok: true, stored: true };
					},
				};
				next();
			};
		},
	};
	const module = createManaganiModule({
		settingsStore,
		secretCodec,
		sdk,
		cacheTtlMs: overrides.cacheTtlMs ?? 30_000,
		appInstance: 'streamient',
		appVersion: '42',
		appLocation: 'us',
		resolveUser: overrides.resolveUser || (async (req) => ({ id: req.userId, email: 'person@example.com', host_id: req.host_id, is_paid: true })),
		mapUser: overrides.mapUser || ((user) => user),
		resolveMetadata: overrides.resolveMetadata || (() => ({ source: 'server' })),
		resolveBackendBaseUrl: overrides.resolveBackendBaseUrl,
		logger: {
			error(details, message) {
				errors.push({ details, message });
			},
			warn(details, message) {
				warnings.push({ details, message });
			},
		},
	});
	return {
		module,
		savedValues,
		clientCalls,
		requestCalls,
		errors,
		warnings,
		getStoredValue: () => storedValue,
		setStoredValue: (value) => {
			storedValue = value;
		},
	};
}

function enabledSettings(overrides = {}) {
	return {
		enabled: true,
		base_url: 'https://app.managani.com',
		site_key: 'public-key',
		site_secret_encrypted: 'encrypted:private-secret',
		...overrides,
	};
}

async function flushAsyncTracking() {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
}

describe('reusable Managani module', () => {
	it('exposes the portable module contract', () => {
		const { module } = createHarness();
		assert.deepEqual(Object.keys(module).sort(), ['getAdminSettings', 'getBrowserContext', 'initialize', 'middleware', 'saveAdminSettings', 'shouldTrack', 'track']);
	});

	it('maps Streamient tenant identity into the shared Managani user shape', () => {
		const mapped = streamientPrivate.mapStreamientUser(
			{ _id: 'user-1', email: 'person@example.com', name: 'Person', host_id: 'primary-host' },
			{
				req: { host_id: 'host-1', tenantId: 'tenant-1', memberRole: 'owner', isHosted: true },
				billingUser: { subscription_status: 'active' },
			},
		);

		assert.deepEqual(mapped, {
			id: 'user-1',
			email: 'person@example.com',
			name: 'Person',
			avatar: '',
			role: 'admin',
			host_id: 'host-1',
			is_paid: true,
			location: process.env.APP_LOCATION || process.env.STREAMIENT_APP_LOCATION || 'us',
			metadata: {
				host_id: 'host-1',
				tenant_id: 'tenant-1',
				account_role: 'owner',
				is_paid: true,
			},
		});
	});

	it('encrypts settings, masks the secret, and returns only browser-safe context', async () => {
		const harness = createHarness();
		await harness.module.initialize();
		const saved = await harness.module.saveAdminSettings({
			enabled: true,
			base_url: 'https://app.managani.com/',
			site_key: 'public-key',
			site_secret: 'private-secret',
		});

		assert.deepEqual(saved, {
			enabled: true,
			base_url: 'https://app.managani.com',
			site_key: 'public-key',
			site_secret_configured: true,
			site_secret_masked: '********',
		});
		assert.equal(harness.getStoredValue().site_secret_encrypted, 'encrypted:private-secret');
		assert.equal(JSON.stringify(harness.getStoredValue()).includes('\"private-secret\"'), false);

		const browser = await harness.module.getBrowserContext({ id: 'user-1', email: 'person@example.com' });
		assert.deepEqual(browser, {
			base_url: 'https://app.managani.com',
			site_key: 'public-key',
			user_token: 'signed:user-1',
		});
		assert.equal(JSON.stringify(browser).includes('private-secret'), false);
	});

	it('preserves, replaces, and explicitly clears the site secret', async () => {
		const harness = createHarness(enabledSettings());
		await harness.module.initialize();

		await harness.module.saveAdminSettings({ site_secret: '', site_key: 'changed-key' });
		assert.equal(harness.getStoredValue().site_secret_encrypted, 'encrypted:private-secret');

		await harness.module.saveAdminSettings({ site_secret: 'replacement' });
		assert.equal(harness.getStoredValue().site_secret_encrypted, 'encrypted:replacement');

		const cleared = await harness.module.saveAdminSettings({ enabled: false, clear_site_secret: true });
		assert.equal(harness.getStoredValue().site_secret_encrypted, '');
		assert.equal(cleared.site_secret_configured, false);
		assert.equal(await harness.module.getBrowserContext({ id: 'user-1' }), null);
	});

	it('uses an adapter-resolved backend URL while keeping the public browser URL', async () => {
		const harness = createHarness(enabledSettings(), {
			resolveBackendBaseUrl: () => 'http://managani-app-1:3000',
		});
		await harness.module.initialize();

		await harness.module.track({ id: 'user-1' }, 'smoke_test');
		const browser = await harness.module.getBrowserContext({ id: 'user-1' });

		assert.equal(harness.clientCalls[0].baseUrl, 'http://managani-app-1:3000');
		assert.equal(browser.base_url, 'https://app.managani.com');
	});

	it('rejects invalid URLs, conflicting secret actions, and incomplete enabled settings', async () => {
		const harness = createHarness();
		await harness.module.initialize();

		await assert.rejects(
			harness.module.saveAdminSettings({ base_url: 'https://app.managani.com/managani.js' }),
			(error) => error instanceof ManaganiSettingsError && error.code === 'MANAGANI_URL_INVALID',
		);
		await assert.rejects(
			harness.module.saveAdminSettings({ site_secret: 'replacement', clear_site_secret: true }),
			(error) => error instanceof ManaganiSettingsError && error.code === 'MANAGANI_SECRET_CONFLICT',
		);
		await assert.rejects(
			harness.module.saveAdminSettings({ enabled: true, base_url: 'https://app.managani.com', site_key: 'public-key' }),
			(error) => error instanceof ManaganiSettingsError && error.code === 'MANAGANI_CONFIGURATION_INCOMPLETE',
		);

		const encryptionHarness = createHarness(null, { throwEncrypt: true });
		await assert.rejects(
			encryptionHarness.module.saveAdminSettings({ site_secret: 'private-secret' }),
			(error) => error instanceof ManaganiSettingsError && error.code === 'MANAGANI_ENCRYPTION_UNAVAILABLE' && error.status === 500,
		);
	});

	it('attaches the request API and tracks authenticated requests after response completion', async () => {
		const harness = createHarness(enabledSettings());
		await harness.module.initialize();
		const req = {
			method: 'POST',
			path: '/api/v1/notes',
			originalUrl: '/api/v1/notes',
			userId: 'user-1',
			host_id: 'host-1',
			tenantId: 'tenant-1',
			memberRole: 'owner',
			authMethod: 'session',
			body: { secret: 'must-not-be-tracked' },
			session: {},
		};
		const res = new EventEmitter();
		res.statusCode = 201;
		let nextCalled = false;

		harness.module.middleware(req, res, () => {
			nextCalled = true;
		});
		assert.equal(nextCalled, true);
		assert.equal(typeof req.managani.track, 'function');
		assert.equal(harness.requestCalls.length, 0);

		res.emit('finish');
		await flushAsyncTracking();
		assert.equal(harness.requestCalls.length, 1);
		assert.equal(harness.requestCalls[0].event, 'user_action');
		assert.equal(harness.requestCalls[0].data.page, '/api/v1/notes');
		assert.equal(harness.requestCalls[0].data.metadata.status_code, 201);
		assert.equal(harness.requestCalls[0].data.metadata.source, 'server');
		assert.equal(JSON.stringify(harness.requestCalls[0].data).includes('must-not-be-tracked'), false);
		assert.equal(harness.requestCalls[0].siteSecret, 'private-secret');
	});

	it('skips unauthenticated and excluded traffic', async () => {
		const harness = createHarness(enabledSettings());
		await harness.module.initialize();
		const requests = [
			{ method: 'GET', path: '/login', userId: 'user-1', session: { userId: 'user-1' } },
			{ method: 'GET', path: '/admin/settings', userId: 'user-1', session: { userId: 'user-1' } },
			{ method: 'GET', path: '/dashboard', session: {} },
			{ method: 'GET', path: '/dashboard', session: { userId: 'stale-session-user' } },
			{ method: 'GET', path: '/dashboard', userId: 'user-1', session: { userId: 'user-1' }, managaniSkip: true },
			{ method: 'HEAD', path: '/dashboard', userId: 'user-1', session: { userId: 'user-1' } },
		];

		for (const req of requests) {
			const res = new EventEmitter();
			res.statusCode = 200;
			harness.module.middleware(req, res, () => {});
			res.emit('finish');
		}
		await flushAsyncTracking();
		assert.equal(harness.requestCalls.length, 0);
	});

	it('refreshes changed settings for manual events and isolates tracking failures', async () => {
		const harness = createHarness(enabledSettings(), { cacheTtlMs: 0 });
		await harness.module.initialize();
		harness.setStoredValue(enabledSettings({ base_url: 'https://new.managani.example' }));
		const result = await harness.module.track({ id: 'user-1' }, 'account_created', { plan: 'pro' });

		assert.equal(result.stored, true);
		assert.equal(harness.clientCalls[0].baseUrl, 'https://new.managani.example');
		assert.equal(harness.clientCalls[0].data.app_instance, 'streamient');
		assert.equal(harness.clientCalls[0].data.plan, 'pro');

		const failingHarness = createHarness(enabledSettings(), { throwTrack: true });
		await failingHarness.module.initialize();
		const failed = await failingHarness.module.track({ id: 'user-1' }, 'account_created');
		assert.equal(failed.skipped, 'tracking_error');
		assert.equal(failingHarness.errors.length, 1);
	});

	it('continues the request when the package middleware fails', async () => {
		const harness = createHarness(enabledSettings(), { throwAttach: true });
		await harness.module.initialize();
		const req = { method: 'GET', path: '/dashboard', session: { userId: 'user-1' } };
		const res = new EventEmitter();
		res.statusCode = 200;
		let nextCalled = false;

		harness.module.middleware(req, res, () => {
			nextCalled = true;
		});

		assert.equal(nextCalled, true);
		res.emit('finish');
		await flushAsyncTracking();
		assert.equal(harness.errors.length, 1);
		assert.match(harness.errors[0].message, /attach Managani/);
	});
});
