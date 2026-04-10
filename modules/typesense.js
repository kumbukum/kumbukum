import Typesense from 'typesense';
import config from '../config.js';

let client;

export function getTypesenseClient() {
	if (!client) {
		client = new Typesense.Client({
			nodes: config.typesense.nodes,
			apiKey: config.typesense.apiKey,
			connectionTimeoutSeconds: 30,
		});
	}
	return client;
}

/**
 * Collection schemas by type. Host ID is appended at runtime.
 */
const schemas = {
	notes: (host_id) => ({
		name: `notes_${host_id}`,
		fields: [
			{ name: 'title', type: 'string' },
			{ name: 'text_content', type: 'string' },
			{ name: 'project_id', type: 'string', facet: true },
			{ name: 'tags', type: 'string[]', facet: true, optional: true },
			{ name: 'created_at', type: 'int64' },
			{ name: 'updated_at', type: 'int64' },
			{
				name: 'embedding',
				type: 'float[]',
				embed: {
					from: ['title', 'text_content'],
					model_config: {
						model_name: 'ts/multilingual-e5-large',
					},
				},
			},
		],
		default_sorting_field: 'updated_at',
	}),

	memory: (host_id) => ({
		name: `memory_${host_id}`,
		fields: [
			{ name: 'title', type: 'string' },
			{ name: 'content', type: 'string' },
			{ name: 'project_id', type: 'string', facet: true },
			{ name: 'tags', type: 'string[]', facet: true, optional: true },
			{ name: 'source', type: 'string', optional: true },
			{ name: 'created_at', type: 'int64' },
			{ name: 'updated_at', type: 'int64' },
			{
				name: 'embedding',
				type: 'float[]',
				embed: {
					from: ['title', 'content'],
					model_config: {
						model_name: 'ts/multilingual-e5-large',
					},
				},
			},
		],
		default_sorting_field: 'updated_at',
	}),

	urls: (host_id) => ({
		name: `urls_${host_id}`,
		fields: [
			{ name: 'url', type: 'string' },
			{ name: 'title', type: 'string' },
			{ name: 'description', type: 'string', optional: true },
			{ name: 'text_content', type: 'string', optional: true },
			{ name: 'project_id', type: 'string', facet: true },
			{ name: 'created_at', type: 'int64' },
			{ name: 'updated_at', type: 'int64' },
			{
				name: 'embedding',
				type: 'float[]',
				embed: {
					from: ['title', 'description', 'text_content'],
					model_config: {
						model_name: 'ts/multilingual-e5-large',
					},
				},
			},
		],
		default_sorting_field: 'updated_at',
	}),

	pages: (host_id) => ({
		name: `pages_${host_id}`,
		fields: [
			{ name: 'url', type: 'string' },
			{ name: 'parent_url_id', type: 'string', facet: true },
			{ name: 'title', type: 'string' },
			{ name: 'text_content', type: 'string' },
			{ name: 'project_id', type: 'string', facet: true },
			{ name: 'crawled_at', type: 'int64' },
			{
				name: 'embedding',
				type: 'float[]',
				embed: {
					from: ['title', 'text_content'],
					model_config: {
						model_name: 'ts/multilingual-e5-large',
					},
				},
			},
		],
		default_sorting_field: 'crawled_at',
	}),
};

/**
 * Ensure all 4 collections exist for a given host.
 */
export async function ensureCollections(host_id) {
	const ts = getTypesenseClient();
	for (const [type, schemaFn] of Object.entries(schemas)) {
		const schema = schemaFn(host_id);
		try {
			await ts.collections(schema.name).retrieve();
		} catch (err) {
			if (err.httpStatus === 404) {
				await ts.collections().create(schema);
				console.log(`Created Typesense collection: ${schema.name}`);
			} else {
				throw err;
			}
		}
	}
}

/**
 * Index a document into a collection.
 */
export async function indexDocument(host_id, type, doc) {
	const ts = getTypesenseClient();
	const collectionName = `${type}_${host_id}`;
	return ts.collections(collectionName).documents().upsert(doc);
}

/**
 * Remove a document from a collection.
 */
export async function removeDocument(host_id, type, docId) {
	const ts = getTypesenseClient();
	const collectionName = `${type}_${host_id}`;
	return ts.collections(collectionName).documents(docId).delete();
}

