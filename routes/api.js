import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../modules/tenancy.js';

import * as projectService from '../services/project_service.js';
import * as noteService from '../services/note_service.js';
import * as memoryService from '../services/memory_service.js';
import * as urlService from '../services/url_service.js';
import { searchKnowledge, aiChatSearch } from '../services/ai_chat_service.js';
import * as trashService from '../services/trash_service.js';
import { crawlSite } from '../modules/crawler.js';
import { getProjectCounts } from '../services/project_service.js';
import { reindexHost, searchCollection } from '../modules/typesense.js';
import { emitToTenant } from '../modules/socket.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';

const router = Router();

router.use(requireAuth, requireTenant);

// ---- Projects ----

router.get('/projects', async (req, res) => {
	const projects = await projectService.listProjects(req.host_id);
	res.json({ projects });
});

router.post('/projects', async (req, res) => {
	const project = await projectService.createProject(req.userId, req.host_id, req.body);
	res.status(201).json({ project });
});

router.get('/projects/:id', async (req, res) => {
	const project = await projectService.getProject(req.host_id, req.params.id);
	if (!project) return res.status(404).json({ error: 'Project not found' });
	res.json({ project });
});

router.put('/projects/:id', async (req, res) => {
	const project = await projectService.updateProject(req.host_id, req.params.id, req.body);
	if (!project) return res.status(404).json({ error: 'Project not found' });
	res.json({ project });
});

