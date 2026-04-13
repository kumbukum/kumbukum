import Typesense from 'typesense';
import config from '../config.js';

let client;

// Track conversation models whose api_key has been synced this process lifetime
const syncedConvoModels = new Set();

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
		} catch (err) {
			console.error(`getCollectionCounts: ${type}_${host_id} failed:`, err.message);
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

	// Drop all host collections first (including pages and conversation store)
	const allCollections = [...typeModelMap.map((t) => `${t.type}_${host_id}`), `pages_${host_id}`, `conversation_store_${host_id}`];
	for (const collectionName of allCollections) {
		try {
			await ts.collections(collectionName).delete();
			console.log(`Dropped collection: ${collectionName}`);
		} catch (err) {
			if (err.httpStatus !== 404) {
				console.error(`Failed to drop collection ${collectionName}:`, err.message);
			}
		}
	}

	// Clear synced conversation model tracking
	syncedConvoModels.clear();

	for (const { type, model, transform } of typeModelMap) {
		const collectionName = `${type}_${host_id}`;
		const schemaFn = schemas[type];
		if (!schemaFn) continue;

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

	// Recreate pages collection (populated by crawling, not reindexed from DB)
	if (schemas.pages) {
		await ts.collections().create(schemas.pages(host_id));
		console.log(`Recreated empty pages collection: pages_${host_id}`);
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

// ────────────────────────────────────────────────────────────────────
// Conversation Model Management
// ────────────────────────────────────────────────────────────────────

/**
 * Build the system prompt for the conversation model.
 * This tells the LLM how to interpret search results and respond.
 */
function buildConversationSystemPrompt() {
	const now = new Date();
	return `You are Kumbukum, a personal knowledge assistant. You help users find, organize, and manage their notes, memories, and saved URLs.

## CURRENT TIMESTAMP
${now.toISOString()}

## DATA TYPES
The user's knowledge base contains:
- **Notes**: Rich text documents with title, text_content, project_id, tags
- **Memories**: Facts, decisions, context with title, content, project_id, tags, source
- **URLs**: Saved web pages with url, title, description, text_content, project_id
- **Pages**: Crawled sub-pages with url, title, text_content, parent_url_id, project_id

## RESPONSE FORMAT
You MUST respond with valid JSON only. No markdown, no text outside JSON.
{
  "response": "Brief 1-2 sentence answer. Do NOT list or enumerate individual items — they are displayed visually to the user in a separate panel.",
  "item_ids": ["id1", "id2"],
  "action": null
}

## RULES
- Be SELECTIVE: only include items that truly match the user's intent in item_ids
- Do NOT list, describe, or enumerate individual files/items in the response text — they are shown visually
- For follow-up queries, the user may refer to "the results" or "those items" — use context from prior messages
- Keep responses concise (1-2 sentences)
- If no relevant results, say so honestly

## ACTIONS
When the user asks to perform an action, include an action object:
{
  "response": "Description of what will happen",
  "item_ids": ["id1"],
  "action": {
    "type": "create_note|create_memory|save_url|move_to_project|delete",
    "params": { ... }
  }
}

Action types and params:
- create_note: { "title": "...", "content": "...", "project_id": "..." }
- create_memory: { "title": "...", "content": "...", "project_id": "..." }
- save_url: { "url": "...", "project_id": "..." }
- move_to_project: { "item_ids": ["..."], "item_type": "notes|memories|urls", "project_id": "..." }
- delete: { "item_ids": ["..."], "item_type": "notes|memories|urls", "confirmation_required": true }

Always include project_id in action params. If the user doesn't specify a project, ask which project to use.`;
}

/**
 * Ensure the conversation store collection and conversation model exist for a user.
 * Model ID: convo-{userId}, one per user.
 * Collection: conversation_store_{hostId}, shared per tenant.
 */
export async function ensureConversationModel(hostId, userId) {
	const ts = getTypesenseClient();
	const collectionName = `conversation_store_${hostId}`;
	const modelId = `convo-${userId}`;

	// 1. Ensure conversation store collection exists
	try {
		await ts.collections(collectionName).retrieve();
	} catch (err) {
		if (err.httpStatus === 404) {
			const schema = {
				name: collectionName,
				fields: [
					{ name: 'conversation_id', type: 'string' },
					{ name: 'model_id', type: 'string' },
					{ name: 'timestamp', type: 'int32' },
					{ name: 'role', type: 'string', index: false },
					{ name: 'message', type: 'string', index: false },
				],
			};
			try {
				await ts.collections().create(schema);
				console.log(`Created conversation store collection: ${collectionName}`);
			} catch (createErr) {
				if (createErr.httpStatus !== 409) throw createErr;
			}
		} else {
			throw err;
		}
	}

	// 2. Resolve model configuration
	let tsModelName = config.llm.tsConversationModel || 'gemini-2.0-flash';
	const tsProvider = config.llm.tsConversationProvider || 'google';
	if (!tsModelName.includes('/')) {
		tsModelName = `${tsProvider}/${tsModelName}`;
	}
	const apiKey = tsProvider === 'google' ? config.llm.googleApiKey : config.llm.openaiApiKey;

	// 3. Check if conversation model exists and sync if needed
	let existing = null;
	try {
		existing = await ts.conversations().models(modelId).retrieve({ exclude_fields: 'fields' });
	} catch {
		// Model doesn't exist
	}

	if (existing) {
		// Model exists — check if key settings need updating
		if (!syncedConvoModels.has(modelId)) {
			const updateFields = { api_key: apiKey };
			if (existing.model_name !== tsModelName) {
				updateFields.model_name = tsModelName;
			}
			if (existing.max_bytes !== 102400) {
				updateFields.max_bytes = 102400;
			}
			try {
				await _updateConversationModel(modelId, updateFields);
				syncedConvoModels.add(modelId);
			} catch (err) {
				console.error(`Error updating conversation model ${modelId}:`, err.message);
			}
		}
		return;
	}

	// 4. Create new conversation model
	// Using raw fetch due to Typesense v30.1 bug: large payloads cause custom 'id' to be ignored.
	// Workaround: create without system_prompt first, then PUT the system_prompt separately.
	const node = ts.configuration.nodes[0];
	const baseUrl = `${node.protocol}://${node.host}:${node.port}/conversations/models`;
	const headers = { 'Content-Type': 'application/json', 'X-TYPESENSE-API-KEY': ts.configuration.apiKey };
	const systemPrompt = buildConversationSystemPrompt();

	const modelBody = {
		id: modelId,
		model_name: tsModelName,
		api_key: apiKey,
		history_collection: collectionName,
		max_bytes: 102400,
		ttl: 604800, // 7 days
	};

	try {
		const createResp = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(modelBody) });
		if (!createResp.ok) {
			const body = await createResp.text();
			if (createResp.status === 409) {
				console.log(`Conversation model ${modelId} already exists`);
				syncedConvoModels.add(modelId);
				return;
			}
			throw new Error(`Create conversation model failed (${createResp.status}): ${body}`);
		}

		// Step 2: PUT system_prompt separately
		const updateResp = await fetch(`${baseUrl}/${modelId}`, { method: 'PUT', headers, body: JSON.stringify({ system_prompt: systemPrompt }) });
		if (!updateResp.ok) {
			console.warn(`Conversation model ${modelId} created but system_prompt update failed: ${updateResp.status}`);
		}

		syncedConvoModels.add(modelId);
		console.log(`Created conversation model: ${modelId}`);
	} catch (err) {
		console.error(`Error creating conversation model ${modelId}:`, err.message);
		throw err;
	}
}

/**
 * Update a conversation model via raw HTTP PUT.
 */
async function _updateConversationModel(modelId, fields) {
	const ts = getTypesenseClient();
	const node = ts.configuration.nodes[0];
	const url = `${node.protocol}://${node.host}:${node.port}/conversations/models/${modelId}`;
	const resp = await fetch(url, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', 'X-TYPESENSE-API-KEY': ts.configuration.apiKey },
		body: JSON.stringify(fields),
	});
	if (!resp.ok) {
		const body = await resp.text();
		throw new Error(`Update conversation model failed (${resp.status}): ${body}`);
	}
	return resp.json();
}

