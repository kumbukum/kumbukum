import managaniExpress from '@managani/express';
import managaniNode from '@managani/node';

const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_SETTING_KEY = 'integration.managani';
const DEFAULT_SETTING_CATEGORY = 'integrations';
const DEFAULT_TRACK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const DEFAULT_IGNORE_PATHS = ['/admin', '/login', '/signup', '/logout', '/forgot-password', '/reset-password', '/verify-email', '/oauth', '/static', '/white-label-assets', '/auth-assets', '/health', '/docs', '/api/doc', '/socket.io', '/favicon.ico', '/robots.txt', '/import', '/billing/webhook'];

export class ManaganiSettingsError extends Error {
	constructor(message, code = 'MANAGANI_SETTINGS_INVALID', status = 400) {
		super(message);
		this.name = 'ManaganiSettingsError';
		this.code = code;
		this.status = status;
	}
}

function normalizeStoredSettings(value) {
	const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	return {
		enabled: input.enabled === true,
		base_url: typeof input.base_url === 'string' ? input.base_url : '',
		site_key: typeof input.site_key === 'string' ? input.site_key : '',
		site_secret_encrypted: typeof input.site_secret_encrypted === 'string' ? input.site_secret_encrypted : '',
	};
}

function normalizeBaseUrl(value) {
	const input = String(value || '').trim();
	if (!input) return '';
	let url;
	try {
		url = new URL(input);
	} catch {
		throw new ManaganiSettingsError('Managani base URL must be a valid HTTP or HTTPS URL', 'MANAGANI_URL_INVALID');
	}
	if (!['http:', 'https:'].includes(url.protocol)) throw new ManaganiSettingsError('Managani base URL must use HTTP or HTTPS', 'MANAGANI_URL_INVALID');
	if (url.username || url.password || url.search || url.hash) throw new ManaganiSettingsError('Managani base URL cannot contain credentials, query parameters, or a fragment', 'MANAGANI_URL_INVALID');
	url.pathname = url.pathname.replace(/\/+$/, '');
	const normalized = url.toString().replace(/\/$/, '');
	if (/\/managani\.js$/i.test(normalized) || /\/api\/widget(?:\/|$)/i.test(normalized)) throw new ManaganiSettingsError('Enter only the Managani base URL, without script or API paths', 'MANAGANI_URL_INVALID');
	return normalized;
}

function safeString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function requestPath(req) {
	return String(req.path || req.originalUrl || req.url || '').split('?')[0];
}

function requestUserId(req) {
	return req.userId || '';
}

function defaultRequestUser(req) {
	const id = requestUserId(req);
	if (!id) return null;
	return {
		id,
		host_id: req.host_id || req.session?.host_id || '',
		role: ['owner', 'admin'].includes(req.memberRole || req.session?.memberRole) ? 'admin' : 'user',
	};
}

function errorObject(error) {
	return error instanceof Error ? error : new Error(String(error || 'Unknown Managani error'));
}

