import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import config from '../config.js';
import { getApiResourceUrl, OBSIDIAN_ALL_SCOPES, OBSIDIAN_CLIENT_ID, OBSIDIAN_REDIRECT_URI } from '../modules/oauth.js';
import { toTypesenseDocs } from '../modules/typesense.js';
import { ObsidianBlob } from '../model/obsidian_blob.js';
import { ObsidianChange } from '../model/obsidian_change.js';
import { ObsidianConnection } from '../model/obsidian_connection.js';
import { ObsidianFile } from '../model/obsidian_file.js';
import { ObsidianRevision } from '../model/obsidian_revision.js';
import { AuditLog } from '../model/audit_log.js';
import { readBlob, storeBuffer } from '../services/obsidian_blob_service.js';
import { normalizeVaultPath, isExcludedVaultPath, vaultFileKind, __test as syncTest } from '../services/obsidian_sync_service.js';
import { validateAuthorizationRequest } from '../services/oauth_service.js';

test('validates Obsidian vault paths and content kinds', () => {
	assert.equal(normalizeVaultPath('Notes\\Today.md'), 'Notes/Today.md');
	assert.equal(isExcludedVaultPath('.obsidian/plugins/x/data.json'), true);
	assert.equal(isExcludedVaultPath('Notes/.private/secret.md'), true);
	assert.equal(isExcludedVaultPath('Notes/Today.md'), false);
	assert.equal(vaultFileKind('Boards/Plan.canvas'), 'canvas');
	assert.equal(vaultFileKind('Files/Plan.pdf'), 'document');
	assert.throws(() => normalizeVaultPath('../../outside.md'));
});

test('keeps canonical Markdown and custom frontmatter intact', () => {
	const raw = '---\ntitle: Old\ntags: [one]\ncustom: keep\nstreamient_type: memory\n---\n\n![[Diagram.png]]\n> [!NOTE]\n> Keep this\n';
	const parsed = syncTest.parsedMarkdown(raw, 'Folder/Fallback.md');
	assert.equal(parsed.type, 'memory');
	assert.equal(parsed.frontmatter.custom, 'keep');
	assert.match(parsed.body, /!\[\[Diagram\.png\]\]/);

	const updated = syncTest.itemMarkdown('note', { title: 'New', tags: ['two'], content: '<p>ignored</p>' }, raw);
	assert.match(updated, /custom: keep/);
	assert.match(updated, /title: New/);
	assert.match(updated, /!\[\[Diagram\.png\]\]/);
	assert.match(updated, /> \[!NOTE\]/);
});

test('sanitizes rendered canonical Markdown without changing stored source', () => {
	const html = syncTest.renderCanonicalMarkdown('[safe](/notes) <img src="/x.png" onerror="alert(1)"><script>alert(1)</script>');
	assert.match(html, /href="\/notes"/);
	assert.match(html, /src="\/x\.png"/);
	assert.doesNotMatch(html, /onerror|script|alert/);
});

test('clamps untrusted device clocks for newest-wins arbitration', () => {
	const now = new Date('2026-08-27T12:00:00.000Z');
	assert.equal(syncTest.normalizedModifiedAt('2030-01-01T00:00:00.000Z', now).toISOString(), now.toISOString());
	assert.equal(syncTest.normalizedModifiedAt('2026-08-27T12:03:00.000Z', now).toISOString(), '2026-08-27T12:03:00.000Z');
});

test('authorizes only the first-party Obsidian callback and vault scopes', async () => {
	const request = {
		client_id: OBSIDIAN_CLIENT_ID,
		redirect_uri: OBSIDIAN_REDIRECT_URI,
		response_type: 'code',
		scope: OBSIDIAN_ALL_SCOPES.join(' '),
		state: 'state',
		code_challenge: 'challenge',
		code_challenge_method: 'S256',
		resource: getApiResourceUrl(),
	};
	const result = await validateAuthorizationRequest(request, { host_id: 'host-1' });
	assert.equal(result.client.client_id, OBSIDIAN_CLIENT_ID);
	assert.deepEqual(result.scopes, OBSIDIAN_ALL_SCOPES.slice().sort());
	await assert.rejects(() => validateAuthorizationRequest({ ...request, redirect_uri: 'obsidian://other-action' }, { host_id: 'host-1' }));
	await assert.rejects(() => validateAuthorizationRequest({ ...request, scope: 'knowledge:read' }, { host_id: 'host-1' }));
});

test('accepts Obsidian sync audit events', () => {
	assert.ok(AuditLog.schema.path('action').enumValues.includes('sync'));
	assert.ok(AuditLog.schema.path('resource').enumValues.includes('obsidian_connection'));
	assert.ok(AuditLog.schema.path('channel').enumValues.includes('obsidian'));
});

