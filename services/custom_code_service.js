import { getSetting, setSetting } from './system_settings_service.js';

const CUSTOM_CODE_KEY = 'custom_code.footer';
const CUSTOM_CODE_CATEGORY = 'custom_code';
const CACHE_TTL_MS = 30_000;
const EMPTY_CUSTOM_CODE = Object.freeze({ js_snippet: '', css_snippet: '' });
let cachedCustomCode = null;
let cachedAt = 0;
let cacheVersion = 0;

export class CustomCodeSettingsError extends Error {
	constructor(message, code = 'CUSTOM_CODE_INVALID', status = 400) {
		super(message);
		this.name = 'CustomCodeSettingsError';
		this.code = code;
		this.status = status;
	}
}

function normalizeCustomCode(value) {
	const input = value && typeof value === 'object' && !Array.isArray(value) ? value : EMPTY_CUSTOM_CODE;
	return {
		js_snippet: typeof input.js_snippet === 'string' ? input.js_snippet : '',
		css_snippet: typeof input.css_snippet === 'string' ? input.css_snippet : '',
	};
}

export async function getCustomCode(options = {}) {
	const fresh = cachedCustomCode && Date.now() - cachedAt < CACHE_TTL_MS;
	if (!options.force && fresh) return { ...cachedCustomCode };
	const readVersion = cacheVersion;
	const loaded = normalizeCustomCode(await getSetting(CUSTOM_CODE_KEY));
	if (readVersion === cacheVersion) {
		cachedCustomCode = loaded;
		cachedAt = Date.now();
	}
	return { ...loaded };
}

export async function updateCustomCode(payload = {}) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CustomCodeSettingsError('Custom code settings must be an object');
	if (payload.js_snippet !== undefined && typeof payload.js_snippet !== 'string') throw new CustomCodeSettingsError('JS Snippet must be text');
	if (payload.css_snippet !== undefined && typeof payload.css_snippet !== 'string') throw new CustomCodeSettingsError('CSS Snippet must be text');
	const current = await getCustomCode({ force: true });
	const next = {
		js_snippet: payload.js_snippet === undefined ? current.js_snippet : payload.js_snippet,
		css_snippet: payload.css_snippet === undefined ? current.css_snippet : payload.css_snippet,
	};
	await setSetting(CUSTOM_CODE_KEY, next, CUSTOM_CODE_CATEGORY, 'Trusted raw footer markup for signed-in application pages');
	cacheVersion += 1;
	cachedCustomCode = next;
	cachedAt = Date.now();
	return { ...next };
}

export const _private = {
	normalizeCustomCode,
};
