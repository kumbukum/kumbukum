import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../modules/tenancy.js';

import * as projectService from '../services/project_service.js';
import * as noteService from '../services/note_service.js';
import * as memoryService from '../services/memory_service.js';
import * as urlService from '../services/url_service.js';
import { searchKnowledge, aiChatSearch } from '../services/ai_chat_service.js';
import { crawlSite } from '../modules/crawler.js';
import { getCollectionCounts, reindexHost } from '../modules/typesense.js';
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

// ---- Typesense Counts ----

router.get('/counts', async (req, res) => {
	try {
		const counts = await getCollectionCounts(req.host_id);
		res.json(counts);
	} catch (err) {
		console.error('Counts error:', err);
		res.json({ notes: 0, memory: 0, urls: 0 });
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

export default router;
