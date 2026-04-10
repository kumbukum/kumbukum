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
		cors: {
			origin: config.env === 'development' ? '*' : config.appUrl,
			credentials: true,
		},
	});

	// Redis streams adapter for horizontal scaling (multi-server only)
	if (config.socketRedis) {
		try {
			const redisClient = new Redis(config.redisUrl);
			await new Promise((resolve, reject) => {
				redisClient.once('ready', resolve);
				redisClient.once('error', reject);
				setTimeout(() => reject(new Error('timeout')), 5000);
			});
			io.adapter(createAdapter(redisClient, { streamCount: 4, blockTimeInMs: 10_000 }));
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
 */
export function emitToTenant(host_id, event, data) {
	if (!io) return;
	io.to(`tenant:${host_id}`).emit(event, data);
}
