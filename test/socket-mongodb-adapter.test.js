import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { describe, it } from 'node:test';
import { createAdapter as createMongoAdapter } from '@socket.io/mongo-adapter';
import { Emitter as MongoEmitter } from '@socket.io/mongo-emitter';
import { MongoClient } from 'mongodb';
import { Server } from 'socket.io';
import { io as createSocketClient } from 'socket.io-client';
import { resolveSocketIOConfig } from '../config.js';

function listen(server) {
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve(server.address().port));
	});
}

function closeSocketServer(io) {
	return new Promise((resolve) => io.close(resolve));
}

describe('Socket.IO MongoDB transport', () => {
	it('keeps Redis as the backward-compatible default', () => {
		assert.deepEqual(
			resolveSocketIOConfig({}, { mongoUri: 'mongodb://mongo:27017/streamient', redisEnabled: true }),
			{
				adapter: 'redis',
				mongoUrl: 'mongodb://mongo:27017/streamient',
			},
		);
	});

	it('selects MongoDB with the primary connection defaults', () => {
		assert.deepEqual(
			resolveSocketIOConfig(
				{ SOCKET_IO_ADAPTER: 'mongodb' },
				{ mongoUri: 'mongodb://mongo:27017/streamient?replicaSet=rs0', redisEnabled: true },
			),
			{
				adapter: 'mongodb',
				mongoUrl: 'mongodb://mongo:27017/streamient?replicaSet=rs0',
			},
		);
	});

	it('uses an explicit MongoDB URL override', () => {
		assert.deepEqual(
			resolveSocketIOConfig(
				{ SOCKET_IO_ADAPTER: 'mongodb', SOCKET_IO_MONGO_URL: 'mongodb://mdb-1:27017/socket-events?replicaSet=rs0' },
				{ mongoUri: 'mongodb://mongo:27017/streamient?replicaSet=rs0', redisEnabled: true },
			),
			{
				adapter: 'mongodb',
				mongoUrl: 'mongodb://mdb-1:27017/socket-events?replicaSet=rs0',
			},
		);
	});

	it('rejects unknown adapters', () => {
		assert.throws(
			() => resolveSocketIOConfig({ SOCKET_IO_ADAPTER: 'unknown' }),
			/SOCKET_IO_ADAPTER must be memory, mongodb, or redis/,
		);
	});

	it('uses MongoDB change streams for servers and out-of-process emitters', async () => {
		const socketSource = fs.readFileSync(new URL('../modules/socket.js', import.meta.url), 'utf8');
		const inserted = [];
		const emitter = new MongoEmitter({ insertOne: async (document) => inserted.push(document) }, '/', { addCreatedAtField: true });

		emitter.to('tenant:host-1').emit('record:updated', { id: 'record-1' });
		await Promise.resolve();

		assert.equal(inserted.length, 1);
		assert.equal(inserted[0].uid, 'emitter');
		assert.ok(inserted[0].createdAt instanceof Date);
		assert.ok(socketSource.includes('createMongoAdapter(mongoCollection, { addCreatedAtField: true })'));
		assert.ok(socketSource.includes("new MongoEmitter(await getSocketMongoCollection(), '/', { addCreatedAtField: true })"));
		assert.ok(socketSource.includes("const SOCKET_MONGO_COLLECTION = 'socketio'"));
		assert.ok(socketSource.includes("collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: SOCKET_MONGO_TTL_SECONDS, background: true })"));
		assert.ok(socketSource.includes('if (!usesRedisSocketTransport() || !config.socketRedis || bridgeSubscriber) return;'));
	});

	it('broadcasts between Socket.IO servers through a MongoDB change stream', { skip: !process.env.TEST_SOCKET_MONGO_URI }, async () => {
		const mongoClient = new MongoClient(process.env.TEST_SOCKET_MONGO_URI);
		await mongoClient.connect();
		const collection = mongoClient.db().collection(`socket_io_adapter_test_${Date.now()}_${process.pid}`);
		await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600, background: true });
		const httpA = http.createServer();
		const httpB = http.createServer();
		const ioA = new Server(httpA, { transports: ['websocket'] });
		const ioB = new Server(httpB, { transports: ['websocket'] });
		ioA.adapter(createMongoAdapter(collection, { addCreatedAtField: true }));
		ioB.adapter(createMongoAdapter(collection, { addCreatedAtField: true }));
		ioB.on('connection', (socket) => socket.join('tenant:test'));
		await listen(httpA);
		const portB = await listen(httpB);
		const client = createSocketClient(`http://127.0.0.1:${portB}`, { transports: ['websocket'], forceNew: true });

		try {
			await once(client, 'connect');
			await new Promise((resolve) => setTimeout(resolve, 250));
			const received = once(client, 'record:updated');
			ioA.to('tenant:test').emit('record:updated', { id: 'record-1' });
			const [payload] = await Promise.race([
				received,
				new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB Socket.IO broadcast timed out')), 5000)),
			]);
			assert.deepEqual(payload, { id: 'record-1' });
			const emitted = once(client, 'record:deleted');
			new MongoEmitter(collection, '/', { addCreatedAtField: true }).to('tenant:test').emit('record:deleted', { id: 'record-2' });
			const [emittedPayload] = await Promise.race([
				emitted,
				new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB Socket.IO emitter timed out')), 5000)),
			]);
			assert.deepEqual(emittedPayload, { id: 'record-2' });
		} finally {
			client.close();
			await Promise.all([closeSocketServer(ioA), closeSocketServer(ioB)]);
			await collection.drop().catch(() => {});
			await mongoClient.close();
		}
	});
});
