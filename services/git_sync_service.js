import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import simpleGit from 'simple-git';
import matter from 'gray-matter';
import { marked } from 'marked';
import TurndownService from 'turndown';
import striptags from 'striptags';

import { GitRepo } from '../model/git_repo.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import * as noteService from './note_service.js';
import * as memoryService from './memory_service.js';
import * as audit from './audit_service.js';
import { encrypt, decrypt } from '../modules/encryption.js';
import { getRedisClient } from '../modules/redis.js';
import { emitToTenant } from '../modules/socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GIT_REPOS_DIR = path.join(__dirname, '..', 'import', 'git-repos');
fs.mkdirSync(GIT_REPOS_DIR, { recursive: true });

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

// ── Helpers ──

function repoDir(hostId, repoId) {
	return path.join(GIT_REPOS_DIR, hostId, repoId.toString());
}

function cloneUrl(repoUrl, token) {
	if (!token) return repoUrl;
	try {
		const u = new URL(repoUrl);
		u.username = 'x-access-token';
		u.password = token;
		return u.toString();
	} catch {
		return repoUrl;
	}
}

function resolveType(filePath, gitRepo) {
	const notesDir = (gitRepo.notes_path || 'notes').replace(/^\/|\/$/g, '');
	const memoriesDir = (gitRepo.memories_path || 'memories').replace(/^\/|\/$/g, '');
	const relative = filePath.replace(/\\/g, '/');
	if (relative.startsWith(`${memoriesDir}/`)) return 'memory';
	if (relative.startsWith(`${notesDir}/`)) return 'note';
	return 'note'; // default for root-level .md files
}

function parseMarkdownFile(content) {
	const { data: frontmatter, content: body } = matter(content);
	return {
		title: frontmatter.title || '',
		tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
		type: frontmatter.type || '', // 'note' | 'memory' — overrides directory mapping
		body: body.trim(),
	};
}

function noteToMarkdown(note) {
	const fm = { title: note.title };
	if (note.tags?.length) fm.tags = note.tags;
	fm.type = 'note';
	const md = turndown.turndown(note.content || '');
	return matter.stringify(md, fm);
}

function memoryToMarkdown(mem) {
	const fm = { title: mem.title };
	if (mem.tags?.length) fm.tags = mem.tags;
	fm.type = 'memory';
	return matter.stringify(mem.content || '', fm);
}

function fileSha(content) {
	return crypto.createHash('sha1').update(content, 'utf8').digest('hex');
}

async function acquireLock(repoId, ttlSeconds = 600) {
	const redis = getRedisClient();
	const key = `git-sync:${repoId}`;
	const ok = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
	return !!ok;
}

async function releaseLock(repoId) {
	const redis = getRedisClient();
	await redis.del(`git-sync:${repoId}`);
}

// ── CRUD ──

export async function createGitRepo(userId, hostId, data, ctx = {}) {
	const tokenEncrypted = data.auth_token ? encrypt(data.auth_token) : '';
	const repo = await GitRepo.create({
		project: data.project,
		owner: userId,
		host_id: hostId,
		name: data.name || '',
		repo_url: data.repo_url,
		branch: data.branch || 'main',
		auth_token: tokenEncrypted,
		sync_interval: data.sync_interval || 10,
		enabled: data.enabled !== false,
		notes_path: data.notes_path || 'notes',
		memories_path: data.memories_path || 'memories',
		sync_path: data.sync_path || '/',
		trash_on_delete: data.trash_on_delete !== false,
	});
	audit.log({ action: 'create', resource: 'git_repo', resource_id: repo._id.toString(), user_id: userId, host_id: hostId, ...ctx });
	return repo;
}

export async function listGitRepos(hostId, projectId) {
	const query = { host_id: hostId };
	if (projectId) query.project = projectId;
	const repos = await GitRepo.find(query).sort({ createdAt: -1 }).lean();
	return repos.map((r) => ({ ...r, auth_token: r.auth_token ? '••••••••' : '' }));
}

export async function getGitRepo(hostId, repoId) {
	const repo = await GitRepo.findOne({ _id: repoId, host_id: hostId }).lean();
	if (repo) repo.auth_token = repo.auth_token ? '••••••••' : '';
	return repo;
}