/**
 * Search a single collection.
 */
export async function searchCollection(host_id, type, query, options = {}) {
	const ts = getTypesenseClient();
	const collectionName = `${type}_${host_id}`;
	return ts.collections(collectionName).documents().search({
		q: query,
		query_by: options.queryBy || 'embedding',
		prefix: false,
		per_page: options.perPage || 10,
		page: options.page || 1,
		...options.extra,
	});
}

/**
 * Multi-search across all collections for a host.
 */
export async function searchAll(host_id, query, options = {}) {
	const ts = getTypesenseClient();
	const types = ['notes', 'memory', 'urls', 'pages'];
	const searches = types.map((type) => ({
		collection: `${type}_${host_id}`,
		q: query,
		query_by: 'embedding',
		prefix: false,
		per_page: options.perPage || 5,
	}));

	const results = await ts.multiSearch.perform({ searches });
	const merged = {};
	types.forEach((type, i) => {
		merged[type] = results.results[i];
	});
	return merged;
}

/**
 * Get document counts for each collection type for a host.
 * Uses Typesense collection stats.
 */
export async function getCollectionCounts(host_id) {
	const ts = getTypesenseClient();
	const counts = {};
	for (const type of ['notes', 'memory', 'urls']) {
		try {
			const col = await ts.collections(`${type}_${host_id}`).retrieve();
			counts[type] = col.num_documents || 0;
		} catch {
			counts[type] = 0;
		}
	}
	return counts;
}

/**
 * Reindex all documents from MongoDB into Typesense for a host.
 * Drops and recreates collections, then bulk imports from MongoDB.
 */
export async function reindexHost(host_id, models) {
	const ts = getTypesenseClient();
	const { Note, Memory, Url } = models;

	const typeModelMap = [
		{ type: 'notes', model: Note, transform: (doc) => ({
			id: doc._id.toString(),
			title: doc.title || '',
			text_content: doc.text_content || '',
			project_id: doc.project.toString(),
			tags: doc.tags || [],
			created_at: Math.floor(new Date(doc.createdAt).getTime() / 1000),
			updated_at: Math.floor(new Date(doc.updatedAt).getTime() / 1000),
		})},
		{ type: 'memory', model: Memory, transform: (doc) => ({
			id: doc._id.toString(),
			title: doc.title || '',
			content: doc.content || '',
			project_id: doc.project.toString(),
			tags: doc.tags || [],
			source: doc.source || '',
			created_at: Math.floor(new Date(doc.createdAt).getTime() / 1000),
			updated_at: Math.floor(new Date(doc.updatedAt).getTime() / 1000),
		})},
		{ type: 'urls', model: Url, transform: (doc) => ({
			id: doc._id.toString(),
			url: doc.url || '',
			title: doc.title || '',
			description: doc.description || '',
			text_content: doc.text_content || '',
			project_id: doc.project.toString(),
			created_at: Math.floor(new Date(doc.createdAt).getTime() / 1000),
			updated_at: Math.floor(new Date(doc.updatedAt).getTime() / 1000),
		})},
	];

	const results = {};

	for (const { type, model, transform } of typeModelMap) {
		const collectionName = `${type}_${host_id}`;
		const schemaFn = schemas[type];
		if (!schemaFn) continue;

		// Drop existing collection
		try {
			await ts.collections(collectionName).delete();
		} catch {
			// Collection may not exist
		}

		// Recreate
		await ts.collections().create(schemaFn(host_id));

		// Import all documents from MongoDB
		const docs = await model.find({ host_id }).lean();
		let imported = 0;
		for (const doc of docs) {
			try {
				await ts.collections(collectionName).documents().upsert(transform(doc));
				imported++;
			} catch (err) {
				console.error(`Reindex error [${type}/${doc._id}]:`, err.message);
			}
		}
		results[type] = { total: docs.length, imported };
	}

	return results;
}

/**
 * Initialize Typesense client — verify connectivity.
 */
export async function initTypesense() {
	try {
		const ts = getTypesenseClient();
		const health = await ts.health.retrieve();
		console.log(`Typesense connected: ${health.ok ? 'healthy' : 'unhealthy'}`);
	} catch (err) {
		console.warn('Typesense not available — indexing will fail until connected:', err.message);
	}
}