test('encrypts stored vault bytes and decrypts them for authorized reads', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streamient-obsidian-'));
	const previous = { dir: config.obsidian.vaultsDir, key: config.obsidian.encryptionKey };
	const originalFindOne = ObsidianBlob.findOne;
	const originalCreate = ObsidianBlob.create;
	config.obsidian.vaultsDir = root;
	config.obsidian.encryptionKey = 'a'.repeat(64);
	ObsidianBlob.findOne = async () => null;
	ObsidianBlob.create = async (data) => ({ _id: 'blob-1', ...data });
	t.after(() => {
		config.obsidian.vaultsDir = previous.dir;
		config.obsidian.encryptionKey = previous.key;
		ObsidianBlob.findOne = originalFindOne;
		ObsidianBlob.create = originalCreate;
		fs.rmSync(root, { recursive: true, force: true });
	});

	const plain = Buffer.from('canonical [[Obsidian]] markdown');
	const blob = await storeBuffer('host-1', plain, 'text/markdown');
	const encrypted = fs.readFileSync(path.join(root, blob.storage_key, blob.chunks[0].file_name));
	assert.equal(encrypted.includes(plain), false);
	const chunks = [];
	for await (const chunk of readBlob(blob, 'host-1')) chunks.push(chunk);
	assert.equal(Buffer.concat(chunks).toString('utf8'), plain.toString('utf8'));
});

test('maps non-Markdown vault content into the dedicated search collection shape', () => {
	const docs = toTypesenseDocs('vault_files', {
		_id: 'file-1',
		project: 'project-1',
		connection: 'connection-1',
		path: 'Documents/Architecture.pdf',
		kind: 'document',
		mime_type: 'application/pdf',
		size: 42,
		text_content: 'Architecture decision',
		in_trash: false,
		createdAt: new Date('2026-08-27T00:00:00Z'),
		updatedAt: new Date('2026-08-27T00:00:00Z'),
	});
	assert.equal(docs[0].title, 'Architecture');
	assert.equal(docs[0].path, 'Documents/Architecture.pdf');
	assert.equal(docs[0].connection_id, 'connection-1');
	assert.equal(docs[0].source_id, 'file-1');
});

function mockQuery(value) {
	return {
		lean: async () => value,
		then(resolve, reject) {
			return Promise.resolve(value).then(resolve, reject);
		},
	};
}

test('applies newest-wins conflicts and keeps repeated operations idempotent', async (t) => {
	const originals = {
		changeFindOne: ObsidianChange.findOne,
		changeCreate: ObsidianChange.create,
		connectionFindOneAndUpdate: ObsidianConnection.findOneAndUpdate,
		connectionUpdateOne: ObsidianConnection.updateOne,
		fileFindOne: ObsidianFile.findOne,
		revisionCreate: ObsidianRevision.create,
	};
	const createdChanges = [];
	const connection = { _id: 'connection-1', project: 'project-1', owner: 'user-1', host_id: 'host-1', sequence: 0, storage_bytes: 1 };
	const currentTime = Date.now();
	const file = {
		_id: 'file-1', connection: connection._id, project: connection.project, host_id: connection.host_id, path: 'Files/A.bin', kind: 'other', mime_type: 'application/octet-stream', size: 1,
		sha256: 'a'.repeat(64), blob: null, revision: 2, modified_at: new Date(currentTime), last_source: 'streamient', last_device_id: '', note: null, memory: null, text_content: '', in_trash: false, trashed_at: null, is_indexed: true,
		async save() { return this; },
	};
	ObsidianChange.findOne = (query) => mockQuery(createdChanges.find((change) => change.operation_id === query.operation_id) || null);
	ObsidianChange.create = async (data) => {
		const change = { _id: `change-${createdChanges.length + 1}`, ...data };
		createdChanges.push(change);
		return change;
	};
	ObsidianConnection.findOneAndUpdate = async (_query, update) => ({ ...connection, sequence: connection.sequence += update.$inc.sequence });
	ObsidianConnection.updateOne = async () => ({ modifiedCount: 1 });
	ObsidianFile.findOne = (query) => mockQuery(query._id || query.path === file.path ? file : null);
	ObsidianRevision.create = async (data) => data;
	t.after(() => {
		ObsidianChange.findOne = originals.changeFindOne;
		ObsidianChange.create = originals.changeCreate;
		ObsidianConnection.findOneAndUpdate = originals.connectionFindOneAndUpdate;
		ObsidianConnection.updateOne = originals.connectionUpdateOne;
		ObsidianFile.findOne = originals.fileFindOne;
		ObsidianRevision.create = originals.revisionCreate;
	});

	const older = await syncTest.applyMutation(connection, 'user-1', { operation_id: 'older', operation: 'trash', file_id: file._id, path: file.path, base_revision: 1, modified_at: new Date(currentTime - 60_000), device_id: 'device-1' });
	assert.equal(older.accepted, false);
	assert.equal(older.conflict, true);
	assert.equal(file.in_trash, false);

	const duplicate = await syncTest.applyMutation(connection, 'user-1', { operation_id: 'older', operation: 'trash', file_id: file._id, path: file.path, base_revision: 1, modified_at: new Date(currentTime - 60_000), device_id: 'device-1' });
	assert.equal(duplicate.duplicate, true);
	assert.equal(createdChanges.length, 1);

	const newer = await syncTest.applyMutation(connection, 'user-1', { operation_id: 'newer', operation: 'trash', file_id: file._id, path: file.path, base_revision: 1, modified_at: new Date(currentTime + 60_000), device_id: 'device-2' });
	assert.equal(newer.accepted, true);
	assert.equal(newer.conflict, true);
	assert.equal(file.in_trash, true);
	assert.equal(file.revision, 3);
	assert.equal(createdChanges.length, 2);
});