/**
 * Conversational search across all collections for a host using the Typesense conversation model.
 * Returns search results + LLM-generated conversational answer.
 *
 * @param {string} hostId - Tenant host ID
 * @param {string} userId - User ID (for conversation model)
 * @param {string} query - User's search query
 * @param {object} options
 * @param {string} options.conversationId - Continue existing conversation (optional)
 * @param {string} options.projectId - Filter by project (optional)
 * @param {number} options.perPage - Results per collection (default 10)
 * @returns {{ results: object, conversation: { answer: string, conversationId: string, itemIds: string[] }, action: object|null }}
 */
export async function conversationSearch(hostId, userId, query, options = {}) {
	const ts = getTypesenseClient();
	const convoModelId = `convo-${userId}`;
	const { conversationId, projectId, perPage = 10 } = options;

	// Build per-collection search requests
	const types = ['notes', 'memory', 'urls', 'pages'];
	const searches = types.map((type) => {
		const search = {
			collection: `${type}_${hostId}`,
			query_by: 'embedding',
			prefix: false,
			per_page: perPage,
		};
		if (projectId) {
			search.filter_by = `project_id:=${projectId}`;
		}
		return search;
	});

	// Common search params — q must be top-level when conversation is enabled
	const searchParams = {
		q: query,
		conversation: true,
		conversation_model_id: convoModelId,
	};
	if (conversationId) {
		searchParams.conversation_id = conversationId;
	}

	// Execute with auto-recovery for missing conversation models
	let data;
	try {
		data = await ts.multiSearch.perform({ searches }, searchParams);
	} catch (err) {
		if (err.httpStatus === 400 && err.message?.includes('conversation_model_id')) {
			console.warn(`Conversation model ${convoModelId} missing, recreating...`);
			await ensureConversationModel(hostId, userId);
			data = await ts.multiSearch.perform({ searches }, searchParams);
		} else {
			throw err;
		}
	}

	// Merge results by type
	const merged = {};
	types.forEach((type, i) => {
		merged[type] = data.results?.[i] || { found: 0, hits: [] };
	});

	// Parse conversation answer
	const rawAnswer = data.conversation?.answer || '';
	const convId = data.conversation?.conversation_id || conversationId || '';
	const parsed = parseConversationAnswer(rawAnswer);

	return {
		results: merged,
		conversation: {
			answer: parsed.response,
			conversationId: convId,
			itemIds: parsed.item_ids || [],
		},
		action: parsed.action || null,
	};
}

