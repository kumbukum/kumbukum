import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import Redis from 'ioredis';
import config from '../config.js';

let io;

export function getIO() {
	return io;
}

export function setupSocketIO(httpServer, sessionMiddleware) {
	io = new Server(httpServer, {
		cors: {
			origin: config.env === 'development' ? '*' : config.appUrl,
			credentials: true,
		},
	});

	// Redis streams adapter for horizontal scaling
	const redisClient = new Redis(config.redisUrl);

	redisClient.on('connect', () => {
		io.adapter(createAdapter(redisClient));
		console.log('Socket.IO Redis streams adapter connected');
	});
	redisClient.on('error', (err) => {
		console.warn('Socket.IO Redis streams adapter failed, using in-memory:', err.message);
	});

	// Share session with Socket.IO
	io.engine.use(sessionMiddleware);

	io.on('connection', (socket) => {
		const session = socket.request.session;
		if (!session?.userId) {
			socket.disconnect(true);
			return;
		}

		// Join tenant room for scoped broadcasts
		const room = `tenant:${session.host_id}`;
		socket.join(room);

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
