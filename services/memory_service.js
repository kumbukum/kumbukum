import { Memory } from '../model/memory.js';
import { searchCollection, removeDocument } from '../modules/typesense.js';
import { emitToTenant } from '../modules/socket.js';

export async function storeMemory(userId, host_id, data) {
	const mem = await Memory.create({
		title: data.title,
		content: data.content || '',
		tags: data.tags || [],
		source: data.source || '',
		relationships: data.relationships || [],
		project: data.project,
		owner: userId,
		host_id,
	});

	emitToTenant(host_id, 'memory:created', mem);
	return mem;
}

export async function listMemories(host_id, projectId, { page = 1, limit = 50 } = {}) {
	const query = { host_id, in_trash: { $ne: true } };
	if (projectId) query.project = projectId;

	return Memory.find(query)
		.sort({ updatedAt: -1 })
		.skip((page - 1) * limit)
		.limit(limit);
}

export async function getMemory(host_id, memoryId) {
	return Memory.findOne({ _id: memoryId, host_id });
}

export async function updateMemory(host_id, memoryId, data) {
	const update = {};
	if (data.title !== undefined) update.title = data.title;
	if (data.content !== undefined) update.content = data.content;
	if (data.tags !== undefined) update.tags = data.tags;
	if (data.source !== undefined) update.source = data.source;
	if (data.relationships !== undefined) update.relationships = data.relationships;
	if (data.project !== undefined) update.project = data.project;

	const mem = await Memory.findOneAndUpdate(
		{ _id: memoryId, host_id },
		{ $set: update },
		{ new: true },
	);

	if (mem) {
		emitToTenant(host_id, 'memory:updated', mem);
	}

	return mem;
}

export async function deleteMemory(host_id, memoryId) {
	const mem = await Memory.findOneAndUpdate(
		{ _id: memoryId, host_id, in_trash: { $ne: true } },
		{ $set: { in_trash: true, trashed_at: new Date() } },
		{ new: true },
	);
	if (mem) {
		removeDocument(host_id, 'memory', memoryId).catch((err) => console.error('Typesense remove error:', err.message));
		emitToTenant(host_id, 'memory:deleted', { _id: memoryId });
	}
	return mem;
}

export async function recallMemory(host_id, query, options = {}) {
	return searchCollection(host_id, 'memory', query, {
		queryBy: 'title,content,embedding',
		...options,
	});
}

export async function suggestMemoryTags(host_id) {
	const tags = await Memory.distinct('tags', { host_id });
	return tags.filter(Boolean).sort();
}
