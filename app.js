import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import config from './config.js';
import { connectDB } from './db.js';
import { setupSocketIO } from './modules/socket.js';
import { initTypesense } from './modules/typesense.js';
import { resolveTenant } from './modules/tenancy.js';
import { startChangeStreams } from './modules/change_stream.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import webRoutes from './routes/web.js';
import adminRoutes from './routes/admin.js';
import { startScheduler } from './modules/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/static', express.static(path.join(__dirname, 'public')));

var _90_days_in_ms = 90 * 24 * 60 * 60 * 1000;

const sessionMiddleware = session({
	'secret': config.sessionSecret,
	'resave': true,
	'saveUninitialized': false,
	'proxy': process.env.NODE_ENV === 'production' ? true : false,
	'store': MongoStore.create({
		'mongoUrl': config.mongoUri,
		'collectionName': 'sessions',
		'ttl': _90_days_in_ms,
		'createTTLIndex': true,
	}),
	'cookie': {
		'maxAge': _90_days_in_ms,
		'sameSite': process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
		'secure': process.env.NODE_ENV === 'production' ? true : false 
	},
});


app.use(sessionMiddleware);

app.use(resolveTenant);

// Auth routes mounted at root (/login, /signup, /logout, etc.)
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/api/v1', apiRoutes);

app.get('/', (req, res) => {
	if (req.session?.userId) {
		return res.redirect('/dashboard');
	}
	res.redirect('/login');
});

app.use('/', webRoutes);

async function start() {
	await connectDB();
	await initTypesense();

	const server = app.listen(config.port, () => {
		console.log(`Kumbukum running on port ${config.port} [${config.env}]`);
	});

	await setupSocketIO(server, sessionMiddleware);
	startScheduler();
	startChangeStreams().catch((err) =>
		console.error('Change streams failed to start:', err.message),
	);
}

start().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});

export default app;
