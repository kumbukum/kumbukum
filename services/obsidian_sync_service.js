import crypto from 'node:crypto';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import striptags from 'striptags';
import TurndownService from 'turndown';
import sanitizeHtml from 'sanitize-html';

import config from '../config.js';
import { queryForSave } from '../model/mongoose.js';
import { Project } from '../model/project.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { ObsidianConnection } from '../model/obsidian_connection.js';
import { ObsidianFile } from '../model/obsidian_file.js';
import { ObsidianChange } from '../model/obsidian_change.js';
import { ObsidianRevision } from '../model/obsidian_revision.js';
import { ObsidianUpload } from '../model/obsidian_upload.js';
import { ObsidianManifestBatch } from '../model/obsidian_manifest_batch.js';
import { ObsidianBlob } from '../model/obsidian_blob.js';
import { detectFileType } from '../modules/file_detect.js';
import { emitToTenant } from '../modules/socket.js';
import { getRedisClient } from '../modules/redis.js';
import { MongoQueue, MongoWorker } from '../modules/mongo_queue.js';
import { extractText } from './import_service.js';
import { materializeBlob, readBlobBuffer, storeBuffer, deleteBlob, deleteConnectionUploads } from './obsidian_blob_service.js';
import { removeDocumentsByFilter } from '../modules/typesense.js';
import * as audit from './audit_service.js';
import { createLogger } from '../modules/logger.js';

const log = createLogger('obsidian-sync');
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export const OBSIDIAN_CONFLICT_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const OBSIDIAN_REVISION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const OBSIDIAN_CHANGE_PAGE_SIZE = 250;
export const OBSIDIAN_EXTRACTION_QUEUE = 'obsidian-file-extraction';
export const OBSIDIAN_MANIFEST_BATCH_SIZE = 500;
export const OBSIDIAN_MANIFEST_EXPIRY_MS = 60 * 60 * 1000;
export const OBSIDIAN_MAX_MANIFEST_BATCHES = 200;

const EXCLUDED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'rtf', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm']);
const IMAGE_EXTENSIONS = new Set(['bmp', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'heic']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'mov', 'mkv']);

