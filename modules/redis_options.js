function hasOption(opts, key) {
	return Object.prototype.hasOwnProperty.call(opts, key);
}

function optionOrDefault(opts, key, fallback) {
	return hasOption(opts, key) ? opts[key] : fallback;
}

export function redisRetryStrategy(times) {
	return Math.min(times * 100, 5000);
}

export function isRedisSentinelOptions(opts) {
	return typeof opts === 'object' && opts && Array.isArray(opts.sentinels);
}

export function isTransientRedisError(msg = '') {
	return msg.includes('EHOSTUNREACH') ||
		msg.includes('ECONNREFUSED') ||
		msg.includes('ENOTFOUND') ||
		msg.includes('EAI_AGAIN') ||
		msg.includes('Connection timeout') ||
		msg.includes('Command timed out') ||
		msg.includes('Connection is closed') ||
		msg.includes('sentinels are unreachable') ||
		msg.includes('maxRetriesPerRequest');
}

export function buildRedisConnectionOptions(opts, config = {}) {
	const lazyConnect = config.lazyConnect ?? false;
	const commandTimeout = config.commandTimeout ?? 5000;
	const singleMaxRetriesPerRequest = hasOption(config, 'singleMaxRetriesPerRequest')
		? config.singleMaxRetriesPerRequest
		: null;
	const sentinelMaxRetriesPerRequest = hasOption(config, 'sentinelMaxRetriesPerRequest')
		? config.sentinelMaxRetriesPerRequest
		: null;

	if (isRedisSentinelOptions(opts)) {
		return {
			mode: 'sentinel',
			options: {
				...opts,
				keepAlive: optionOrDefault(opts, 'keepAlive', 10000),
				enableOfflineQueue: optionOrDefault(opts, 'enableOfflineQueue', true),
				sentinelRetryStrategy: optionOrDefault(opts, 'sentinelRetryStrategy', redisRetryStrategy),
				connectTimeout: optionOrDefault(opts, 'connectTimeout', 10000),
				commandTimeout: optionOrDefault(opts, 'commandTimeout', commandTimeout),
				sentinelCommandTimeout: optionOrDefault(opts, 'sentinelCommandTimeout', 10000),
				enableReadyCheck: optionOrDefault(opts, 'enableReadyCheck', false),
				maxRetriesPerRequest: optionOrDefault(opts, 'maxRetriesPerRequest', sentinelMaxRetriesPerRequest),
				retryStrategy: optionOrDefault(opts, 'retryStrategy', redisRetryStrategy),
				sentinelMaxConnections: optionOrDefault(opts, 'sentinelMaxConnections', 3),
				sentinelReconnectOnFailover: optionOrDefault(opts, 'sentinelReconnectOnFailover', true),
				updateSentinels: optionOrDefault(opts, 'updateSentinels', true),
				failoverDetector: optionOrDefault(opts, 'failoverDetector', false),
				lazyConnect,
			},
		};
	}

	const optionSource = typeof opts === 'object' && opts ? opts : {};
	const options = {
		...optionSource,
		keepAlive: optionOrDefault(optionSource, 'keepAlive', 10000),
		enableOfflineQueue: optionOrDefault(optionSource, 'enableOfflineQueue', true),
		connectTimeout: optionOrDefault(optionSource, 'connectTimeout', 10000),
		commandTimeout: optionOrDefault(optionSource, 'commandTimeout', commandTimeout),
		maxRetriesPerRequest: optionOrDefault(optionSource, 'maxRetriesPerRequest', singleMaxRetriesPerRequest),
		retryStrategy: optionOrDefault(optionSource, 'retryStrategy', redisRetryStrategy),
		lazyConnect,
	};

	if (typeof opts === 'string') {
		return {
			mode: 'url',
			url: opts,
			options,
		};
	}

	return {
		mode: 'options',
		options,
	};
}
