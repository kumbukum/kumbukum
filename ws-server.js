/**
 * Standalone WebSocket server for production (separate process).
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import session from 'express-session';
import MongoStore from 'connect-mongo';

const PORT = parseInt(process.env.PORT, 10) || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/kumbukum';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me';

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: '*', credentials: true },
});

// Redis adapter
const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

// Session middleware for auth
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
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