export class ObsidianSyncError extends Error {
	constructor(message, status = 400, code = 'invalid_sync_request') {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export function normalizeVaultPath(value) {
	const raw = String(value || '').replace(/\\/g, '/').trim();
	if (!raw || raw.startsWith('/') || raw.includes('\0')) throw new ObsidianSyncError('Vault path must be relative', 400, 'invalid_path');
	const normalized = path.posix.normalize(raw).replace(/^\.\//, '');
	if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new ObsidianSyncError('Vault path escapes the vault', 400, 'invalid_path');
	if (normalized.length > 1024) throw new ObsidianSyncError('Vault path is too long', 400, 'invalid_path');
	return normalized;
}

export function isExcludedVaultPath(value) {
	const normalized = normalizeVaultPath(value);
	const parts = normalized.split('/');
	if (EXCLUDED_NAMES.has(parts.at(-1))) return true;
	if (parts.some((part) => part.startsWith('.'))) return true;
	return /(?:^|\/)(?:~[^/]+|[^/]+\.tmp|[^/]+\.temp|[^/]+\.swp)$/.test(normalized);
}

export function vaultFileKind(value) {
	const extension = path.posix.extname(String(value || '')).slice(1).toLowerCase();
	if (extension === 'md') return 'markdown';
	if (extension === 'canvas') return 'canvas';
	if (extension === 'base') return 'base';
	if (IMAGE_EXTENSIONS.has(extension)) return 'image';
	if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
	if (VIDEO_EXTENSIONS.has(extension)) return 'video';
	if (DOCUMENT_EXTENSIONS.has(extension)) return 'document';
	return 'other';
}

function publicConnection(connection) {
	return {
		id: String(connection._id),
		project_id: String(connection.project),
		name: connection.name,
		streamient_folder: connection.streamient_folder,
		enabled: connection.enabled,
		sequence: connection.sequence || 0,
		devices: connection.devices || [],
		last_synced_at: connection.last_synced_at,
		last_sync_status: connection.last_sync_status,
		last_sync_error: connection.last_sync_error,
		sync_requested_at: connection.sync_requested_at,
		storage_bytes: connection.storage_bytes || 0,
		conflict_count: connection.conflict_count || 0,
	};
}

function publicFile(file) {
	return {
		id: String(file._id),
		path: file.path,
		kind: file.kind,
		mime_type: file.mime_type,
		size: file.size,
		sha256: file.sha256,
		revision: file.revision,
		modified_at: file.modified_at,
		in_trash: file.in_trash,
		note_id: file.note ? String(file.note) : null,
		memory_id: file.memory ? String(file.memory) : null,
	};
}

function publicChange(change) {
	return {
		connection_id: String(change.connection),
		sequence: change.sequence,
		file_id: String(change.file),
		operation: change.operation,
		path: change.path,
		previous_path: change.previous_path || null,
		revision: change.revision,
		sha256: change.sha256,
		modified_at: change.modified_at,
		source: change.source,
		device_id: change.device_id || null,
		conflict: change.conflict,
		conflict_reason: change.conflict_reason || null,
		losing_revision_id: change.losing_revision ? String(change.losing_revision) : null,
		revision_download_url: change.losing_revision ? `/api/v1/obsidian/revisions/${change.losing_revision}/content` : null,
		download_url: ['create', 'update', 'restore'].includes(change.operation) ? `/api/v1/obsidian/files/${change.file}/content` : null,
	};
}

function normalizeTags(value) {
	const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
	return [...new Set(source.map((tag) => String(tag || '').trim().replace(/^#/, '').slice(0, 80)).filter(Boolean))].slice(0, 50);
}

function parsedMarkdown(raw, filePath) {
	const parsed = matter(raw);
	const type = parsed.data.streamient_type === 'memory' ? 'memory' : 'note';
	return {
		type,
		title: String(parsed.data.title || path.posix.basename(filePath, '.md') || 'Untitled').trim().slice(0, 300),
		tags: normalizeTags(parsed.data.tags),
		body: parsed.content,
		frontmatter: parsed.data,
	};
}

function safeFileName(value) {
	return String(value || 'Untitled').replace(/[<>:"/\\|?*]/g, '_').trim().slice(0, 100) || 'Untitled';
}

function itemMarkdown(type, item, existingRaw = '') {
	if (existingRaw) {
		const parsed = matter(existingRaw);
		parsed.data.title = item.title;
		parsed.data.tags = item.tags || [];
		parsed.data.streamient_type = type === 'memory' ? 'memory' : 'note';
		const body = type === 'memory' ? item.content || '' : parsed.content;
		return matter.stringify({ content: body, data: {} }, parsed.data);
	}
	const body = type === 'memory' ? item.content || '' : turndown.turndown(item.content || '');
	const frontmatter = { title: item.title, streamient_type: type === 'memory' ? 'memory' : 'note' };
	if (item.tags?.length) frontmatter.tags = item.tags;
	return matter.stringify({ content: body, data: {} }, frontmatter);
}

function renderCanonicalMarkdown(body) {
	return sanitizeHtml(marked.parse(body || ''), {
		allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
		allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ['href', 'name', 'target', 'rel'], img: ['src', 'alt', 'title'] },
		allowedSchemes: ['http', 'https', 'mailto'],
		allowProtocolRelative: false,
	});
}

function normalizedModifiedAt(value, now = new Date()) {
	const parsed = new Date(value || now);
	if (Number.isNaN(parsed.getTime()) || Math.abs(parsed.getTime() - now.getTime()) > OBSIDIAN_CONFLICT_CLOCK_SKEW_MS) return now;
	return parsed;
}

async function connectionForWrite(hostId, connectionId) {
	const connection = await queryForSave(ObsidianConnection.findOne({ _id: connectionId, host_id: hostId }));
	if (!connection) throw new ObsidianSyncError('Obsidian connection not found', 404, 'connection_not_found');
	if (!connection.enabled) throw new ObsidianSyncError('Obsidian connection is disabled', 409, 'connection_disabled');
	return connection;
}

async function acquireManifestLock(connectionId) {
	const redis = getRedisClient();
	return Boolean(await redis.set(`obsidian-manifest:${connectionId}`, '1', 'EX', 600, 'NX'));
}

async function releaseManifestLock(connectionId) {
	await getRedisClient().del(`obsidian-manifest:${connectionId}`);
}

async function nextSequence(connection) {
	const updated = await ObsidianConnection.findOneAndUpdate(
		{ _id: connection._id, host_id: connection.host_id },
		{ $inc: { sequence: 1 } },
		{ returnDocument: 'after' },
	);
	if (!updated) throw new ObsidianSyncError('Obsidian connection disappeared', 404, 'connection_not_found');
	connection.sequence = updated.sequence;
	return updated.sequence;
}

async function preserveRevision(file, reason) {
	if (!file?.revision || (!file.blob && !file.sha256)) return null;
	return ObsidianRevision.create({
		connection: file.connection,
		file: file._id,
		host_id: file.host_id,
		path: file.path,
		revision: file.revision,
		sha256: file.sha256,
		blob: file.blob || null,
		modified_at: file.modified_at,
		source: file.last_source,
		reason,
		expires_at: new Date(Date.now() + OBSIDIAN_REVISION_RETENTION_MS),
	});
}

async function projectMarkdownFile(file, raw, ownerId) {
	const parsed = parsedMarkdown(raw, file.path);
	const now = file.modified_at || new Date();
	if (parsed.type === 'memory') {
		if (file.note) {
			await Note.findOneAndDelete({ _id: file.note, host_id: file.host_id });
			emitToTenant(file.host_id, 'note:deleted', { _id: file.note });
			file.note = null;
		}
		let memory = file.memory ? await queryForSave(Memory.findOne({ _id: file.memory, host_id: file.host_id })) : null;
		const data = {
			title: parsed.title,
			content: parsed.body.trim(),
			tags: parsed.tags,
			project: file.project,
			owner: ownerId,
			host_id: file.host_id,
			is_indexed: false,
			in_trash: file.in_trash,
			trashed_at: file.in_trash ? file.trashed_at || new Date() : null,
			obsidian_source: { connection_id: file.connection, file_id: file._id },
			updatedAt: now,
		};
		if (memory) {
			await Memory.findByIdAndUpdate(memory._id, { $set: data }, { timestamps: false });
		} else {
			memory = await Memory.create(data);
			file.memory = memory._id;
		}
		emitToTenant(file.host_id, memory.createdAt?.getTime?.() === memory.updatedAt?.getTime?.() ? 'memory:created' : 'memory:updated', memory);
		return memory;
	}

	if (file.memory) {
		await Memory.findOneAndDelete({ _id: file.memory, host_id: file.host_id });
		emitToTenant(file.host_id, 'memory:deleted', { _id: file.memory });
		file.memory = null;
	}
	const html = renderCanonicalMarkdown(parsed.body);
	const textContent = striptags(html, [], ' ').replace(/\s+/g, ' ').trim();
	let note = file.note ? await queryForSave(Note.findOne({ _id: file.note, host_id: file.host_id })) : null;
	const data = {
		title: parsed.title,
		content: html,
		text_content: textContent,
		tags: parsed.tags,
		project: file.project,
		owner: ownerId,
		host_id: file.host_id,
		is_indexed: false,
		in_trash: file.in_trash,
		trashed_at: file.in_trash ? file.trashed_at || new Date() : null,
		obsidian_source: { connection_id: file.connection, file_id: file._id },
		updatedAt: now,
	};
	if (note) {
		await Note.findByIdAndUpdate(note._id, { $set: data }, { timestamps: false });
	} else {
		note = await Note.create(data);
		file.note = note._id;
	}
	emitToTenant(file.host_id, note.createdAt?.getTime?.() === note.updatedAt?.getTime?.() ? 'note:created' : 'note:updated', note);
	return note;
}

function canvasText(raw) {
	try {
		const data = JSON.parse(raw);
		return (data.nodes || []).flatMap((node) => [node.text, node.file, node.url]).filter(Boolean).join('\n');
	} catch {
		return raw;
	}
}

async function extractFileText(file, blob) {
	const name = path.posix.basename(file.path);
	if (file.kind === 'canvas') return canvasText((await readBlobBuffer(blob, file.host_id)).toString('utf8'));
	if (file.kind === 'base') return (await readBlobBuffer(blob, file.host_id)).toString('utf8');
	if (file.kind !== 'document') return `${name}\n${file.path}\n${file.mime_type}`;
	const materialized = await materializeBlob(blob, file.host_id);
	try {
		const detected = await detectFileType(materialized.filePath, name);
		const extracted = await extractText(materialized.filePath, detected.mimeType || file.mime_type, name);
		return extracted.text || `${name}\n${file.path}`;
	} catch (err) {
		log.info({ err, file_id: file._id, path: file.path }, 'Obsidian attachment text extraction skipped');
		return `${name}\n${file.path}\n${file.mime_type}`;
	} finally {
		await materialized.cleanup();
	}
}

async function updateProjection(file, ownerId) {
	if (file.in_trash) {
		file.extraction_status = 'not_needed';
		file.extraction_error = '';
		if (file.note) {
			await Note.findOneAndUpdate({ _id: file.note, host_id: file.host_id }, { $set: { in_trash: true, trashed_at: file.trashed_at || new Date(), is_indexed: false } });
			emitToTenant(file.host_id, 'note:deleted', { _id: file.note });
		}
		if (file.memory) {
			await Memory.findOneAndUpdate({ _id: file.memory, host_id: file.host_id }, { $set: { in_trash: true, trashed_at: file.trashed_at || new Date(), is_indexed: false } });
			emitToTenant(file.host_id, 'memory:deleted', { _id: file.memory });
		}
		file.is_indexed = file.kind === 'markdown';
		return;
	}
	const blob = file.blob ? await ObsidianBlob.findOne({ _id: file.blob, host_id: file.host_id }).lean() : null;
	if (!blob) return;
	if (file.kind === 'markdown') {
		const raw = (await readBlobBuffer(blob, file.host_id)).toString('utf8');
		await projectMarkdownFile(file, raw, ownerId);
		file.text_content = '';
		file.extraction_status = 'not_needed';
		file.extraction_error = '';
		file.is_indexed = true;
		return;
	}
	if (['canvas', 'base', 'document'].includes(file.kind)) {
		file.text_content = `${path.posix.basename(file.path)}\n${file.path}\n${file.mime_type}`;
		file.extraction_status = 'pending';
		file.extraction_error = '';
		file.is_indexed = true;
		return;
	}
	file.text_content = `${path.posix.basename(file.path)}\n${file.path}\n${file.mime_type}`;
	file.extraction_status = 'complete';
	file.extraction_error = '';
	file.is_indexed = false;
}

async function enqueueExtraction(file) {
	if (file.extraction_status !== 'pending') return;
	await MongoQueue.add(OBSIDIAN_EXTRACTION_QUEUE, { file_id: String(file._id), host_id: file.host_id }, { dedupKey: `${file._id}:${file.revision}`, maxAttempts: 3 });
}

async function recordChange(connection, file, operation, options = {}) {
	const sequence = await nextSequence(connection);
	const change = await ObsidianChange.create({
		connection: connection._id,
		file: file._id,
		host_id: connection.host_id,
		sequence,
		operation,
		path: file.path,
		previous_path: options.previousPath || '',
		revision: file.revision,
		sha256: file.sha256,
		modified_at: file.modified_at,
		source: options.source || file.last_source,
		device_id: options.deviceId || file.last_device_id || '',
		operation_id: options.operationId || crypto.randomUUID(),
		conflict: Boolean(options.conflict),
		conflict_reason: options.conflictReason || '',
		losing_revision: options.losingRevision || null,
	});
	return change;
}

async function commitFile(connection, file, operation, options) {
	const previousSize = file.size || 0;
	const nextSize = options.blob ? options.blob.total_bytes : previousSize;
	const projectedStorage = Number(connection.storage_bytes || 0) - previousSize + nextSize;
	if (config.obsidian.maxVaultBytes && projectedStorage > config.obsidian.maxVaultBytes) throw new ObsidianSyncError('Vault exceeds the configured Streamient storage limit', 413, 'vault_too_large');
	const previousRevision = file.revision ? await preserveRevision(file, options.revisionReason || 'File updated') : null;
	if (options.path) file.path = options.path;
	if (options.blob) {
		file.blob = options.blob._id;
		file.sha256 = options.blob.sha256;
		file.size = options.blob.total_bytes;
		file.mime_type = options.blob.mime_type || file.mime_type;
	}
	file.kind = vaultFileKind(file.path);
	file.revision = (file.revision || 0) + 1;
	file.modified_at = options.modifiedAt;
	file.last_source = options.source;
	file.last_device_id = options.deviceId || '';
	if (operation === 'trash') {
		file.in_trash = true;
		file.trashed_at = options.modifiedAt;
	} else if (operation === 'restore' || operation === 'create' || operation === 'update') {
		file.in_trash = false;
		file.trashed_at = null;
	}
	file.is_indexed = false;
	await updateProjection(file, connection.owner);
	await file.save();
	await enqueueExtraction(file).catch(async (err) => {
		log.error({ err, file_id: file._id }, 'Obsidian file extraction queue failed');
		file.extraction_status = 'failed';
		file.extraction_error = err.message || String(err);
		file.is_indexed = false;
		await file.save();
	});
	const storageDelta = (file.size || 0) - previousSize;
	const updates = { $set: { last_synced_at: new Date(), last_sync_status: 'success', last_sync_error: '', sync_requested_at: null } };
	if (storageDelta) updates.$inc = { storage_bytes: storageDelta };
	await ObsidianConnection.updateOne({ _id: connection._id, host_id: connection.host_id }, updates);
	connection.storage_bytes = Math.max(0, Number(connection.storage_bytes || 0) + storageDelta);
	const change = await recordChange(connection, file, operation, { ...options, losingRevision: options.conflict ? previousRevision?._id : null });
	emitToTenant(connection.host_id, 'obsidian:file-changed', publicChange(change));
	emitToTenant(connection.host_id, 'counts:refresh', { project: String(connection.project) });
	return { file, change };
}

async function findFileForMutation(connection, mutation) {
	if (mutation.file_id) return queryForSave(ObsidianFile.findOne({ _id: mutation.file_id, connection: connection._id, host_id: connection.host_id }));
	if (!mutation.path) return null;
	return queryForSave(ObsidianFile.findOne({ connection: connection._id, host_id: connection.host_id, path: normalizeVaultPath(mutation.path) }));
}

async function uploadBlobForMutation(connection, userId, uploadId) {
	if (!uploadId) throw new ObsidianSyncError('Completed upload required', 400, 'upload_required');
	const upload = await ObsidianUpload.findOne({ _id: uploadId, user: userId, host_id: connection.host_id, connection: connection._id, state: 'complete' }).lean();
	if (!upload?.blob) throw new ObsidianSyncError('Completed upload not found', 404, 'upload_not_found');
	const blob = await ObsidianBlob.findOne({ _id: upload.blob, host_id: connection.host_id });
	if (!blob) throw new ObsidianSyncError('Uploaded blob not found', 404, 'blob_not_found');
	const value = blob.toObject ? blob.toObject() : blob;
	return { ...value, mime_type: upload.mime_type || value.mime_type };
}

function conflictPath(value, source) {
	const extension = path.posix.extname(value);
	const stem = extension ? value.slice(0, -extension.length) : value;
	const suffix = new Date().toISOString().replace(/[:.]/g, '-');
	return `${stem} (${source} conflict ${suffix})${extension}`;
}

async function resolveRenamePath(connection, file, requestedPath, modifiedAt, options) {
	const collision = await queryForSave(ObsidianFile.findOne({ connection: connection._id, host_id: connection.host_id, path: requestedPath, _id: { $ne: file._id } }));
	if (!collision) return { path: requestedPath, conflict: false };
	await ObsidianConnection.updateOne({ _id: connection._id, host_id: connection.host_id }, { $inc: { conflict_count: 1 } });
	if (modifiedAt.getTime() <= new Date(collision.modified_at).getTime()) return { path: conflictPath(requestedPath, options.source), conflict: true };
	const previousPath = collision.path;
	await commitFile(connection, collision, 'rename', {
		path: conflictPath(requestedPath, collision.last_source),
		modifiedAt,
		source: options.source,
		deviceId: options.deviceId,
		operationId: `${options.operationId}:collision`,
		previousPath,
		revisionReason: 'Rename path collision',
		conflict: true,
		conflictReason: 'Another file claimed this path',
	});
	return { path: requestedPath, conflict: true };
}

async function recordLosingConflict(connection, file, mutation, blob, modifiedAt, source, deviceId) {
	let losingRevision = null;
	if (blob) {
		losingRevision = await ObsidianRevision.create({
			connection: connection._id,
			file: file._id,
			host_id: connection.host_id,
			path: mutation.path || file.path,
			revision: file.revision,
			sha256: blob.sha256,
			blob: blob._id,
			modified_at: modifiedAt,
			source,
			reason: 'Lost newest-wins conflict',
			expires_at: new Date(Date.now() + OBSIDIAN_REVISION_RETENTION_MS),
		});
	}
	await ObsidianConnection.updateOne({ _id: connection._id, host_id: connection.host_id }, { $inc: { conflict_count: 1 } });
	const change = await recordChange(connection, file, file.in_trash ? 'trash' : 'update', {
		source,
		deviceId,
		operationId: mutation.operation_id,
		previousPath: mutation.path && mutation.path !== file.path ? mutation.path : '',
		conflict: true,
		conflictReason: 'Current file is newer',
		losingRevision: losingRevision?._id || null,
	});
	return { accepted: false, conflict: true, file: publicFile(file), change: publicChange(change) };
}

async function applyMutation(connection, userId, mutation, source = 'obsidian') {
	const operationId = String(mutation.operation_id || '').trim();
	if (!operationId || operationId.length > 200) throw new ObsidianSyncError('operation_id is required', 400, 'operation_id_required');
	const previous = await ObsidianChange.findOne({ connection: connection._id, host_id: connection.host_id, operation_id: operationId }).lean();
	if (previous) {
		const existingFile = await ObsidianFile.findOne({ _id: previous.file, host_id: connection.host_id }).lean();
		return { accepted: !previous.conflict, duplicate: true, conflict: previous.conflict, file: publicFile(existingFile), change: publicChange(previous) };
	}
	const operation = String(mutation.operation || 'update');
	if (!['create', 'update', 'rename', 'trash', 'restore'].includes(operation)) throw new ObsidianSyncError('Unsupported sync operation', 400, 'invalid_operation');
	const deviceId = String(mutation.device_id || '').slice(0, 200);
	const modifiedAt = normalizedModifiedAt(mutation.modified_at);
	let file = await findFileForMutation(connection, mutation);
	if (!file && !['create', 'update'].includes(operation)) throw new ObsidianSyncError('Synchronized file not found', 404, 'file_not_found');
	let requestedPath = mutation.path ? normalizeVaultPath(mutation.path) : file?.path;
	if (!requestedPath || isExcludedVaultPath(requestedPath)) throw new ObsidianSyncError('File path is excluded from synchronization', 400, 'path_excluded');
	let blob = null;
	if (['create', 'update', 'restore'].includes(operation) && mutation.upload_id) blob = await uploadBlobForMutation(connection, userId, mutation.upload_id);
	if (['create', 'update'].includes(operation) && !blob) throw new ObsidianSyncError('File content upload required', 400, 'upload_required');
	if (!file) {
		file = new ObsidianFile({
			connection: connection._id,
			project: connection.project,
			host_id: connection.host_id,
			path: requestedPath,
			kind: vaultFileKind(requestedPath),
			mime_type: blob.mime_type,
			size: 0,
			revision: 0,
			modified_at: modifiedAt,
			last_source: source,
		});
	}
	const baseRevision = Number(mutation.base_revision || 0);
	if (file.revision && baseRevision !== file.revision && modifiedAt.getTime() <= new Date(file.modified_at).getTime()) {
		return recordLosingConflict(connection, file, { ...mutation, operation, operation_id: operationId }, blob, modifiedAt, source, deviceId);
	}
	if (file.revision && baseRevision !== file.revision) await ObsidianConnection.updateOne({ _id: connection._id, host_id: connection.host_id }, { $inc: { conflict_count: 1 } });
	const previousPath = file.path;
	let renameConflict = false;
	if (operation === 'rename') {
		const rename = await resolveRenamePath(connection, file, requestedPath, modifiedAt, { source, deviceId, operationId });
		requestedPath = rename.path;
		renameConflict = rename.conflict;
	}
	const result = await commitFile(connection, file, operation === 'create' && file.revision ? 'update' : operation, {
		path: requestedPath,
		blob,
		modifiedAt,
		source,
		deviceId,
		operationId,
		previousPath: operation === 'rename' ? previousPath : '',
		revisionReason: baseRevision !== file.revision ? 'Won newest-wins conflict' : 'File updated',
		conflict: renameConflict || file.revision > 0 && baseRevision !== file.revision,
		conflictReason: renameConflict ? 'Another file claimed the requested path' : file.revision > 0 && baseRevision !== file.revision ? 'Incoming file is newer' : '',
	});
	return { accepted: true, conflict: Boolean(result.change.conflict), file: publicFile(result.file), change: publicChange(result.change) };
}

async function uniqueExportPath(connection, desired) {
	let candidate = desired;
	const extension = path.posix.extname(desired);
	const stem = extension ? desired.slice(0, -extension.length) : desired;
	for (let index = 2; await ObsidianFile.exists({ connection: connection._id, host_id: connection.host_id, path: candidate }).read('primary'); index++) candidate = `${stem}-${index}${extension}`;
	return candidate;
}

async function exportProjectItem(connection, type, item) {
	const folder = type === 'memory' ? `${connection.streamient_folder}/Memories` : connection.streamient_folder;
	const filePath = await uniqueExportPath(connection, `${folder}/${safeFileName(item.title)}.md`);
	const file = new ObsidianFile({
		connection: connection._id,
		project: connection.project,
		host_id: connection.host_id,
		path: filePath,
		kind: 'markdown',
		mime_type: 'text/markdown',
		size: 0,
		revision: 0,
		modified_at: item.updatedAt || new Date(),
		last_source: 'streamient',
		[type]: item._id,
	});
	const Model = type === 'memory' ? Memory : Note;
	const claimed = await Model.findOneAndUpdate(
		{ _id: item._id, host_id: connection.host_id, $or: [{ 'obsidian_source.connection_id': { $exists: false } }, { 'obsidian_source.connection_id': null }] },
		{ $set: { obsidian_source: { connection_id: connection._id, file_id: file._id } } },
		{ returnDocument: 'after' },
	);
	if (!claimed) {
		const current = await Model.findOne({ _id: item._id, host_id: connection.host_id }).select('obsidian_source').read('primary').lean();
		return current?.obsidian_source?.file_id ? ObsidianFile.findOne({ _id: current.obsidian_source.file_id, host_id: connection.host_id }).read('primary') : null;
	}
	try {
		const raw = itemMarkdown(type, claimed);
		const blob = await storeBuffer(connection.host_id, Buffer.from(raw), 'text/markdown');
		await commitFile(connection, file, 'create', {
			blob,
			modifiedAt: claimed.updatedAt || new Date(),
			source: 'streamient',
			operationId: `streamient:${type}:${item._id}:create`,
		});
		return file;
	} catch (err) {
		await Model.updateOne({ _id: item._id, host_id: connection.host_id, 'obsidian_source.file_id': file._id }, { $unset: { obsidian_source: '' } });
		throw err;
	}
}

async function pendingProjectItems(connection) {
	const query = {
		host_id: connection.host_id,
		project: connection.project,
		in_trash: { $ne: true },
		$or: [{ 'obsidian_source.connection_id': { $exists: false } }, { 'obsidian_source.connection_id': null }],
	};
	return Promise.all([
		Note.find(query).read('primary').lean(),
		Memory.find(query).read('primary').lean(),
	]);
}

async function ensureProjectExports(connection) {
	const [notes, memories] = await pendingProjectItems(connection);
	for (const note of notes) await exportProjectItem(connection, 'note', note);
	for (const memory of memories) await exportProjectItem(connection, 'memory', memory);
}

export async function listConnections(hostId, projectId = null) {
	const query = { host_id: hostId };
	if (projectId) query.project = projectId;
	return (await ObsidianConnection.find(query).sort({ createdAt: -1 }).lean()).map(publicConnection);
}

export async function createConnection(userId, hostId, data, ctx = {}) {
	const project = await Project.findOne({ _id: data.project_id, host_id: hostId, is_active: true }).select('_id').lean();
	if (!project) throw new ObsidianSyncError('Project not found', 404, 'project_not_found');
	let connection = await queryForSave(ObsidianConnection.findOne({ host_id: hostId, project: project._id }));
	if (!connection) {
		try {
			connection = await ObsidianConnection.create({
				project: project._id,
				owner: userId,
				host_id: hostId,
				name: String(data.name || 'Obsidian vault').trim().slice(0, 200),
				streamient_folder: normalizeVaultPath(data.streamient_folder || 'Streamient'),
			});
			audit.log({ action: 'create', resource: 'obsidian_connection', resource_id: connection._id.toString(), user_id: userId, host_id: hostId, ...ctx });
		} catch (err) {
			if (err?.code !== 11000) throw err;
			connection = await queryForSave(ObsidianConnection.findOne({ host_id: hostId, project: project._id }));
			if (!connection) throw err;
		}
	}
	if (data.device_id) await registerDevice(hostId, connection._id, data);
	return publicConnection(await ObsidianConnection.findOne({ _id: connection._id, host_id: hostId }).lean());
}

export async function registerDevice(hostId, connectionId, data) {
	const connection = await queryForSave(ObsidianConnection.findOne({ _id: connectionId, host_id: hostId }));
	if (!connection) throw new ObsidianSyncError('Obsidian connection not found', 404, 'connection_not_found');
	const deviceId = String(data.device_id || '').trim().slice(0, 200);
	if (!deviceId) throw new ObsidianSyncError('device_id is required', 400, 'device_id_required');
	const existing = connection.devices.find((device) => device.device_id === deviceId);
	if (existing) {
		existing.name = String(data.device_name || existing.name || '').slice(0, 200);
		existing.platform = String(data.platform || existing.platform || '').slice(0, 100);
		existing.last_seen_at = new Date();
	} else {
		connection.devices.push({ device_id: deviceId, name: String(data.device_name || '').slice(0, 200), platform: String(data.platform || '').slice(0, 100), last_seen_at: new Date(), last_cursor: 0 });
	}
	await connection.save();
	return publicConnection(connection);
}

export async function updateConnection(hostId, connectionId, data, ctx = {}) {
	const set = {};
	if (data.enabled !== undefined) set.enabled = Boolean(data.enabled);
	if (data.name !== undefined) set.name = String(data.name || '').trim().slice(0, 200);
	if (data.streamient_folder !== undefined) set.streamient_folder = normalizeVaultPath(data.streamient_folder || 'Streamient');
	const connection = await ObsidianConnection.findOneAndUpdate({ _id: connectionId, host_id: hostId }, { $set: set }, { returnDocument: 'after' });
	if (!connection) throw new ObsidianSyncError('Obsidian connection not found', 404, 'connection_not_found');
	audit.log({ action: 'update', resource: 'obsidian_connection', resource_id: String(connectionId), host_id: hostId, ...ctx });
	return publicConnection(connection);
}

export async function removeConnection(hostId, connectionId, ctx = {}) {
	const connection = await ObsidianConnection.findOne({ _id: connectionId, host_id: hostId }).lean();
	if (!connection) throw new ObsidianSyncError('Obsidian connection not found', 404, 'connection_not_found');
	const [files, revisions] = await Promise.all([
		ObsidianFile.find({ connection: connection._id, host_id: hostId }).select('blob').lean(),
		ObsidianRevision.find({ connection: connection._id, host_id: hostId }).select('blob').lean(),
	]);
	const blobIds = [...new Set([...files, ...revisions].map((item) => item.blob ? String(item.blob) : '').filter(Boolean))];
	await deleteConnectionUploads(hostId, connection._id);
	await Promise.all([
		Note.updateMany({ host_id: hostId, 'obsidian_source.connection_id': connection._id }, { $unset: { obsidian_source: '' } }),
		Memory.updateMany({ host_id: hostId, 'obsidian_source.connection_id': connection._id }, { $unset: { obsidian_source: '' } }),
		ObsidianChange.deleteMany({ connection: connection._id, host_id: hostId }),
		ObsidianManifestBatch.deleteMany({ connection: connection._id, host_id: hostId }),
		ObsidianRevision.deleteMany({ connection: connection._id, host_id: hostId }),
		ObsidianFile.deleteMany({ connection: connection._id, host_id: hostId }),
	]);
	await ObsidianConnection.deleteOne({ _id: connection._id, host_id: hostId });
	await removeDocumentsByFilter(hostId, 'vault_files', `connection_id:=\`${connection._id}\``).catch((err) => log.error({ err, connection_id: connection._id }, 'Obsidian Typesense connection cleanup failed'));
	for (const blobId of blobIds) {
		const [fileRef, revisionRef, uploadRef] = await Promise.all([ObsidianFile.exists({ blob: blobId }), ObsidianRevision.exists({ blob: blobId }), ObsidianUpload.exists({ blob: blobId })]);
		if (fileRef || revisionRef || uploadRef) continue;
		const blob = await ObsidianBlob.findOne({ _id: blobId, host_id: hostId }).lean();
		if (blob) await deleteBlob(blob);
	}
	audit.log({ action: 'delete', resource: 'obsidian_connection', resource_id: String(connectionId), host_id: hostId, ...ctx });
	emitToTenant(hostId, 'obsidian:connection-removed', { connection_id: String(connectionId), project_id: String(connection.project) });
	return { removed: true, retained_notes: true };
}

export async function requestSync(hostId, connectionId, ctx = {}) {
	const requestedAt = new Date();
	const connection = await ObsidianConnection.findOneAndUpdate(
		{ _id: connectionId, host_id: hostId, enabled: true },
		{ $set: { sync_requested_at: requestedAt, last_sync_status: 'syncing', last_sync_error: '' } },
		{ returnDocument: 'after' },
	);
	if (!connection) throw new ObsidianSyncError('Enabled Obsidian connection not found', 404, 'connection_not_found');
	audit.log({ action: 'sync', resource: 'obsidian_connection', resource_id: String(connectionId), host_id: hostId, ...ctx });
	emitToTenant(hostId, 'obsidian:sync-requested', { connection_id: String(connectionId), requested_at: requestedAt });
	return publicConnection(connection);
}

export async function reconcileManifest(userId, hostId, connectionId, data) {
	const connection = await connectionForWrite(hostId, connectionId);
	let manifestId = '';
	if (data.manifest_id) {
		manifestId = String(data.manifest_id).trim();
		if (!/^[a-zA-Z0-9_-]{8,100}$/.test(manifestId)) throw new ObsidianSyncError('Invalid manifest_id', 400, 'invalid_manifest_id');
		const batchIndex = Number(data.batch_index);
		if (data.complete !== true) {
			const batchFiles = Array.isArray(data.files) ? data.files : [];
			if (!Number.isSafeInteger(batchIndex) || batchIndex < 0 || batchIndex >= OBSIDIAN_MAX_MANIFEST_BATCHES) throw new ObsidianSyncError(`batch_index must be between 0 and ${OBSIDIAN_MAX_MANIFEST_BATCHES - 1}`, 400, 'invalid_batch_index');
			if (batchFiles.length > OBSIDIAN_MANIFEST_BATCH_SIZE) throw new ObsidianSyncError(`Manifest batches may contain at most ${OBSIDIAN_MANIFEST_BATCH_SIZE} files`, 413, 'manifest_batch_too_large');
			await ObsidianManifestBatch.updateOne(
				{ host_id: hostId, user: userId, connection: connection._id, manifest_id: manifestId, batch_index: batchIndex },
				{ $set: { files: batchFiles, expires_at: new Date(Date.now() + OBSIDIAN_MANIFEST_EXPIRY_MS) } },
				{ upsert: true, runValidators: true },
			);
			return { manifest_id: manifestId, batch_index: batchIndex, received: batchFiles.length, complete: false };
		}
		const batchCount = Number(data.batch_count);
		if (!Number.isSafeInteger(batchCount) || batchCount < 0 || batchCount > OBSIDIAN_MAX_MANIFEST_BATCHES) throw new ObsidianSyncError(`batch_count must be between 0 and ${OBSIDIAN_MAX_MANIFEST_BATCHES}`, 400, 'invalid_batch_count');
		const batches = await ObsidianManifestBatch.find({ host_id: hostId, user: userId, connection: connection._id, manifest_id: manifestId }).sort({ batch_index: 1 }).read('primary').lean();
		if (batches.length !== batchCount || batches.some((batch, index) => batch.batch_index !== index)) throw new ObsidianSyncError('Manifest batches are incomplete', 409, 'manifest_incomplete');
		data = { ...data, files: batches.flatMap((batch) => batch.files || []) };
	}
	let previewExports = [];
	if (data.preview === true) {
		const [notes, memories] = await pendingProjectItems(connection);
		previewExports = [
			...notes.map((note) => ({ action: 'download', path: `${connection.streamient_folder}/${safeFileName(note.title)}.md`, preview: true })),
			...memories.map((memory) => ({ action: 'download', path: `${connection.streamient_folder}/Memories/${safeFileName(memory.title)}.md`, preview: true })),
		];
	} else {
		const locked = await acquireManifestLock(connection._id);
		if (!locked) throw new ObsidianSyncError('A vault manifest is already being reconciled', 409, 'sync_in_progress');
		try {
			await ensureProjectExports(connection);
		} finally {
			await releaseManifestLock(connection._id);
		}
	}
	const entries = Array.isArray(data.files) ? data.files : [];
	const localPaths = new Set();
	const actions = [];
	for (const entry of entries) {
		const filePath = normalizeVaultPath(entry.path);
		if (isExcludedVaultPath(filePath)) {
			actions.push({ action: 'ignore', path: filePath, reason: 'excluded' });
			continue;
		}
		localPaths.add(filePath);
		const remote = await ObsidianFile.findOne({ connection: connection._id, host_id: hostId, path: filePath }).read('primary').lean();
		if (!remote) {
			actions.push({ action: 'upload', path: filePath, base_revision: 0 });
			continue;
		}
		if (remote.sha256 === String(entry.sha256 || '').toLowerCase() && remote.in_trash === Boolean(entry.in_trash)) {
			actions.push({ action: 'noop', ...publicFile(remote) });
			continue;
		}
		const localModifiedAt = normalizedModifiedAt(entry.modified_at);
		const action = localModifiedAt.getTime() > new Date(remote.modified_at).getTime() ? 'upload' : remote.in_trash ? 'trash' : 'download';
		actions.push({ action, ...publicFile(remote), base_revision: remote.revision });
	}
	const remoteOnly = await ObsidianFile.find({ connection: connection._id, host_id: hostId, path: { $nin: [...localPaths] } }).read('primary').lean();
	for (const file of remoteOnly) actions.push({ action: file.in_trash ? 'noop' : 'download', ...publicFile(file), base_revision: file.revision });
	if (data.device_id) await registerDevice(hostId, connection._id, data);
	if (data.preview !== true) {
		connection.last_synced_at = new Date();
		connection.last_sync_status = 'success';
		connection.last_sync_error = '';
		connection.sync_requested_at = null;
		await ObsidianConnection.updateOne({ _id: connection._id, host_id: hostId }, { $set: { last_synced_at: connection.last_synced_at, last_sync_status: 'success', last_sync_error: '', sync_requested_at: null } });
	}
	const result = { connection: publicConnection(connection), actions: [...actions, ...previewExports], cursor: connection.sequence || 0, manifest_id: manifestId || undefined, complete: true };
	if (manifestId) await ObsidianManifestBatch.deleteMany({ host_id: hostId, user: userId, connection: connection._id, manifest_id: manifestId });
	return result;
}

export async function applyMutations(userId, hostId, connectionId, data) {
	const connection = await connectionForWrite(hostId, connectionId);
	const mutations = Array.isArray(data.mutations) ? data.mutations : [];
	if (!mutations.length || mutations.length > 100) throw new ObsidianSyncError('Provide 1 to 100 mutations', 400, 'invalid_mutation_count');
	const results = [];
	for (const mutation of mutations) results.push(await applyMutation(connection, userId, mutation));
	if (data.device_id) await registerDevice(hostId, connection._id, data);
	return { results, cursor: connection.sequence || 0 };
}

export async function getChanges(hostId, connectionId, options = {}) {
	const connection = await ObsidianConnection.findOne({ _id: connectionId, host_id: hostId }).lean();
	if (!connection) throw new ObsidianSyncError('Obsidian connection not found', 404, 'connection_not_found');
	const after = Math.max(0, Number(options.after) || 0);
	const limit = Math.min(OBSIDIAN_CHANGE_PAGE_SIZE, Math.max(1, Number(options.limit) || OBSIDIAN_CHANGE_PAGE_SIZE));
	const changes = await ObsidianChange.find({ connection: connection._id, host_id: hostId, sequence: { $gt: after } }).sort({ sequence: 1 }).limit(limit).lean();
	const cursor = changes.at(-1)?.sequence || after;
	if (options.device_id) {
		await ObsidianConnection.updateOne(
			{ _id: connection._id, host_id: hostId, 'devices.device_id': options.device_id },
			{ $set: { 'devices.$.last_cursor': cursor, 'devices.$.last_seen_at': new Date() } },
		);
	}
	return { changes: changes.map(publicChange), cursor, has_more: changes.length === limit, sync_requested_at: connection.sync_requested_at };
}

export async function listConflicts(hostId, connectionId, limit = 100) {
	const connection = await ObsidianConnection.findOne({ _id: connectionId, host_id: hostId }).select('_id').lean();
	if (!connection) throw new ObsidianSyncError('Obsidian connection not found', 404, 'connection_not_found');
	const safeLimit = Math.min(250, Math.max(1, Number(limit) || 100));
	const changes = await ObsidianChange.find({ connection: connection._id, host_id: hostId, conflict: true }).sort({ sequence: -1 }).limit(safeLimit).lean();
	return changes.map(publicChange);
}

export async function getFile(hostId, fileId) {
	const file = await ObsidianFile.findOne({ _id: fileId, host_id: hostId }).lean();
	if (!file) throw new ObsidianSyncError('Synchronized file not found', 404, 'file_not_found');
	return file;
}

export async function getRevision(hostId, revisionId) {
	const revision = await ObsidianRevision.findOne({ _id: revisionId, host_id: hostId, expires_at: { $gt: new Date() } }).lean();
	if (!revision || !revision.blob) throw new ObsidianSyncError('Conflict revision not found or expired', 404, 'revision_not_found');
	return revision;
}

export async function getMarkdownContent(hostId, fileId) {
	const file = await getFile(hostId, fileId);
	if (file.kind !== 'markdown' || !file.blob) throw new ObsidianSyncError('Markdown content not found', 404, 'content_not_found');
	return (await readBlobBuffer(file.blob, hostId)).toString('utf8');
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function resolveVaultPaths(hostId, connectionId, values) {
	const paths = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').split('|')[0].split('#')[0].trim()).filter(Boolean))].slice(0, 100);
	const results = [];
	for (const value of paths) {
		let normalized;
		try {
			normalized = normalizeVaultPath(value);
		} catch {
			continue;
		}
		const candidates = [normalized, ...(path.posix.extname(normalized) ? [] : [`${normalized}.md`])];
		let file = await ObsidianFile.findOne({ connection: connectionId, host_id: hostId, in_trash: false, path: { $in: candidates } }).lean();
		if (!file && !normalized.includes('/')) {
			const suffix = path.posix.extname(normalized) ? normalized : `${normalized}.md`;
			file = await ObsidianFile.findOne({ connection: connectionId, host_id: hostId, in_trash: false, path: { $regex: `(?:^|/)${escapeRegExp(suffix)}$`, $options: 'i' } }).lean();
		}
		if (!file) continue;
		results.push({ input: value, file_id: String(file._id), path: file.path, mime_type: file.mime_type, note_id: file.note ? String(file.note) : null, memory_id: file.memory ? String(file.memory) : null, download_url: `/api/v1/obsidian/files/${file._id}/content` });
	}
	return results;
}

export async function syncStreamientItem(type, itemId, hostId, options = {}) {
	if (!config.obsidian.enabled) return null;
	const Model = type === 'memory' ? Memory : Note;
	const item = await queryForSave(Model.findOne({ _id: itemId, host_id: hostId }));
	if (!item) return null;
	const connection = await queryForSave(ObsidianConnection.findOne({ project: item.project, host_id: hostId, enabled: true }));
	if (!connection) return null;
	let file = item.obsidian_source?.file_id ? await queryForSave(ObsidianFile.findOne({ _id: item.obsidian_source.file_id, connection: connection._id, host_id: hostId })) : null;
	if (!file) return exportProjectItem(connection, type, item);
	if (item.in_trash) {
		const changeTime = item.trashed_at || new Date();
		await commitFile(connection, file, 'trash', {
			modifiedAt: changeTime,
			source: 'streamient',
			operationId: `streamient:${type}:${item._id}:trash:${file.revision + 1}`,
		});
		return file;
	}
	let existingRaw = '';
	if (!options.markdown && file.blob) existingRaw = await getMarkdownContent(hostId, file._id);
	const raw = options.markdown || itemMarkdown(type, item, existingRaw);
	const blob = await storeBuffer(hostId, Buffer.from(raw), 'text/markdown');
	const changeTime = options.markdown ? new Date() : item.updatedAt || new Date();
	await commitFile(connection, file, file.in_trash ? 'restore' : 'update', {
		blob,
		modifiedAt: changeTime,
		source: 'streamient',
		operationId: `streamient:${type}:${item._id}:update:${file.revision + 1}`,
	});
	return file;
}

export async function cleanupObsidianRetention(now = new Date()) {
	const cutoff = new Date(now.getTime() - OBSIDIAN_REVISION_RETENTION_MS);
	const trashed = await queryForSave(ObsidianFile.find({ in_trash: true, trashed_at: { $lte: cutoff }, blob: { $ne: null } }));
	for (const file of trashed) {
		const size = file.size || 0;
		file.blob = null;
		file.sha256 = '';
		file.size = 0;
		file.text_content = '';
		file.extraction_status = 'not_needed';
		file.extraction_error = '';
		file.is_indexed = file.kind === 'markdown';
		await file.save();
		if (size) await ObsidianConnection.updateOne({ _id: file.connection, host_id: file.host_id }, { $inc: { storage_bytes: -size } });
	}
	await ObsidianRevision.deleteMany({ expires_at: { $lte: now } });
	const blobs = await ObsidianBlob.find({ createdAt: { $lte: cutoff } }).lean();
	let deletedBlobs = 0;
	for (const blob of blobs) {
		const [fileRef, revisionRef, uploadRef] = await Promise.all([
			ObsidianFile.exists({ blob: blob._id }),
			ObsidianRevision.exists({ blob: blob._id }),
			ObsidianUpload.exists({ blob: blob._id, state: 'complete' }),
		]);
		if (!fileRef && !revisionRef && !uploadRef) {
			await deleteBlob(blob);
			deletedBlobs++;
		}
	}
	return { purged_files: trashed.length, deleted_blobs: deletedBlobs };
}

export async function processObsidianExtraction(fileId, hostId) {
	const file = await queryForSave(ObsidianFile.findOne({ _id: fileId, host_id: hostId, in_trash: false }));
	if (!file || !file.blob || !['canvas', 'base', 'document'].includes(file.kind)) return null;
	file.extraction_status = 'processing';
	file.extraction_error = '';
	await file.save();
	try {
		const blob = await ObsidianBlob.findOne({ _id: file.blob, host_id }).lean();
		if (!blob) throw new Error('Synchronized blob not found');
		file.text_content = await extractFileText(file, blob);
		file.extraction_status = 'complete';
		file.extraction_error = '';
		file.is_indexed = false;
		await file.save();
		return file;
	} catch (err) {
		file.extraction_status = 'failed';
		file.extraction_error = String(err?.message || err).slice(0, 1000);
		file.is_indexed = false;
		await file.save();
		throw err;
	}
}

export function createObsidianExtractionWorker() {
	return new MongoWorker({ queue: OBSIDIAN_EXTRACTION_QUEUE, concurrency: 1, stalledThresholdMs: 60 * 60 * 1000, handlerTimeoutMs: 60 * 60 * 1000, handler: async (job) => processObsidianExtraction(job.data.file_id, job.data.host_id) });
}

export async function deleteObsidianHostDirectory(hostId) {
	const { rm } = await import('node:fs/promises');
	for (const area of ['blobs', 'uploads', 'server', 'extract']) await rm(path.resolve(config.obsidian.vaultsDir, area, String(hostId)), { recursive: true, force: true });
}

export const __test = { normalizedModifiedAt, parsedMarkdown, itemMarkdown, renderCanonicalMarkdown, canvasText, conflictPath, publicFile, publicChange, applyMutation };