/**
 * Parse the JSON conversation answer from the LLM.
 * Handles: pure JSON, markdown fences, embedded JSON, fallback to text.
 */
function parseConversationAnswer(raw) {
	if (!raw) return { response: '', item_ids: [], action: null };

	// 1. Try pure JSON
	try {
		const parsed = JSON.parse(raw);
		if (parsed.response !== undefined) return parsed;
	} catch {}

	// 2. Try markdown code fences
	const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch) {
		try {
			const parsed = JSON.parse(fenceMatch[1].trim());
			if (parsed.response !== undefined) return parsed;
		} catch {}
	}

	// 3. Try embedded JSON object
	const braceMatch = raw.match(/\{[\s\S]*"response"[\s\S]*\}/);
	if (braceMatch) {
		try {
			const parsed = JSON.parse(braceMatch[0]);
			if (parsed.response !== undefined) return parsed;
		} catch {}
	}

	// 4. Fallback: return raw text as response
	return { response: raw.replace(/```[\s\S]*?```/g, '').trim(), item_ids: [], action: null };
}

/**
 * List recent conversations for a user from the conversation store.
 */
export async function listConversations(hostId, userId, { limit = 10 } = {}) {
	const ts = getTypesenseClient();
	const collectionName = `conversation_store_${hostId}`;
	const modelId = `convo-${userId}`;

	try {
		const result = await ts.collections(collectionName).documents().search({
			q: '*',
			query_by: 'conversation_id',
			filter_by: `model_id:=${modelId}`,
			sort_by: 'timestamp:desc',
			per_page: limit * 5,
			exclude_fields: 'embedding',
		});

		// Group by conversation_id, extract first user message as title
		const conversationMap = new Map();
		for (const hit of (result.hits || [])) {
			const doc = hit.document;
			const convoId = doc.conversation_id;
			if (!conversationMap.has(convoId)) {
				conversationMap.set(convoId, {
					conversation_id: convoId,
					first_message: doc.role === 'user' ? doc.message : '',
					latest_timestamp: doc.timestamp,
				});
			} else {
				const existing = conversationMap.get(convoId);
				if (doc.role === 'user' && !existing.first_message) {
					existing.first_message = doc.message;
				}
				if (doc.timestamp > existing.latest_timestamp) {
					existing.latest_timestamp = doc.timestamp;
				}
			}
		}

		return Array.from(conversationMap.values())
			.sort((a, b) => b.latest_timestamp - a.latest_timestamp)
			.slice(0, limit)
			.map((c) => {
				let title = c.first_message || 'Untitled conversation';
				if (title.length > 80) title = title.slice(0, 80) + '...';
				return {
					conversation_id: c.conversation_id,
					title,
					timestamp: c.latest_timestamp,
				};
			});
	} catch (err) {
		if (err.httpStatus === 404) return [];
		throw err;
	}
}

/**
 * Delete a conversation's messages from the store.
 */
export async function deleteConversation(hostId, userId, conversationId) {
	const ts = getTypesenseClient();
	const collectionName = `conversation_store_${hostId}`;
	return ts.collections(collectionName).documents().delete({
		filter_by: `conversation_id:=${conversationId} && model_id:=convo-${userId}`,
	});
}