router.delete('/projects/:id', async (req, res) => {
	try {
		const project = await projectService.deleteProject(req.host_id, req.params.id);
		if (!project) return res.status(404).json({ error: 'Project not found' });
		res.json({ message: 'Project deleted' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// ---- Notes ----

router.get('/notes', async (req, res) => {
	const notes = await noteService.listNotes(req.host_id, req.query.project, {
		page: parseInt(req.query.page, 10) || 1,
		limit: parseInt(req.query.limit, 10) || 50,
	});
	res.json({ notes });
});

router.post('/notes', async (req, res) => {
	const note = await noteService.createNote(req.userId, req.host_id, req.body);
	res.status(201).json({ note });
});

router.get('/notes/:id', async (req, res) => {
	const note = await noteService.getNote(req.host_id, req.params.id);
	if (!note) return res.status(404).json({ error: 'Note not found' });
	res.json({ note });
});

router.put('/notes/:id', async (req, res) => {
	const note = await noteService.updateNote(req.host_id, req.params.id, req.body);
	if (!note) return res.status(404).json({ error: 'Note not found' });
	res.json({ note });
});

router.delete('/notes/:id', async (req, res) => {
	const note = await noteService.deleteNote(req.host_id, req.params.id);
	if (!note) return res.status(404).json({ error: 'Note not found' });
	res.json({ message: 'Note deleted' });
});

router.post('/notes/search', async (req, res) => {
	const results = await noteService.searchNotes(req.host_id, req.body.query, req.body.options);
	res.json({ results });
});

// ---- Memory ----

router.get('/memories', async (req, res) => {
	const memories = await memoryService.listMemories(req.host_id, req.query.project, {
		page: parseInt(req.query.page, 10) || 1,
		limit: parseInt(req.query.limit, 10) || 50,
	});
	res.json({ memories });
});

router.post('/memories', async (req, res) => {
	const memory = await memoryService.storeMemory(req.userId, req.host_id, req.body);
	res.status(201).json({ memory });
});

router.get('/memories/:id', async (req, res) => {
	const memory = await memoryService.getMemory(req.host_id, req.params.id);
	if (!memory) return res.status(404).json({ error: 'Memory not found' });
	res.json({ memory });
});

router.put('/memories/:id', async (req, res) => {
	const memory = await memoryService.updateMemory(req.host_id, req.params.id, req.body);
	if (!memory) return res.status(404).json({ error: 'Memory not found' });
	res.json({ memory });
});

router.delete('/memories/:id', async (req, res) => {
	const memory = await memoryService.deleteMemory(req.host_id, req.params.id);
	if (!memory) return res.status(404).json({ error: 'Memory not found' });
	res.json({ message: 'Memory deleted' });
});

router.post('/memories/search', async (req, res) => {
	const results = await memoryService.recallMemory(req.host_id, req.body.query, req.body.options);
	res.json({ results });
});

router.get('/memories/tags/suggest', async (req, res) => {
	const tags = await memoryService.suggestMemoryTags(req.host_id);
	res.json({ tags });
});

// ---- URLs ----

router.get('/urls', async (req, res) => {
	const urls = await urlService.listUrls(req.host_id, req.query.project, {
		page: parseInt(req.query.page, 10) || 1,
		limit: parseInt(req.query.limit, 10) || 50,
	});
	res.json({ urls });
});

router.post('/urls', async (req, res) => {
	const url = await urlService.saveUrl(req.userId, req.host_id, req.body);

	if (url.crawl_enabled) {
		crawlSite(url).catch((err) => console.error('Background crawl error:', err.message));
	}

	res.status(201).json({ url });
});

router.get('/urls/:id', async (req, res) => {
	const url = await urlService.getUrl(req.host_id, req.params.id);
	if (!url) return res.status(404).json({ error: 'URL not found' });
	res.json({ url });
});

router.put('/urls/:id', async (req, res) => {
	const url = await urlService.updateUrl(req.host_id, req.params.id, req.body);
	if (!url) return res.status(404).json({ error: 'URL not found' });
	res.json({ url });
});

router.delete('/urls/:id', async (req, res) => {
	const url = await urlService.deleteUrl(req.host_id, req.params.id);
	if (!url) return res.status(404).json({ error: 'URL not found' });
	res.json({ message: 'URL deleted' });
});

router.post('/urls/search', async (req, res) => {
	const results = await urlService.searchUrls(req.host_id, req.body.query, req.body.options);
	res.json({ results });
});

// ---- Batch Operations ----

router.post('/batch/delete', async (req, res) => {
	try {
		const { type, ids } = req.body;
		if (!ids?.length || !type) return res.status(400).json({ error: 'type and ids required' });
		if (!['notes', 'memories', 'urls'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

		const deleteFn = { notes: noteService.deleteNote, memories: memoryService.deleteMemory, urls: urlService.deleteUrl }[type];
		const results = await Promise.all(ids.map((id) => deleteFn(req.host_id, id).catch(() => null)));
		const deleted = results.filter(Boolean).length;
		res.json({ message: `${deleted} items deleted`, deleted });
	} catch (err) {
		console.error('Batch delete error:', err);
		res.status(500).json({ error: 'Batch delete failed' });
	}
});

router.post('/batch/move', async (req, res) => {
	try {
		const { type, ids, project } = req.body;
		if (!ids?.length || !type || !project) return res.status(400).json({ error: 'type, ids, and project required' });
		if (!['notes', 'memories', 'urls'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

		const updateFn = { notes: noteService.updateNote, memories: memoryService.updateMemory, urls: urlService.updateUrl }[type];
		const results = await Promise.all(ids.map((id) => updateFn(req.host_id, id, { project }).catch(() => null)));
		const moved = results.filter(Boolean).length;
		if (moved) emitToTenant(req.host_id, 'counts:refresh');
		res.json({ message: `${moved} items moved`, moved });
	} catch (err) {
		console.error('Batch move error:', err);
		res.status(500).json({ error: 'Batch move failed' });
	}
});

router.post('/batch/copy', async (req, res) => {
	try {
		const { type, ids, project } = req.body;
		if (!ids?.length || !type || !project) return res.status(400).json({ error: 'type, ids, and project required' });
		if (!['notes', 'memories', 'urls'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

		const Model = { notes: Note, memories: Memory, urls: Url }[type];
		const docs = await Model.find({ _id: { $in: ids }, host_id: req.host_id }).lean();
		const copies = docs.map((doc) => {
			const { _id, __v, createdAt, updatedAt, ...rest } = doc;
			return { ...rest, project };
		});
		const inserted = await Model.insertMany(copies);
		if (inserted.length) emitToTenant(req.host_id, 'counts:refresh');
		res.json({ message: `${inserted.length} items copied`, copied: inserted.length });
	} catch (err) {
		console.error('Batch copy error:', err);
		res.status(500).json({ error: 'Batch copy failed' });
	}
});

// ---- Cross-collection search (for relationships) ----

router.post('/search/all', async (req, res) => {
	try {
		const query = req.body.query;
		if (!query) return res.status(400).json({ error: 'query required' });

		const types = [
			{ type: 'notes', queryBy: 'embedding' },
			{ type: 'memory', queryBy: 'embedding' },
			{ type: 'urls', queryBy: 'embedding' },
		];

		const results = [];
		for (const { type, queryBy } of types) {
			try {
				const r = await searchCollection(req.host_id, type, query, { queryBy, perPage: 5 });
				for (const hit of (r.hits || [])) {
					results.push({ ...hit.document, _type: type });
				}
			} catch (e) {
				// collection may not exist yet
			}
		}

		res.json({ results });
	} catch (err) {
		console.error('Search all error:', err);
		res.status(500).json({ error: 'Search failed' });
	}
});

// ---- Resolve IDs to titles (for relationships) ----

router.post('/resolve', async (req, res) => {
	const ids = req.body.ids;
	if (!ids?.length) return res.json({ items: [] });

	const [notes, memories, urls] = await Promise.all([
		Note.find({ _id: { $in: ids }, host_id: req.host_id }, 'title').lean(),
		Memory.find({ _id: { $in: ids }, host_id: req.host_id }, 'title').lean(),
		Url.find({ _id: { $in: ids }, host_id: req.host_id }, 'title url').lean(),
	]);

	const items = [];
	for (const n of notes) items.push({ id: n._id.toString(), title: n.title, _type: 'notes' });
	for (const m of memories) items.push({ id: m._id.toString(), title: m.title, _type: 'memory' });
	for (const u of urls) items.push({ id: u._id.toString(), title: u.title || u.url, _type: 'urls' });

	res.json({ items });
});

// ---- Typesense Counts ----

router.get('/counts', async (req, res) => {
	try {
		const counts = await getProjectCounts(req.host_id);
		res.json(counts);
	} catch (err) {
		console.error('Counts error:', err);
		res.json({});
	}
});

// ---- Typesense Reindex ----

router.post('/reindex', async (req, res) => {
	try {
		await reindexHost(req.host_id, { Note, Memory, Url });
		res.json({ message: 'Reindex complete' });
	} catch (err) {
		console.error('Reindex error:', err);
		res.status(500).json({ error: 'Reindex failed: ' + err.message });
	}
});

// ---- Search / Knowledge ----

router.post('/search/knowledge', async (req, res) => {
	const results = await searchKnowledge(req.host_id, req.body.query, req.body.options);
	res.json({ results });
});

// ---- AI Chat ----

router.post('/chat/search', async (req, res) => {
	try {
		const { query, stream: useStream } = req.body;
		if (!query) return res.status(400).json({ error: 'query required' });

		if (useStream) {
			res.setHeader('Content-Type', 'text/event-stream');
			res.setHeader('Cache-Control', 'no-cache');
			res.setHeader('Connection', 'keep-alive');

			const body = await aiChatSearch(req.host_id, query, { stream: true });
			const reader = body.getReader();
			const decoder = new TextDecoder();

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					res.write(`data: ${decoder.decode(value)}\n\n`);
				}
			} finally {
				res.write('data: [DONE]\n\n');
				res.end();
			}
		} else {
			const answer = await aiChatSearch(req.host_id, query);
			res.json({ answer });
		}
	} catch (err) {
		console.error('AI Chat error:', err);
		res.status(500).json({ error: 'AI Chat failed' });
	}
});

// ---- Trash ----

router.get('/trash', async (req, res) => {
	try {
		const result = await trashService.listTrash(req.host_id, {
			type: req.query.type,
			page: parseInt(req.query.page, 10) || 1,
			limit: parseInt(req.query.limit, 10) || 50,
		});
		res.json(result);
	} catch (err) {
		console.error('List trash error:', err);
		res.status(500).json({ error: 'Failed to list trash' });
	}
});

router.get('/trash/count', async (req, res) => {
	try {
		const count = await trashService.getTrashCount(req.host_id);
		res.json({ count });
	} catch (err) {
		console.error('Trash count error:', err);
		res.json({ count: 0 });
	}
});

router.post('/trash/restore', async (req, res) => {
	try {
		const { type, id } = req.body;
		if (!type || !id) return res.status(400).json({ error: 'type and id required' });

		const doc = await trashService.restoreItem(req.host_id, type, id);
		if (!doc) return res.status(404).json({ error: 'Item not found in trash' });
		emitToTenant(req.host_id, 'counts:refresh');
		res.json({ message: 'Item restored', item: doc });
	} catch (err) {
		console.error('Restore error:', err);
		res.status(500).json({ error: 'Restore failed' });
	}
});

router.delete('/trash/:type/:id', async (req, res) => {
	try {
		const { type, id } = req.params;
		if (!['notes', 'memories', 'urls'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

		const doc = await trashService.permanentDelete(req.host_id, type, id);
		if (!doc) return res.status(404).json({ error: 'Item not found in trash' });
		res.json({ message: 'Item permanently deleted' });
	} catch (err) {
		console.error('Permanent delete error:', err);
		res.status(500).json({ error: 'Delete failed' });
	}
});

router.post('/trash/batch/restore', async (req, res) => {
	try {
		const { items } = req.body;
		if (!items?.length) return res.status(400).json({ error: 'items required' });

		const restored = await trashService.batchRestore(req.host_id, items);
		res.json({ message: `${restored.length} items restored`, restored: restored.length });
	} catch (err) {
		console.error('Batch restore error:', err);
		res.status(500).json({ error: 'Batch restore failed' });
	}
});

router.post('/trash/batch/delete', async (req, res) => {
	try {
		const { items } = req.body;
		if (!items?.length) return res.status(400).json({ error: 'items required' });

		const deleted = await trashService.batchPermanentDelete(req.host_id, items);
		res.json({ message: `${deleted.length} items permanently deleted`, deleted: deleted.length });
	} catch (err) {
		console.error('Batch permanent delete error:', err);
		res.status(500).json({ error: 'Batch delete failed' });
	}
});

router.delete('/trash', async (req, res) => {
	try {
		if (req.query.confirm !== 'true') return res.status(400).json({ error: 'confirm=true required' });

		const result = await trashService.emptyTrash(req.host_id);
		emitToTenant(req.host_id, 'counts:refresh');
		res.json({ message: `Trash emptied, ${result.deleted} items deleted`, deleted: result.deleted });
	} catch (err) {
		console.error('Empty trash error:', err);
		res.status(500).json({ error: 'Empty trash failed' });
	}
});

export default router;
