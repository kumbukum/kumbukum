import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import config from './config.js';
import { connectDB } from './db.js';
import { setupSocketIO } from './modules/socket.js';
import { initTypesense } from './modules/typesense.js';
import { resolveTenant } from './modules/tenancy.js';
import { startChangeStreams } from './modules/change_stream.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import webRoutes from './routes/web.js';
import adminRoutes from './routes/admin.js';
import billingRoutes from './routes/billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Make OpenPanel config available to all templates
app.locals.openpanel = config.openpanel;

// Stripe webhook needs raw body — skip express.json() for this path
app.use((req, res, next) => {
    if (req.originalUrl === '/billing/webhook') return next();
    express.json()(req, res, next);
});
app.use((req, res, next) => {
    if (req.originalUrl === '/billing/webhook') return next();
    express.urlencoded({ extended: true })(req, res, next);
});
app.use(cookieParser());

// --- Static file cache control ---
var _font_extensions = /\.(woff|woff2|ttf|otf|eot)$/i;
var _static_cache_control = process.env.NODE_ENV === 'production'
    ? {
        index: false,
        maxAge: '7d',
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
            if (_font_extensions.test(filePath)) {
                res.setHeader('Access-Control-Allow-Origin', '*');
            }
        },
    }
    : {
        index: false,
        maxAge: '0',
        etag: false,
        lastModified: false,
        setHeaders: (res, filePath) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            if (_font_extensions.test(filePath)) {
                res.setHeader('Access-Control-Allow-Origin', '*');
            }
        },
    };

// --- Docs site (VitePress built output) ---
var _docs_dist = path.join(__dirname, 'docs-dist');
if (fs.existsSync(_docs_dist)) {
    app.use('/docs', express.static(_docs_dist, { ..._static_cache_control, extensions: ['html'], index: 'index.html' }));
    app.use('/docs', (req, res) => {
        res.sendFile(path.join(_docs_dist, '404.html'));
    });
}

app.use('/static', express.static(path.join(__dirname, 'public'), _static_cache_control));

// No cache for dynamic content
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate, private');
    res.set('Cloudflare-CDN-Cache-Control', 'no-store');
    res.set('CDN-Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.removeHeader('ETag');
    next();
});

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
app.use('/api/doc', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
	swaggerOptions: {
		persistAuthorization: true,
	},
}));

app.use('/', authRoutes);
app.use('/', billingRoutes);
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
	startChangeStreams().catch((err) =>
		console.error('Change streams failed to start:', err.message),
	);
}

start().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});

export default app;
