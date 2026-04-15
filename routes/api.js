import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant, Tenant } from '../modules/tenancy.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formidable } from 'formidable';

import * as projectService from '../services/project_service.js';
import * as noteService from '../services/note_service.js';
import { extractText } from '../services/import_service.js';
import { detectFileType } from '../modules/file_detect.js';
import * as memoryService from '../services/memory_service.js';
import * as urlService from '../services/url_service.js';
import { searchKnowledge, aiChatSearch, processChat } from '../services/ai_chat_service.js';
import { listConversations, deleteConversation } from '../modules/typesense.js';
import * as trashService from '../services/trash_service.js';
import { crawlSite } from '../modules/crawler.js';
import { getProjectCounts } from '../services/project_service.js';
import { reindexHost, searchCollection } from '../modules/typesense.js';
import { emitToTenant } from '../modules/socket.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';
import { User } from '../model/user.js';
import { UserPasskey } from '../model/user_passkey.js';
import * as graphService from '../services/graph_service.js';
import * as exportService from '../services/export_service.js';
import * as auditService from '../services/audit_service.js';
import * as gitSyncService from '../services/git_sync_service.js';
import { createChatLimiter } from '../middleware/rate_limit.js';
import crypto from 'node:crypto';

const router = Router();

router.use(requireAuth, requireTenant);

function auditCtx(req) {
	return {
		user_id: req.userId,
		channel: req.headers['x-mcp-client'] ? 'mcp' : (req.authMethod === 'session' ? 'web' : 'api'),
		token_label: req.tokenLabel,
		mcp_client: req.headers['x-mcp-client'],
		ip: req.ip,
		user_agent: req.headers['user-agent'],
	};
}

// ---- Projects ----

router.get('/projects', async (req, res) => {
	const projects = await projectService.listProjects(req.host_id);
	res.json({ projects });
});

router.post('/projects', async (req, res) => {
	const project = await projectService.createProject(req.userId, req.host_id, req.body, auditCtx(req));
	res.status(201).json({ project });
});

router.get('/projects/:id', async (req, res) => {
	const project = await projectService.getProject(req.host_id, req.params.id);
	if (!project) return res.status(404).json({ error: 'Project not found' });
	res.json({ project });
});

router.put('/projects/:id', async (req, res) => {
	const project = await projectService.updateProject(req.host_id, req.params.id, req.body, auditCtx(req));
	if (!project) return res.status(404).json({ error: 'Project not found' });
	res.json({ project });
});

