const _dsn = (process.env.SENTRY_DSN_KUMBUKUM || '').trim();
const _disabled = process.env.ENABLE_SENTRY === 'false' || process.env.SENTRY_ENABLED === 'false';
const _enabled = !_disabled && _dsn.length > 0;
const _transport = process.env.MCP_TRANSPORT || (process.argv[2] === '--stdio' || !process.argv[2] ? 'stdio' : 'http');
const _appLocation = process.env.APP_LOCATION || process.env.KUMBUKUM_APP_LOCATION || 'us';
const _tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0');

let Sentry = null;
let _initialized = false;

if (_enabled) {
	Sentry = await import('@sentry/node');

	Sentry.init({
		dsn: _dsn,
		release: `kumbukum-mcp-${process.env.APP_VERSION || '0'}`,
		environment: `${process.env.NODE_ENV || 'production'}-${_appLocation}`,
		sendDefaultPii: false,
		tracesSampleRate: Number.isFinite(_tracesSampleRate) ? _tracesSampleRate : 0,
		initialScope: {
			tags: {
				app: 'kumbukum-mcp',
				app_instance: process.env.APP_INSTANCE || 'kumbukum',
				app_location: _appLocation,
				mcp_transport: _transport,
			},
		},
	});

	_initialized = true;
}

const _asError = function(error) {
	return error instanceof Error ? error : new Error(String(error));
};

export const sentryEnabled = function() {
	return _initialized;
};

export const captureException = function(error, options = {}) {
	if (!_initialized || !Sentry) return;

	Sentry.withScope((scope) => {
		for (const [key, value] of Object.entries(options.tags || {})) {
			scope.setTag(key, value);
		}

		for (const [key, value] of Object.entries(options.contexts || {})) {
			scope.setContext(key, value);
		}

		Sentry.captureException(_asError(error));
	});
};

export const setupExpressErrorHandler = function(app) {
	if (!_initialized || !Sentry || typeof Sentry.setupExpressErrorHandler !== 'function') return;
	Sentry.setupExpressErrorHandler(app);
};

export const flush = function(timeout = 2000) {
	if (!_initialized || !Sentry) return Promise.resolve(false);
	return Sentry.flush(timeout);
};

if (_initialized) {
	process.on('unhandledRejection', (reason) => {
		captureException(reason, { tags: { error_type: 'unhandled_rejection' } });
	});

	process.on('uncaughtException', (error) => {
		captureException(error, { tags: { error_type: 'uncaught_exception' } });
		flush().finally(() => process.exit(1));
	});
}
