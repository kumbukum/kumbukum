import { MongoClient } from 'mongodb';
import config from '../config.js';
import { indexDocument, removeDocument, ensureCollections } from './typesense.js';

const COLLECTION_MAP = {
	notes: 'notes',
	memories: 'memory',
	urls: 'urls',
};

let client = null;
const streams = [];
let healthInterval = null;

function toTypesenseDoc(type, doc) {
	const base = {
		id: doc._id.toString(),
		project_id: doc.project?.toString() || '',
		created_at: Math.floor(new Date(doc.createdAt || Date.now()).getTime() / 1000),
		updated_at: Math.floor(new Date(doc.updatedAt || Date.now()).getTime() / 1000),
	};

	switch (type) {
		case 'notes':
			return { ...base, title: doc.title || '', text_content: doc.text_content || '', tags: doc.tags || [] };
		case 'memory':
			return { ...base, title: doc.title || '', content: doc.content || '', tags: doc.tags || [], source: doc.source || '' };
		case 'urls':
			return { ...base, url: doc.url || '', title: doc.title || '', description: doc.description || '', text_content: doc.text_content || '' };
		default:
			return base;
	}
}

function watchCollection(db, collectionName, typesenseType) {
	const collection = db.collection(collectionName);
	const stream = collection.watch([], { fullDocument: 'updateLookup' });

	stream.on('change', async (change) => {
		try {
			const { operationType, fullDocument, documentKey } = change;

			if ((operationType === 'insert' || operationType === 'update' || operationType === 'replace') && fullDocument) {
				const host_id = fullDocument.host_id;
				if (!host_id) return;

				// Skip events where only is_indexed changed (avoids infinite loop)
				if (operationType === 'update' && change.updateDescription) {
					const fields = Object.keys(change.updateDescription.updatedFields || {});
					if (fields.length === 1 && fields[0] === 'is_indexed') return;
				}

				// If trashed, remove from Typesense instead of indexing
				if (fullDocument.in_trash) {
					await removeDocument(host_id, typesenseType, fullDocument._id.toString()).catch(() => {});
					return;
				}

				await ensureCollections(host_id);
				const tsDoc = toTypesenseDoc(typesenseType, fullDocument);
				await indexDocument(host_id, typesenseType, tsDoc);

				// Mark as indexed in MongoDB
				collection.updateOne({ _id: fullDocument._id }, { $set: { is_indexed: true } }).catch(() => {});
			} else if (operationType === 'delete' && documentKey?._id) {
				// For deletes we don't have host_id, so we attempt removal with a best-effort approach
				// The document is already gone from MongoDB, so we can't look it up
				console.log(`Change stream delete: ${typesenseType}/${documentKey._id} (skipped — no host_id)`);
			}
		} catch (err) {
			console.error(`Change stream error [${typesenseType}]:`, err.message);
		}
	});

	stream.on('error', (err) => {
		console.error(`Change stream error [${collectionName}]:`, err.message);
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