router.delete('/projects/:id', async (req, res) => {
	try {
		const project = await projectService.deleteProject(req.host_id, req.params.id, auditCtx(req));
		if (!project) return res.status(404).json({ error: 'Project not found' });
		res.json({ message: 'Project deleted' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// ---- Git Sync ----

async function requireGitSyncAccess(req, res, next) {
	const tenant = await Tenant.findOne({ host_id: req.host_id }).select('plan').lean();
	const plan = tenant?.plan || 'free';
	if (plan !== 'pro' && plan !== 'free') {
		return res.status(403).json({ error: 'Git Sync is available on the Pro plan' });
	}
	next();
}

router.get('/projects/:id/git-repos', requireGitSyncAccess, async (req, res) => {
	const repos = await gitSyncService.listGitRepos(req.host_id, req.params.id);
	res.json({ repos });
});

router.post('/projects/:id/git-repos', requireGitSyncAccess, async (req, res) => {
	try {
		const repo = await gitSyncService.createGitRepo(req.userId, req.host_id, {
			...req.body,
			project: req.params.id,
		}, auditCtx(req));
		res.status(201).json({ repo });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

router.get('/git-repos/:id', requireGitSyncAccess, async (req, res) => {
	const repo = await gitSyncService.getGitRepo(req.host_id, req.params.id);
	if (!repo) return res.status(404).json({ error: 'Git repo not found' });
	res.json({ repo });
});

router.put('/git-repos/:id', requireGitSyncAccess, async (req, res) => {
	const repo = await gitSyncService.updateGitRepo(req.host_id, req.params.id, req.body, auditCtx(req));
	if (!repo) return res.status(404).json({ error: 'Git repo not found' });
	res.json({ repo });
});

router.delete('/git-repos/:id', requireGitSyncAccess, async (req, res) => {
	const repo = await gitSyncService.deleteGitRepo(req.host_id, req.params.id, auditCtx(req));
	if (!repo) return res.status(404).json({ error: 'Git repo not found' });
	res.json({ message: 'Git repo deleted' });
});

router.post('/git-repos/:id/sync', requireGitSyncAccess, async (req, res) => {
	try {
		await gitSyncService.syncRepo(req.params.id, req.userId, req.host_id, auditCtx(req));
		res.json({ message: 'Sync complete' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

router.get('/git-repos/:id/status', requireGitSyncAccess, async (req, res) => {
	const repo = await gitSyncService.getGitRepo(req.host_id, req.params.id);
	if (!repo) return res.status(404).json({ error: 'Git repo not found' });
	res.json({
		status: repo.last_sync_status,
		last_synced_at: repo.last_synced_at,
		error: repo.last_sync_error || undefined,
	});
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
	const note = await noteService.createNote(req.userId, req.host_id, req.body, auditCtx(req));
	res.status(201).json({ note });
});

router.get('/notes/:id', async (req, res) => {
	const note = await noteService.getNote(req.host_id, req.params.id);
	if (!note) return res.status(404).json({ error: 'Note not found' });
	res.json({ note });
});

router.put('/notes/:id', async (req, res) => {
	const note = await noteService.updateNote(req.host_id, req.params.id, req.body, auditCtx(req));
	if (!note) return res.status(404).json({ error: 'Note not found' });
	res.json({ note });
});

router.delete('/notes/:id', async (req, res) => {
	const note = await noteService.deleteNote(req.host_id, req.params.id, auditCtx(req));
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
	const memory = await memoryService.storeMemory(req.userId, req.host_id, req.body, auditCtx(req));
	res.status(201).json({ memory });
});

router.get('/memories/:id', async (req, res) => {
	const memory = await memoryService.getMemory(req.host_id, req.params.id);
	if (!memory) return res.status(404).json({ error: 'Memory not found' });
	res.json({ memory });
});

router.put('/memories/:id', async (req, res) => {
	const memory = await memoryService.updateMemory(req.host_id, req.params.id, req.body, auditCtx(req));
	if (!memory) return res.status(404).json({ error: 'Memory not found' });
	res.json({ memory });
});

router.delete('/memories/:id', async (req, res) => {
	const memory = await memoryService.deleteMemory(req.host_id, req.params.id, auditCtx(req));
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
	const url = await urlService.saveUrl(req.userId, req.host_id, req.body, auditCtx(req));

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
	const url = await urlService.updateUrl(req.host_id, req.params.id, req.body, auditCtx(req));
	if (!url) return res.status(404).json({ error: 'URL not found' });
	res.json({ url });
});

router.delete('/urls/:id', async (req, res) => {
	const url = await urlService.deleteUrl(req.host_id, req.params.id, auditCtx(req));
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
		const ctx = auditCtx(req);
		const results = await Promise.all(ids.map((id) => deleteFn(req.host_id, id, ctx).catch(() => null)));
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
		const ctx = auditCtx(req);
		const results = await Promise.all(ids.map((id) => updateFn(req.host_id, id, { project }, ctx).catch(() => null)));
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

// ---- Cross-collection search (for link picker) ----

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

// ---- Resolve IDs to titles (for link picker) ----

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

// ---- Graph Links ----

router.post('/links', async (req, res) => {
	try {
		const { source_id, source_type, target_id, target_type, label } = req.body;
		if (!source_id || !source_type || !target_id || !target_type) {
			return res.status(400).json({ error: 'source_id, source_type, target_id, target_type required' });
		}
		const link = await graphService.createLink(req.userId, req.host_id, { source_id, source_type, target_id, target_type, label }, auditCtx(req));
		res.status(201).json({ link });
	} catch (err) {
		if (err.code === 11000) return res.status(409).json({ error: 'Link already exists' });
		console.error('Create link error:', err);
		res.status(400).json({ error: err.message });
	}
});

router.delete('/links/:id', async (req, res) => {
	const link = await graphService.deleteLink(req.host_id, req.params.id, auditCtx(req));
	if (!link) return res.status(404).json({ error: 'Link not found' });
	res.json({ message: 'Link deleted' });
});

router.get('/links/:itemId', async (req, res) => {
	const links = await graphService.getLinksForItem(req.host_id, req.params.itemId);
	res.json({ links });
});

router.get('/connections/:itemId', async (req, res) => {
	const data = await graphService.getConnectionsForItem(req.host_id, req.params.itemId);
	res.json(data);
});

router.get('/graph', async (req, res) => {
	try {
		const data = await graphService.getGraphData(req.host_id, {
			projectId: req.query.project_id || null,
			includeTags: req.query.include_tags !== 'false',
			includeSemantic: req.query.include_semantic === 'true',
			semanticThreshold: parseFloat(req.query.semantic_threshold) || 0.7,
		});
		res.json(data);
	} catch (err) {
		console.error('Graph data error:', err);
		res.status(500).json({ error: 'Failed to load graph data' });
	}
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
	const results = await searchKnowledge(req.host_id, req.body.query, {
		projectId: req.body.project_id,
		perPage: req.body.per_page,
		...req.body.options,
	});
	res.json({ results });
});

// ---- AI Chat ----

router.post('/chat', createChatLimiter(), async (req, res) => {
	try {
		const { query, conversation_id, project_id } = req.body;
		if (!query) return res.status(400).json({ error: 'query required' });

		const result = await processChat({
			hostId: req.host_id,
			userId: req.userId,
			query,
			conversationId: conversation_id,
			projectId: project_id,
			ctx: auditCtx(req),
		});

		res.json({
			answer: result.answer,
			results: result.results,
			action: result.action,
			conversation_id: result.conversationId,
			display_in: result.displayIn,
		});
	} catch (err) {
		console.error('AI Chat error:', err);
		res.status(500).json({ error: 'AI Chat failed' });
	}
});

router.get('/chat/conversations', async (req, res) => {
	try {
		const conversations = await listConversations(req.host_id, req.userId, {
			limit: parseInt(req.query.limit, 10) || 10,
		});
		res.json({ conversations });
	} catch (err) {
		console.error('List conversations error:', err);
		res.json({ conversations: [] });
	}
});

router.delete('/chat/conversations/:id', async (req, res) => {
	try {
		await deleteConversation(req.host_id, req.userId, req.params.id);
		res.json({ message: 'Conversation deleted' });
	} catch (err) {
		console.error('Delete conversation error:', err);
		res.status(500).json({ error: 'Delete conversation failed' });
	}
});

// Legacy endpoint — deprecated, use POST /chat instead
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
		console.error('AI Chat (legacy) error:', err);
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

// ---- Profile ----

router.put('/profile', async (req, res) => {
	try {
		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ error: 'User not found' });

		const { name, email, timezone } = req.body;
		if (name) user.name = name.trim();
		if (email) user.email = email.trim().toLowerCase();
		if (timezone) user.timezone = timezone.trim();
		await user.save();

		res.json({ user: user.toSafe() });
	} catch (err) {
		console.error('Profile update error:', err);
		res.status(500).json({ error: 'Profile update failed' });
	}
});

// ---- Access Tokens ----

router.get('/tokens', async (req, res) => {
	try {
		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ error: 'User not found' });
		const tokens = (user.access_tokens || []).map((t) => ({
			_id: t._id,
			name: t.name,
			created_at: t.created_at,
		}));
		res.json({ tokens });
	} catch (err) {
		console.error('List tokens error:', err);
		res.status(500).json({ error: 'Failed to list tokens' });
	}
});

router.post('/tokens', async (req, res) => {
	try {
		const { name } = req.body;
		if (!name?.trim()) return res.status(400).json({ error: 'Token name required' });

		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ error: 'User not found' });

		const token = crypto.randomBytes(32).toString('hex');
		user.access_tokens.push({ token, name: name.trim() });
		await user.save();

		const entry = user.access_tokens[user.access_tokens.length - 1];
		res.status(201).json({ token, _id: entry._id, name: entry.name, created_at: entry.created_at });
	} catch (err) {
		console.error('Create token error:', err);
		res.status(500).json({ error: 'Failed to create token' });
	}
});

router.delete('/tokens/:id', async (req, res) => {
	try {
		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ error: 'User not found' });

		const idx = user.access_tokens.findIndex((t) => t._id.toString() === req.params.id);
		if (idx === -1) return res.status(404).json({ error: 'Token not found' });

		user.access_tokens.splice(idx, 1);
		await user.save();

		res.json({ message: 'Token deleted' });
	} catch (err) {
		console.error('Delete token error:', err);
		res.status(500).json({ error: 'Failed to delete token' });
	}
});

// ---- 2FA Disable ----

router.post('/2fa/disable', async (req, res) => {
	try {
		const user = await User.findById(req.userId).select('+totp_secret');
		if (!user) return res.status(404).json({ error: 'User not found' });

		user.totp_enabled = false;
		user.totp_secret = undefined;
		await user.save();

		res.json({ message: '2FA disabled' });
	} catch (err) {
		console.error('2FA disable error:', err);
		res.status(500).json({ error: 'Failed to disable 2FA' });
	}
});

// ---- Passkeys ----

router.get('/passkeys', async (req, res) => {
	try {
		const passkeys = await UserPasskey.find({ user: req.userId }).select('name device_type backed_up browser_info transports last_used_at createdAt').lean();
		res.json({ passkeys });
	} catch (err) {
		console.error('List passkeys error:', err);
		res.status(500).json({ error: 'Failed to list passkeys' });
	}
});

router.patch('/passkeys/:id', async (req, res) => {
	try {
		const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 100) : null;
		if (!name) return res.status(400).json({ error: 'Name is required' });
		const passkey = await UserPasskey.findOneAndUpdate(
			{ _id: req.params.id, user: req.userId },
			{ name },
			{ new: true },
		);
		if (!passkey) return res.status(404).json({ error: 'Passkey not found' });
		res.json({ passkey: { _id: passkey._id, name: passkey.name } });
	} catch (err) {
		console.error('Rename passkey error:', err);
		res.status(500).json({ error: 'Failed to rename passkey' });
	}
});

router.delete('/passkeys/:id', async (req, res) => {
	try {
		const passkey = await UserPasskey.findOneAndDelete({ _id: req.params.id, user: req.userId });
		if (!passkey) return res.status(404).json({ error: 'Passkey not found' });
		res.json({ message: 'Passkey deleted' });
	} catch (err) {
		console.error('Delete passkey error:', err);
		res.status(500).json({ error: 'Failed to delete passkey' });
	}
});

// ---- Notes File Import ----

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = path.join(__dirname, '..', 'import');
if (!fs.existsSync(IMPORT_DIR)) fs.mkdirSync(IMPORT_DIR, { recursive: true });

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

router.post('/notes/import', async (req, res) => {
	try {
		const form = formidable({
			uploadDir: IMPORT_DIR,
			keepExtensions: true,
			maxFileSize: MAX_FILE_SIZE,
			multiples: true,
			filename: (name, ext) => `${crypto.randomUUID()}${ext}`,
		});

		const [fields, files] = await form.parse(req);
		const project = (fields.project && fields.project[0]) || req.query.project;

		// formidable v3 wraps files in arrays
		const fileList = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];
		if (!fileList.length) {
			return res.status(400).type('text').send('No files uploaded');
		}

		// FilePond sends one file per request — handle accordingly
		const f = fileList[0];
		const originalName = f.originalFilename || 'Untitled';
		const ext = path.extname(originalName).toLowerCase();
		const title = path.basename(originalName, ext) || 'Untitled';
		const filePath = f.filepath;

		try {
			const detected = await detectFileType(filePath);
			const { text, html } = await extractText(filePath, detected.mimeType, originalName);

			if (!text && !html) {
				return res.status(415).type('text').send('No text content could be extracted from this file');
			}

			const note = await noteService.createNote(req.userId, req.host_id, {
				title,
				content: html,
				text_content: text,
				tags: ['imported'],
				project,
			}, auditCtx(req));

			res.type('text').send(String(note._id));
		} catch (err) {
			console.error(`Import error for ${originalName}:`, err.message);
			res.status(415).type('text').send(err.message);
		} finally {
			fs.unlink(filePath, () => {});
		}
	} catch (err) {
		console.error('Notes import error:', err);
		res.status(500).type('text').send('Import failed: ' + err.message);
	}
});

// ---- Audit Logs ----

router.get('/audit-logs', async (req, res) => {
	try {
		const result = await auditService.query({
			host_id: req.host_id,
			user_id: req.query.user_id,
			resource: req.query.resource,
			action: req.query.action,
			channel: req.query.channel,
			mcp_client: req.query.mcp_client,
			q: req.query.q,
			from: req.query.from,
			to: req.query.to,
			page: parseInt(req.query.page, 10) || 1,
			per_page: parseInt(req.query.per_page, 10) || 50,
		});
		res.json(result);
	} catch (err) {
		console.error('Audit logs error:', err);
		res.status(500).json({ error: 'Failed to fetch audit logs' });
	}
});

// ---- Export ----

router.post('/export', async (req, res) => {
	try {
		const user = await User.findById(req.userId);
		const doc = await exportService.startExport(req.userId, req.host_id, user.email, user.name);
		res.json({ message: 'Export started', export_id: doc._id });
	} catch (err) {
		if (err.message === 'An export is already in progress') {
			return res.status(409).json({ error: err.message });
		}
		console.error('Export start error:', err);
		res.status(500).json({ error: 'Failed to start export' });
	}
});

router.get('/export/status', async (req, res) => {
	try {
		const doc = await exportService.getExportStatus(req.host_id);
		if (!doc) return res.json({ status: null });
		res.json({ status: doc.status, error: doc.error || undefined, expires_at: doc.expires_at, token: doc.status === 'ready' ? doc.token : undefined });
	} catch (err) {
		console.error('Export status error:', err);
		res.status(500).json({ error: 'Failed to get export status' });
	}
});

router.get('/export/download/:token', async (req, res) => {
	try {
		const filePath = await exportService.getExportFile(req.params.token, req.host_id);
		if (!filePath) return res.status(404).json({ error: 'Export not found or expired' });
		res.download(filePath, 'kumbukum-export.zip');
	} catch (err) {
		console.error('Export download error:', err);
		res.status(500).json({ error: 'Download failed' });
	}
});

export default router;
