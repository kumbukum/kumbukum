import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRedisConnectionOptions } from '../modules/redis_options.js';
import { claimTenantBridgeEvent } from '../modules/socket.js';

describe('Socket.IO Redis performance', () => {
	it('enables auto-pipelining for Sentinel stream clients', () => {
		const connection = buildRedisConnectionOptions({ sentinels: [{ host: 'sentinel-1', port: 26379 }], name: 'cache-master' }, { commandTimeout: 20000, enableAutoPipelining: true, lazyConnect: true });

		assert.equal(connection.options.commandTimeout, 20000);
		assert.equal(connection.options.enableAutoPipelining, true);
		assert.equal(connection.options.lazyConnect, true);
	});

	it('lets only one replica claim a bridged event', async () => {
		const claims = new Set();
		const calls = [];
		const redisClient = {
			async set(...args) {
				calls.push(args);
				const [key] = args;
				if (claims.has(key)) return null;
				claims.add(key);
				return 'OK';
			},
		};
		const payload = { bridge_id: 'event-1' };

		assert.equal(await claimTenantBridgeEvent(redisClient, payload), true);
		assert.equal(await claimTenantBridgeEvent(redisClient, payload), false);
		assert.deepEqual(calls[0], ['streamient:socket:tenant-event:event-1', '1', 'PX', 60000, 'NX']);
	});

	it('keeps rolling-deploy and Redis-error handling fail-open', async () => {
		assert.equal(await claimTenantBridgeEvent({}, { host_id: 'host-1' }), true);
		assert.equal(await claimTenantBridgeEvent({ set: async () => { throw new Error('Redis unavailable'); } }, { bridge_id: 'event-2' }), true);
	});
});
