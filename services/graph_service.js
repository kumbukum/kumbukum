import { GraphLink } from '../model/graph_link.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';
import { searchCollection } from '../modules/typesense.js';
import { cacheGet, cacheSet, cacheInvalidate } from '../modules/redis.js';

const MODEL_MAP = {
	notes: Note,
	memory: Memory,
	urls: Url,
};

const MAX_NODES = 500;
const SEMANTIC_THRESHOLD = 0.7;
const CACHE_TTL = 300; // 5 minutes

// ---- Link CRUD ----

export async function createLink(userId, hostId, data) {
	// Validate source and target exist
	const sourceModel = MODEL_MAP[data.source_type];
	const targetModel = MODEL_MAP[data.target_type];
	if (!sourceModel || !targetModel) throw new Error('Invalid item type');

	const [source, target] = await Promise.all([
		sourceModel.findOne({ _id: data.source_id, host_id: hostId }).select('_id').lean(),
		targetModel.findOne({ _id: data.target_id, host_id: hostId }).select('_id').lean(),
	]);

	if (!source) throw new Error('Source item not found');
	if (!target) throw new Error('Target item not found');

	const link = await GraphLink.create({
		source_id: data.source_id,
		source_type: data.source_type,
		target_id: data.target_id,
		target_type: data.target_type,
		label: data.label || '',
		owner: userId,
		host_id: hostId,
	});

	invalidateGraphCache(hostId).catch(() => {});
	return link;
}

export async function deleteLink(hostId, linkId) {
	const link = await GraphLink.findOneAndDelete({ _id: linkId, host_id: hostId });
	if (link) {
		invalidateGraphCache(hostId).catch(() => {});
	}
	return link;
}

export async function getLinksForItem(hostId, itemId) {
	return GraphLink.find({
		host_id: hostId,
		$or: [{ source_id: itemId }, { target_id: itemId }],
	}).lean();
}

export async function removeLinksForItem(hostId, itemId) {
	const result = await GraphLink.deleteMany({
		host_id: hostId,
		$or: [{ source_id: itemId }, { target_id: itemId }],
	});
	if (result.deletedCount > 0) {
		invalidateGraphCache(hostId).catch(() => {});
	}
	return result;
}

// ---- Graph Data Assembly ----

export async function getGraphData(hostId, options = {}) {
	const { projectId, includeTags = true, includeSemantic = false, semanticThreshold = SEMANTIC_THRESHOLD } = options;

	// Step A: Fetch all non-trashed items as nodes
	const query = { host_id: hostId, in_trash: { $ne: true } };
	if (projectId) query.project = projectId;

	const [notes, memories, urls] = await Promise.all([
		Note.find(query).select('title tags project createdAt updatedAt').limit(MAX_NODES).lean(),
		Memory.find(query).select('title tags project createdAt updatedAt').limit(MAX_NODES).lean(),
		Url.find(query).select('url title tags project createdAt updatedAt').limit(MAX_NODES).lean(),
	]);

	const nodes = [];
	for (const n of notes) nodes.push({ id: n._id.toString(), name: n.title, type: 'notes', tags: n.tags || [], project_id: n.project?.toString(), created_at: n.createdAt });
	for (const m of memories) nodes.push({ id: m._id.toString(), name: m.title, type: 'memory', tags: m.tags || [], project_id: m.project?.toString(), created_at: m.createdAt });
	for (const u of urls) nodes.push({ id: u._id.toString(), name: u.title || u.url, type: 'urls', tags: u.tags || [], project_id: u.project?.toString(), created_at: u.createdAt });

	// Cap total nodes
	if (nodes.length > MAX_NODES) nodes.length = MAX_NODES;

	const nodeIds = new Set(nodes.map((n) => n.id));

	// Step B: Manual links
	const linkQuery = { host_id: hostId };
	const links = await GraphLink.find(linkQuery).lean();
	const edges = [];
	for (const l of links) {
		const sid = l.source_id.toString();
		const tid = l.target_id.toString();
		if (nodeIds.has(sid) && nodeIds.has(tid)) {
			edges.push({
				id: l._id.toString(),
				source: sid,
				target: tid,
				source_type: l.source_type,
				target_type: l.target_type,
				label: l.label || '',
				edge_type: 'manual',
			});
		}
	}

	// Step C: Tag-based edges
	if (includeTags && nodes.length > 0) {
		const cacheKey = `graph:tags:${hostId}:${projectId || 'all'}`;
		let tagEdges = await cacheGet(cacheKey);
		if (!tagEdges) {
			tagEdges = computeTagEdges(nodes);
			await cacheSet(cacheKey, tagEdges, CACHE_TTL);
		}
		edges.push(...tagEdges);
	}

	// Step D: Semantic similarity edges
	if (includeSemantic && nodes.length > 0) {
		const cacheKey = `graph:semantic:${hostId}:${projectId || 'all'}`;
		let semanticEdges = await cacheGet(cacheKey);
		if (!semanticEdges) {
			semanticEdges = await computeSemanticEdges(hostId, nodes, semanticThreshold);
			await cacheSet(cacheKey, semanticEdges, CACHE_TTL);
		}
		edges.push(...semanticEdges);
	}

	return { nodes, edges };
}

// ---- Tag edge computation ----

function computeTagEdges(nodes) {
	const tagMap = new Map(); // tag -> [nodeId, ...]
	for (const node of nodes) {
		for (const tag of node.tags) {
			if (!tag) continue;
			if (!tagMap.has(tag)) tagMap.set(tag, []);
			tagMap.get(tag).push(node.id);
		}
	}

	const edges = [];
	const seen = new Set();
	for (const [tag, ids] of tagMap) {
		if (ids.length < 2) continue;
		// Connect pairs (limit to avoid explosion)
		const maxPairs = Math.min(ids.length, 20);
		for (let i = 0; i < maxPairs; i++) {
			for (let j = i + 1; j < maxPairs; j++) {
				const key = `${ids[i]}-${ids[j]}`;
				if (seen.has(key)) continue;
				seen.add(key);
				edges.push({
					source: ids[i],
					target: ids[j],
					label: tag,
					edge_type: 'tag',
				});
			}
		}
	}

	return edges;
}

// ---- Semantic similarity computation ----

async function computeSemanticEdges(hostId, nodes, threshold) {
	const edges = [];
	const seen = new Set();

	// Sample up to 50 nodes for semantic search to avoid excessive queries
	const sample = nodes.length > 50 ? nodes.slice(0, 50) : nodes;

	const typeQueryBy = {
		notes: 'title,text_content,embedding',
		memory: 'title,content,embedding',
		urls: 'title,description,text_content,embedding',
	};

	for (const node of sample) {
		const queryBy = typeQueryBy[node.type];
		if (!queryBy) continue;

		try {
			const results = await searchCollection(hostId, node.type, node.name, {
				queryBy,
				perPage: 4,
			});

			for (const hit of (results.hits || [])) {
				const targetId = hit.document.id;
				if (targetId === node.id) continue;

				const score = hit.text_match_info?.score || hit.hybrid_search_info?.rank_fusion_score || 0;
				if (score < threshold) continue;

				const key = [node.id, targetId].sort().join('-');
				if (seen.has(key)) continue;
				seen.add(key);

				edges.push({
					source: node.id,
					target: targetId,
					label: `similarity`,
					edge_type: 'semantic',
					score,
				});
			}
		} catch {
			// Collection may not exist
		}
	}

	return edges;
}

// ---- Cache invalidation ----

export async function invalidateGraphCache(hostId) {
	await cacheInvalidate(`graph:*:${hostId}:*`);
}
