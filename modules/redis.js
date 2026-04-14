import Redis from 'ioredis';
import config from '../config.js';

let client = null;

function getRedisClient() {
	if (!client) {
		if (typeof config.redisOptions === 'string') {
			client = new Redis(config.redisOptions, { lazyConnect: true, maxRetriesPerRequest: 3 });
		} else {
			client = new Redis({ ...config.redisOptions, lazyConnect: true, maxRetriesPerRequest: 3 });
		}
		client.on('error', (err) => console.warn('Redis cache error:', err.message));
	}
	return client;
}

async function ensureConnected() {
	const redis = getRedisClient();
	if (redis.status === 'wait') {
		try {
			await redis.connect();
		} catch (err) {
			console.warn('Redis cache connect failed:', err.message);
			return null;
		}
	}
	if (redis.status !== 'ready') return null;
	return redis;
}

export async function cacheGet(key) {
	const redis = await ensureConnected();
	if (!redis) return null;
	try {
		const val = await redis.get(key);
		return val ? JSON.parse(val) : null;
	} catch {
		return null;
	}
}

export async function cacheSet(key, value, ttlSeconds = 300) {
	const redis = await ensureConnected();
	if (!redis) return;
	try {
		await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
	} catch {
		// silently ignore cache write failures
	}
}

export async function cacheInvalidate(pattern) {
	const redis = await ensureConnected();
	if (!redis) return;
	try {
		const keys = await redis.keys(pattern);
		if (keys.length > 0) {
			await redis.del(...keys);
		}
	} catch {
		// silently ignore cache invalidation failures
	}
}

export async function initRedis() {
	const redis = await ensureConnected();
	if (redis) {
		console.log(`Redis connected: ${redis.options.host || 'sentinel'}:${redis.options.port || ''}`);
	}
}