export async function updateGitRepo(hostId, repoId, data, ctx = {}) {
	const update = {};
	if (data.name !== undefined) update.name = data.name;
	if (data.repo_url !== undefined) update.repo_url = data.repo_url;
	if (data.branch !== undefined) update.branch = data.branch;
	if (data.auth_token !== undefined) update.auth_token = data.auth_token ? encrypt(data.auth_token) : '';
	if (data.sync_interval !== undefined) update.sync_interval = data.sync_interval;
	if (data.enabled !== undefined) update.enabled = data.enabled;
	if (data.notes_path !== undefined) update.notes_path = data.notes_path;
	if (data.memories_path !== undefined) update.memories_path = data.memories_path;
	if (data.sync_path !== undefined) update.sync_path = data.sync_path;
	if (data.trash_on_delete !== undefined) update.trash_on_delete = data.trash_on_delete;

	const repo = await GitRepo.findOneAndUpdate(
		{ _id: repoId, host_id: hostId },
		{ $set: update },
		{ new: true },
	);
	if (repo) {
		audit.log({ action: 'update', resource: 'git_repo', resource_id: repoId, host_id: hostId, ...ctx });
	}
	return repo ? { ...repo.toObject(), auth_token: repo.auth_token ? '••••••••' : '' } : null;
}

export async function deleteGitRepo(hostId, repoId, ctx = {}) {
	const repo = await GitRepo.findOneAndDelete({ _id: repoId, host_id: hostId });
	if (repo) {
		// Cleanup working directory
		const dir = repoDir(hostId, repoId);
		fs.rm(dir, { recursive: true, force: true }, () => {});
		audit.log({ action: 'delete', resource: 'git_repo', resource_id: repoId, host_id: hostId, ...ctx });
	}
	return repo;
}

// ── Sync ──

