/**
 * Standalone WebSocket server for production (separate process).
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import Redis from 'ioredis';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import config from './config.js';

const PORT = parseInt(process.env.PORT, 10) || 3001;

const httpServer = createServer();

const io = new Server(httpServer, {
	cookie: false,
	transports: ['websocket'],
	cors: {
		origin: config.env === 'development' ? '*' : config.appUrl,
		credentials: true,
	},
});

// Redis streams adapter for horizontal scaling
const redisClient = new Redis(config.redisOptions);
await new Promise((resolve, reject) => {
	redisClient.once('ready', resolve);
	redisClient.once('error', reject);
	setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
});
io.adapter(createAdapter(redisClient, { streamCount: 4, blockTimeInMs: 10_000 }));
console.log(`Redis streams adapter connected: ${redisClient.options.host || 'sentinel'}:${redisClient.options.port || ''}`);

// Session middleware for auth
const sessionMiddleware = session({
	secret: config.sessionSecret,
	resave: false,
	saveUninitialized: false,
	store: MongoStore.create({ mongoUrl: config.mongoUri }),
});

io.engine.use(sessionMiddleware);

io.on('connection', (socket) => {
	const sess = socket.request.session;
	if (!sess?.userId) {
		socket.disconnect(true);
		return;
	}
	socket.join(`tenant:${sess.hostId}`);
});

httpServer.listen(PORT, () => {
	console.log(`WebSocket server running on port ${PORT}`);
});
