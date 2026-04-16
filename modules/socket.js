import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import Redis from 'ioredis';
import config from '../config.js';

let io;

export function getIO() {
	return io;
}

export async function setupSocketIO(httpServer, sessionMiddleware) {
	io = new Server(httpServer, {
		cookie: false,
		transports: ['websocket'],
		pingInterval: 55000,
		pingTimeout: 60000,
		cleanupEmptyChildNamespaces: true,
		cors: { origin: '*', credentials: true },
		connectionStateRecovery: {
			// the backup duration of the sessions and the packets
			maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
			// whether to skip middlewares upon successful recovery
			skipMiddlewares: true,
		},
		tls: { rejectUnauthorized: false },
		perMessageDeflate: { threshold: 32768 },
	});

	// Redis streams adapter for horizontal scaling (multi-server only)
	if (config.socketRedis) {
		try {
			const redisClient = new Redis(config.redisOptions);
			await new Promise((resolve, reject) => {
				redisClient.once('ready', resolve);
				redisClient.once('error', reject);
				setTimeout(() => reject(new Error('timeout')), 5000);
			});
			io.adapter(createAdapter(redisClient, { streamCount: 4, blockTimeInMs: 10_000, heartbeatInterval: 30000, heartbeatTimeout: 90000 }));
			console.log('Socket.IO Redis streams adapter connected');
		} catch (err) {
			console.warn('Socket.IO Redis adapter failed, using in-memory:', err.message);
		}
	}

	io.on('connection', (socket) => {
		// Client subscribes to a tenant room
		socket.on('subscribe', (room) => {
			if (!room) return;
			socket.join(room);
		});

		socket.on('disconnect', () => {
			// cleanup if needed
		});
	});

	console.log('Socket.IO initialized');
	return io;
}

/**
 * Emit a CRUD event to a tenant room.
 * Delay (ms) is configurable via SOCKET_EMIT_DELAY to account for
 * replication lag in clustered setups (MongoDB ReplicaSet, Typesense
 * Cluster, Redis Sentinel). Default 500 ms; set to 0 for instant emit.
 */
export function emitToTenant(host_id, event, data) {
	if (!io) return;
	const delay = config.socketEmitDelay;
	if (delay > 0) {
		setTimeout(() => io.to(`tenant:${host_id}`).emit(event, data), delay);
	} else {
		io.to(`tenant:${host_id}`).emit(event, data);
	}
}