export async function syncRepo(repoId, userId, hostId, ctx = {}) {
	const gitRepoDoc = await GitRepo.findOne({ _id: repoId, host_id: hostId });
	if (!gitRepoDoc) throw new Error('Git repo not found');
	if (!gitRepoDoc.enabled) throw new Error('Git sync is disabled for this repo');

	const locked = await acquireLock(repoId);
	if (!locked) throw new Error('Sync already in progress');

	gitRepoDoc.last_sync_status = 'in_progress';
	gitRepoDoc.last_sync_error = '';
	await gitRepoDoc.save();

	try {
		const token = gitRepoDoc.auth_token ? decrypt(gitRepoDoc.auth_token) : '';
		const dir = repoDir(hostId, repoId);
		const branch = gitRepoDoc.branch || 'main';

		// Clone or pull
		const git = simpleGit();
		if (!fs.existsSync(path.join(dir, '.git'))) {
			fs.mkdirSync(dir, { recursive: true });
			await git.clone(cloneUrl(gitRepoDoc.repo_url, token), dir, ['--depth', '1', '--branch', branch]);
		} else {
			const localGit = simpleGit(dir);
			// Update remote URL in case token changed
			await localGit.remote(['set-url', 'origin', cloneUrl(gitRepoDoc.repo_url, token)]);
			await localGit.fetch('origin', branch);
			await localGit.reset(['--hard', `origin/${branch}`]);
		}

		const localGit = simpleGit(dir);

		// Resolve sync_path base
		const syncBase = (gitRepoDoc.sync_path || '/').replace(/^\//, '');

		// Pull: import from git → Kumbukum
		await pullFromGit(localGit, dir, syncBase, gitRepoDoc, userId, hostId, ctx);

		// Push: export from Kumbukum → git
		await pushToGit(localGit, dir, syncBase, gitRepoDoc, userId, hostId, token);

		gitRepoDoc.last_sync_status = 'success';
		gitRepoDoc.last_synced_at = new Date();
		gitRepoDoc.last_sync_error = '';
		await gitRepoDoc.save();

		emitToTenant(hostId, 'counts:refresh');
		audit.log({ action: 'import', resource: 'git_repo', resource_id: repoId, user_id: userId, host_id: hostId, ...ctx });
	} catch (err) {
		gitRepoDoc.last_sync_status = 'failed';
		gitRepoDoc.last_sync_error = err.message;
		await gitRepoDoc.save();
		throw err;
	} finally {
		await releaseLock(repoId);
	}
}

async function pullFromGit(git, dir, syncBase, gitRepo, userId, hostId, ctx) {
	const notesDir = (gitRepo.notes_path || 'notes').replace(/^\/|\/$/g, '');
	const memoriesDir = (gitRepo.memories_path || 'memories').replace(/^\/|\/$/g, '');

	const mdFiles = findMarkdownFiles(dir, syncBase);

	for (const relPath of mdFiles) {
		const absPath = path.join(dir, syncBase, relPath);
		const raw = fs.readFileSync(absPath, 'utf8');
		const sha = fileSha(raw);
		const parsed = parseMarkdownFile(raw);

		// Determine type: frontmatter overrides directory
		let type = parsed.type || resolveType(relPath, gitRepo);

		const title = parsed.title || path.basename(relPath, '.md');

		// Look up existing synced item
		const existingNote = await Note.findOne({ 'git_source.repo_id': gitRepo._id, 'git_source.file_path': relPath, host_id: hostId });
		const existingMemory = await Memory.findOne({ 'git_source.repo_id': gitRepo._id, 'git_source.file_path': relPath, host_id: hostId });
		const existing = existingNote || existingMemory;

		if (existing && existing.git_source?.last_sha === sha) {
			continue; // No change
		}

		if (existing) {
			// Last-write-wins: compare git file mtime vs item updatedAt
			const gitMtime = fs.statSync(absPath).mtime;
			if (existing.updatedAt > gitMtime && existing.updatedAt > (existing.git_source?.last_synced_at || new Date(0))) {
				continue; // Kumbukum version is newer
			}
		}

		const now = new Date();

		if (type === 'memory') {
			if (existingMemory) {
				await Memory.findByIdAndUpdate(existingMemory._id, {
					$set: {
						title,
						content: parsed.body,
						tags: parsed.tags,
						'git_source.last_sha': sha,
						'git_source.last_synced_at': now,
						'git_source.origin': 'import',
						is_indexed: false,
					},
				});
			} else {
				await Memory.create({
					title,
					content: parsed.body,
					tags: parsed.tags.length ? parsed.tags : ['git-sync'],
					project: gitRepo.project,
					owner: userId,
					host_id: hostId,
					git_source: { repo_id: gitRepo._id, file_path: relPath, last_sha: sha, last_synced_at: now, origin: 'import' },
				});
			}
		} else {
			const html = marked.parse(parsed.body);
			const text = striptags(html);
			if (existingNote) {
				await Note.findByIdAndUpdate(existingNote._id, {
					$set: {
						title,
						content: html,
						text_content: text,
						tags: parsed.tags,
						'git_source.last_sha': sha,
						'git_source.last_synced_at': now,
						'git_source.origin': 'import',
						is_indexed: false,
					},
				});
			} else {
				await Note.create({
					title,
					content: html,
					text_content: text,
					tags: parsed.tags.length ? parsed.tags : ['git-sync'],
					project: gitRepo.project,
					owner: userId,
					host_id: hostId,
					git_source: { repo_id: gitRepo._id, file_path: relPath, last_sha: sha, last_synced_at: now, origin: 'import' },
				});
			}
		}
	}
}

async function pushToGit(git, dir, syncBase, gitRepo, userId, hostId, token) {
	const notesDir = (gitRepo.notes_path || 'notes').replace(/^\/|\/$/g, '');
	const memoriesDir = (gitRepo.memories_path || 'memories').replace(/^\/|\/$/g, '');
	const lastSync = gitRepo.last_synced_at || new Date(0);
	let hasChanges = false;
	const pendingUpdates = [];

	// Notes: updated since last sync OR never successfully pushed
	const notesToPush = await Note.find({
		host_id: hostId,
		project: gitRepo.project,
		in_trash: { $ne: true },
		$or: [
			{ updatedAt: { $gt: lastSync } },
			{ 'git_source.origin': { $ne: 'push' } },
		],
	});

	for (const note of notesToPush) {
		const md = noteToMarkdown(note);
		const sha = fileSha(md);

		let relPath = note.git_source?.file_path;
		if (!relPath) {
			const safeName = (note.title || 'Untitled').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
			relPath = `${notesDir}/${safeName}.md`;
		}

		const absPath = path.join(dir, syncBase, relPath);

		// Skip if unchanged AND file exists on disk (stale sha from failed push won't block)
		if (note.git_source?.last_sha === sha && fs.existsSync(absPath)) continue;

		fs.mkdirSync(path.dirname(absPath), { recursive: true });
		fs.writeFileSync(absPath, md, 'utf8');

		// Defer DB update until after push succeeds
		pendingUpdates.push({ model: 'Note', id: note._id, relPath, sha });
		hasChanges = true;
	}

	// Memories: updated since last sync OR never successfully pushed
	const memoriesToPush = await Memory.find({
		host_id: hostId,
		project: gitRepo.project,
		in_trash: { $ne: true },
		$or: [
			{ updatedAt: { $gt: lastSync } },
			{ 'git_source.origin': { $ne: 'push' } },
		],
	});

	for (const mem of memoriesToPush) {
		const md = memoryToMarkdown(mem);
		const sha = fileSha(md);

		let relPath = mem.git_source?.file_path;
		if (!relPath) {
			const safeName = (mem.title || 'Untitled').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
			relPath = `${memoriesDir}/${safeName}.md`;
		}

		const absPath = path.join(dir, syncBase, relPath);

		// Skip if unchanged AND file exists on disk
		if (mem.git_source?.last_sha === sha && fs.existsSync(absPath)) continue;

		fs.mkdirSync(path.dirname(absPath), { recursive: true });
		fs.writeFileSync(absPath, md, 'utf8');

		// Defer DB update until after push succeeds
		pendingUpdates.push({ model: 'Memory', id: mem._id, relPath, sha });
		hasChanges = true;
	}

	if (hasChanges) {
		const localGit = simpleGit(dir);
		await localGit.addConfig('user.email', 'sync@kumbukum.com');
		await localGit.addConfig('user.name', 'Kumbukum Sync');
		await localGit.add('.');
		const status = await localGit.status();
		if (status.files.length > 0) {
			await localGit.commit(`Kumbukum sync ${new Date().toISOString()}`);
			await localGit.push('origin', gitRepo.branch || 'main');
		}

		// Push succeeded — now persist git_source on all items
		const now = new Date();
		for (const upd of pendingUpdates) {
			const Model = upd.model === 'Note' ? Note : Memory;
			await Model.findByIdAndUpdate(upd.id, {
				$set: {
					'git_source.repo_id': gitRepo._id,
					'git_source.file_path': upd.relPath,
					'git_source.last_sha': upd.sha,
					'git_source.last_synced_at': now,
					'git_source.origin': 'push',
				},
			});
		}
	}
}

function findMarkdownFiles(baseDir, syncBase) {
	const results = [];
	const root = path.join(baseDir, syncBase);
	if (!fs.existsSync(root)) return results;

	function walk(dir, prefix) {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue;
			const fullPath = path.join(dir, entry.name);
			const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(fullPath, relPath);
			} else if (entry.name.endsWith('.md')) {
				results.push(relPath);
			}
		}
	}

	walk(root, '');
	return results;
}

// ── Scheduled sync runner ──

export async function runScheduledSync() {
	const now = new Date();
	const repos = await GitRepo.find({ enabled: true }).lean();

	for (const repo of repos) {
		const intervalMs = (repo.sync_interval || 10) * 60 * 1000;
		const lastSync = repo.last_synced_at ? new Date(repo.last_synced_at).getTime() : 0;
		if (now.getTime() - lastSync < intervalMs) continue;
		if (repo.last_sync_status === 'in_progress') continue;

		try {
			await syncRepo(repo._id.toString(), repo.owner.toString(), repo.host_id);
		} catch (err) {
			console.error(`Git sync failed for repo ${repo._id}:`, err.message);
		}
	}
}
