import { MongoClient } from 'mongodb';
import config from '../config.js';
import { indexDocument, removeDocument, ensureCollections, toTypesenseDoc } from './typesense.js';

const COLLECTION_MAP = {
	notes: 'notes',
	memories: 'memory',
	urls: 'urls',
};

let client = null;
const streams = [];
let healthInterval = null;

// ── Serial async queue ──────────────────────────────────────────────
// Events are processed one at a time to avoid overwhelming Typesense.
const _queue = [];
let _processing = false;

function enqueue(fn) {
	_queue.push(fn);
	if (!_processing) _processQueue();
}

async function _processQueue() {
	_processing = true;
	while (_queue.length) {
		const task = _queue.shift();
		try {
			await task();
		} catch (err) {
			console.error('Change stream queue error:', err.message);
		}
	}
	_processing = false;
}

// ── ensureCollections cache (per host, per process) ─────────────────
const _ensuredHosts = new Set();

async function ensureCollectionsCached(host_id) {
	if (_ensuredHosts.has(host_id)) return;
	await ensureCollections(host_id);
	_ensuredHosts.add(host_id);
}

// ── Retry with exponential backoff ──────────────────────────────────
async function withRetry(fn, label, maxAttempts = 3) {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			const isTimeout = /timeout|ECONNABORTED|ECONNRESET|ECONNREFUSED|Lagging/i.test(err.message);
			if (attempt < maxAttempts && isTimeout) {
				const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
				console.warn(`${label}: attempt ${attempt} failed (${err.message}), retrying in ${delay}ms...`);
				await new Promise((r) => setTimeout(r, delay));
			} else {
				throw err;
			}
		}
	}
}

// ── Index or remove a single change event ───────────────────────────
async function processChange(change, typesenseType, dbCollection) {
	const { operationType, fullDocument } = change;

	if ((operationType === 'insert' || operationType === 'update' || operationType === 'replace') && fullDocument) {
		const host_id = fullDocument.host_id;
		if (!host_id) return;

		// Skip events where only is_indexed changed (avoids infinite loop)
		if (operationType === 'update' && change.updateDescription) {
			const fields = Object.keys(change.updateDescription.updatedFields || {});
			if (fields.length === 1 && fields[0] === 'is_indexed') return;
		}

		const docId = fullDocument._id.toString();

		if (fullDocument.in_trash) {
			await withRetry(() => removeDocument(host_id, typesenseType, docId), `remove [${typesenseType}/${docId}]`);
		} else {
			await ensureCollectionsCached(host_id);
			const tsDoc = toTypesenseDoc(typesenseType, fullDocument);
			await withRetry(() => indexDocument(host_id, typesenseType, tsDoc), `index [${typesenseType}/${docId}]`);
			dbCollection.updateOne({ _id: fullDocument._id }, { $set: { is_indexed: true } }).catch(() => {});
		}
	}
	// Deletes: cleanup handled at the service layer (trash_service) before MongoDB delete
}

function watchCollection(db, collectionName, typesenseType) {
	const collection = db.collection(collectionName);
	const stream = collection.watch([], { fullDocument: 'updateLookup' });

	stream.on('change', (change) => {
		enqueue(() => processChange(change, typesenseType, collection).catch((err) => {
			console.error(`Change stream error [${typesenseType}]:`, err.message);
		}));
	});

	stream.on('error', (err) => {
		console.error(`Change stream error [${collectionName}]:`, err.message);
		// Remove the dead stream before reconnecting
		const idx = streams.indexOf(stream);
		if (idx !== -1) streams.splice(idx, 1);
		// Auto-reconnect after a delay
		setTimeout(() => {
			console.log(`Reconnecting change stream for ${collectionName}...`);
			try {
				watchCollection(db, collectionName, typesenseType);
			} catch (reconnectErr) {
				console.error(`Reconnect failed [${collectionName}]:`, reconnectErr.message);
			}
		}, 5000);
	});

	stream.on('close', () => {
		console.log(`Change stream closed: ${collectionName}`);
		const idx = streams.indexOf(stream);
		if (idx !== -1) streams.splice(idx, 1);
	});

	streams.push(stream);
	console.log(`Watching collection: ${collectionName} → ${typesenseType}`);
}

export async function startChangeStreams() {
	client = new MongoClient(config.mongoUri);
	await client.connect();

	const db = client.db();

	for (const [collectionName, typesenseType] of Object.entries(COLLECTION_MAP)) {
		watchCollection(db, collectionName, typesenseType);
	}

	// Health check — log stream status every 5 minutes
	healthInterval = setInterval(() => {
		const alive = streams.filter((s) => !s.closed).length;
		console.log(`Change streams health: ${alive}/${streams.length} active`);
	}, 5 * 60 * 1000);

	console.log(`Change streams started (${Object.keys(COLLECTION_MAP).length} collections)`);
}

export async function stopChangeStreams() {
	if (healthInterval) {
		clearInterval(healthInterval);
		healthInterval = null;
	}

	// Drain pending queue items
	_queue.length = 0;
	_processing = false;
	_ensuredHosts.clear();

	for (const stream of streams) {
		try {
			await stream.close();
		} catch {
			// ignore close errors
		}
	}
	streams.length = 0;

	if (client) {
		await client.close();
		client = null;
	}

	console.log('Change streams stopped');
}