export function createManaganiModule(options = {}) {
	const settingsStore = options.settingsStore;
	const secretCodec = options.secretCodec;
	if (!settingsStore?.getSetting || !settingsStore?.setSetting) throw new Error('Managani settingsStore must provide getSetting and setSetting');
	if (!secretCodec?.encrypt || !secretCodec?.decrypt) throw new Error('Managani secretCodec must provide encrypt and decrypt');

	const logger = options.logger || {};
	const appInstance = options.appInstance || '';
	const appVersion = options.appVersion || 0;
	const appLocation = options.appLocation || '';
	const cacheTtlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : DEFAULT_CACHE_TTL_MS;
	const settingKey = options.settingKey || DEFAULT_SETTING_KEY;
	const settingCategory = options.settingCategory || DEFAULT_SETTING_CATEGORY;
	const ignorePaths = Array.isArray(options.ignorePaths) ? options.ignorePaths : DEFAULT_IGNORE_PATHS;
	const trackMethods = Array.isArray(options.trackMethods) ? options.trackMethods : DEFAULT_TRACK_METHODS;
	const resolveUser = options.resolveUser || ((req) => defaultRequestUser(req));
	const mapUser = options.mapUser || ((user) => user);
	const resolveMetadata = options.resolveMetadata || (() => ({}));
	const resolveBackendBaseUrl = options.resolveBackendBaseUrl || ((baseUrl) => baseUrl);
	const sdk = options.sdk || {
		managaniTracking: managaniExpress.managaniTracking,
		createManaganiClient: managaniNode.createManaganiClient,
	};
	let storedSettings = normalizeStoredSettings();
	let runtimeSettings = { enabled: false, baseUrl: '', siteKey: '', siteSecret: '' };
	let loadedAt = 0;
	let refreshPromise = null;

	function logError(message, error) {
		if (typeof logger.error === 'function') logger.error({ err: errorObject(error) }, message);
	}

	function logWarn(message, details = {}) {
		if (typeof logger.warn === 'function') logger.warn(details, message);
	}

	const sdkLogger = {
		error(message, error) {
			logError(String(message || 'Managani SDK error'), error || message);
		},
	};

	function buildRuntimeSettings(stored) {
		let siteSecret = '';
		if (stored.site_secret_encrypted) {
			try {
				siteSecret = secretCodec.decrypt(stored.site_secret_encrypted);
			} catch (error) {
				logError('Failed to decrypt Managani site secret', error);
			}
		}
		return {
			enabled: stored.enabled === true,
			baseUrl: stored.base_url,
			siteKey: stored.site_key,
			siteSecret,
		};
	}

	function isReady() {
		return Boolean(runtimeSettings.enabled && runtimeSettings.baseUrl && runtimeSettings.siteKey && runtimeSettings.siteSecret);
	}

	function backendBaseUrl() {
		if (!isReady()) return '';
		try {
			return resolveBackendBaseUrl(runtimeSettings.baseUrl) || runtimeSettings.baseUrl;
		} catch (error) {
			logError('Failed to resolve Managani backend URL', error);
			return runtimeSettings.baseUrl;
		}
	}

	async function refresh(force = false) {
		const fresh = loadedAt && Date.now() - loadedAt < cacheTtlMs;
		if (!force && fresh) return runtimeSettings;
		if (refreshPromise) return refreshPromise;
		refreshPromise = (async () => {
			const stored = normalizeStoredSettings(await settingsStore.getSetting(settingKey));
			storedSettings = stored;
			runtimeSettings = buildRuntimeSettings(stored);
			loadedAt = Date.now();
			return runtimeSettings;
		})();
		try {
			return await refreshPromise;
		} finally {
			refreshPromise = null;
		}
	}

	function refreshIfStale() {
		if (loadedAt && Date.now() - loadedAt < cacheTtlMs) return;
		void refresh().catch((error) => logError('Failed to refresh Managani settings', error));
	}

	const client = sdk.createManaganiClient({
		baseUrl: () => backendBaseUrl(),
		siteKey: () => isReady() ? runtimeSettings.siteKey : '',
		siteSecret: () => isReady() ? runtimeSettings.siteSecret : '',
		logger: sdkLogger,
	});

	const attachManagani = sdk.managaniTracking({
		baseUrl: () => backendBaseUrl(),
		siteKey: () => isReady() ? runtimeSettings.siteKey : '',
		siteSecret: () => isReady() ? runtimeSettings.siteSecret : '',
		getUser: (req) => defaultRequestUser(req),
		getMetadata: () => ({}),
		logger: sdkLogger,
	});

	function adminSettings() {
		const secretConfigured = Boolean(storedSettings.site_secret_encrypted && runtimeSettings.siteSecret);
		return {
			enabled: storedSettings.enabled,
			base_url: storedSettings.base_url,
			site_key: storedSettings.site_key,
			site_secret_configured: secretConfigured,
			site_secret_masked: secretConfigured ? '********' : '',
		};
	}

	async function initialize() {
		try {
			await refresh(true);
			return isReady();
		} catch (error) {
			logError('Failed to initialize Managani integration', error);
			return false;
		}
	}

	function shouldTrack(req) {
		if (!isReady() || req.managaniSkip === true) return false;
		if (!trackMethods.includes(String(req.method || '').toUpperCase())) return false;
		if (!requestUserId(req)) return false;
		const path = requestPath(req);
		if (ignorePaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
		if (typeof options.shouldTrack === 'function' && options.shouldTrack(req) === false) return false;
		return true;
	}

	function eventName(req) {
		const explicit = req.managaniEvent || req.event;
		if (explicit) return String(explicit).substring(0, 100);
		return req.method === 'GET' ? 'pageview' : 'user_action';
	}

	async function mappedUser(user, context = {}) {
		if (!user) return null;
		return mapUser(user, context);
	}

	async function trackingPayload(req, res, user) {
		const customMetadata = await resolveMetadata(req, res, user) || {};
		return {
			page: requestPath(req).substring(0, 500),
			app_instance: appInstance,
			app_version: appVersion,
			app_location: appLocation,
			is_paid: user?.is_paid,
			timestamp: new Date().toISOString(),
			metadata: {
				method: req.method,
				status_code: res.statusCode,
				host_id: user?.host_id || req.host_id || req.session?.host_id || '',
				tenant_id: req.tenantId || req.session?.tenantId || '',
				auth_method: req.authMethod || '',
				...customMetadata,
			},
		};
	}

	function middleware(req, res, next) {
		refreshIfStale();
		let continued = false;
		function continueRequest() {
			if (continued) return;
			continued = true;
			res.once('finish', function() {
				if (!req.managani?.track || !shouldTrack(req)) return;
				void Promise.resolve(resolveUser(req, res))
					.then((user) => mappedUser(user, { req, res }))
					.then(async (user) => {
						if (!user?.id && !user?._id && !user?.user_id) return;
						const result = await req.managani.track(eventName(req), await trackingPayload(req, res, user), user);
						if (result && result.ok === false && !result.skipped) logWarn('Managani request tracking failed', { status: result.status || 0, path: requestPath(req) });
					})
					.catch((error) => logError('Managani request tracking failed', error));
			});
			next();
		}
		try {
			return attachManagani(req, res, continueRequest);
		} catch (error) {
			logError('Failed to attach Managani request tracking', error);
			return continueRequest();
		}
	}

	async function track(user, event, properties = {}) {
		try {
			await refresh();
			const normalizedUser = await mappedUser(user);
			if (!normalizedUser) return { stored: false, skipped: 'missing_user' };
			return await client.track(normalizedUser, event, {
				app_instance: properties.app_instance || appInstance,
				app_version: properties.app_version || appVersion,
				app_location: properties.app_location || appLocation,
				...properties,
			});
		} catch (error) {
			logError('Managani manual tracking failed', error);
			return { stored: false, skipped: 'tracking_error', error: error.message };
		}
	}

	async function getBrowserContext(user, context = {}) {
		refreshIfStale();
		if (!isReady()) return null;
		try {
			const normalizedUser = await mappedUser(user, context);
			if (!normalizedUser) return null;
			const signed = client.signUser(normalizedUser);
			if (!signed?.token) return null;
			return {
				base_url: runtimeSettings.baseUrl,
				site_key: runtimeSettings.siteKey,
				user_token: signed.token,
			};
		} catch (error) {
			logError('Failed to create Managani browser context', error);
			return null;
		}
	}

	async function getAdminSettings() {
		await refresh(true);
		return adminSettings();
	}

	async function saveAdminSettings(payload = {}) {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ManaganiSettingsError('Managani settings must be an object');
		if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') throw new ManaganiSettingsError('Enabled must be true or false');
		if (payload.base_url !== undefined && typeof payload.base_url !== 'string') throw new ManaganiSettingsError('Managani base URL must be text');
		if (payload.site_key !== undefined && typeof payload.site_key !== 'string') throw new ManaganiSettingsError('Public site key must be text');
		if (payload.site_secret !== undefined && typeof payload.site_secret !== 'string') throw new ManaganiSettingsError('Site secret must be text');
		if (payload.clear_site_secret !== undefined && typeof payload.clear_site_secret !== 'boolean') throw new ManaganiSettingsError('Clear site secret must be true or false');
		if (refreshPromise) {
			try {
				await refreshPromise;
			} catch (error) {
				logError('Failed to finish the pending Managani settings refresh', error);
			}
		}
		const current = normalizeStoredSettings(await settingsStore.getSetting(settingKey));
		const clearSiteSecret = payload.clear_site_secret === true;
		const replacementSecret = typeof payload.site_secret === 'string' ? payload.site_secret.trim() : '';
		if (clearSiteSecret && replacementSecret) throw new ManaganiSettingsError('Choose either replace or clear for the Managani site secret', 'MANAGANI_SECRET_CONFLICT');
		const next = {
			enabled: payload.enabled === undefined ? current.enabled : payload.enabled === true,
			base_url: payload.base_url === undefined ? current.base_url : normalizeBaseUrl(payload.base_url),
			site_key: payload.site_key === undefined ? current.site_key : safeString(payload.site_key),
			site_secret_encrypted: current.site_secret_encrypted,
		};
		if (clearSiteSecret) next.site_secret_encrypted = '';
		if (replacementSecret) {
			try {
				next.site_secret_encrypted = secretCodec.encrypt(replacementSecret);
			} catch {
				throw new ManaganiSettingsError('Site-secret encryption is unavailable. Configure GIT_ENCRYPTION_KEY before saving a Managani secret.', 'MANAGANI_ENCRYPTION_UNAVAILABLE', 500);
			}
		}
		const nextRuntimeSettings = buildRuntimeSettings(next);
		if (next.enabled && (!nextRuntimeSettings.baseUrl || !nextRuntimeSettings.siteKey || !nextRuntimeSettings.siteSecret)) throw new ManaganiSettingsError('Base URL, public site key, and site secret are required before enabling Managani', 'MANAGANI_CONFIGURATION_INCOMPLETE');
		await settingsStore.setSetting(settingKey, next, settingCategory, 'Global Managani widget and activity tracking integration');
		storedSettings = next;
		runtimeSettings = nextRuntimeSettings;
		loadedAt = Date.now();
		return adminSettings();
	}

	return {
		initialize,
		middleware,
		track,
		shouldTrack,
		getBrowserContext,
		getAdminSettings,
		saveAdminSettings,
	};
}

export const _private = {
	normalizeBaseUrl,
	normalizeStoredSettings,
};
