import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose, { connectDB } from '../db.js';
import { AuditLog } from '../model/audit_log.js';
import { Note } from '../model/note.js';
import { Url } from '../model/url.js';
import { ObsidianConnection } from '../model/obsidian_connection.js';
import { ObsidianFile } from '../model/obsidian_file.js';
import { Project } from '../model/project.js';
import { TenantMember } from '../model/tenant_member.js';
import { User } from '../model/user.js';
import { Tenant } from '../modules/tenancy.js';
import { getApiResourceUrl, OBSIDIAN_ALL_SCOPES, OBSIDIAN_CLIENT_ID, signMcpAccessToken } from '../modules/oauth.js';
import { createConnection, deleteObsidianHostDirectory, getMarkdownContent, reconcileManifest, removeConnection, __test as syncTest } from '../services/obsidian_sync_service.js';
import { updateUrl } from '../services/url_service.js';

const enabled = process.env.RUN_OBSIDIAN_INTEGRATION === '1';

test('reconciles scoped projects from two isolated accounts', { skip: !enabled }, async (t) => {
	await connectDB();
	const suffix = `${Date.now()}-${process.pid}`;
	const accounts = [
		{ name: 'Work', hostId: `obsidian-integration-work-${suffix}`, user: null, tenant: null, project: null, connection: null },
		{ name: 'Personal', hostId: `obsidian-integration-personal-${suffix}`, user: null, tenant: null, project: null, connection: null },
	];
	t.after(async () => {
		for (const account of accounts) {
			if (account.connection) await removeConnection(account.hostId, account.connection.id, { channel: 'obsidian', user_id: account.user?._id }).catch(() => {});
			await Promise.all([
				Note.deleteMany({ host_id: account.hostId }),
				Url.deleteMany({ host_id: account.hostId }),
				Project.deleteMany({ host_id: account.hostId }),
				ObsidianConnection.deleteMany({ host_id: account.hostId }),
				AuditLog.deleteMany({ host_id: account.hostId }),
				TenantMember.deleteMany({ host_id: account.hostId }),
			]);
			if (account.tenant) await Tenant.deleteOne({ _id: account.tenant._id });
			if (account.user) await User.deleteOne({ _id: account.user._id });
			await deleteObsidianHostDirectory(account.hostId);
		}
		await mongoose.disconnect();
	});

	for (const [index, account] of accounts.entries()) {
		account.user = await User.create({ email: `obsidian-${account.name.toLowerCase()}-${suffix}@example.com`, password: 'integration-password', name: `${account.name} user`, is_active: true, is_verified: true });
		account.tenant = await Tenant.create({ host_id: account.hostId, name: `${account.name} account`, owner: account.user._id, plan: 'pro' });
		await User.updateOne({ _id: account.user._id }, { $set: { tenant: account.tenant._id, host_id: account.hostId } });
		await TenantMember.create({ tenant: account.tenant._id, user: account.user._id, host_id: account.hostId, role: 'owner' });
		account.project = await Project.create({ name: account.name, owner: account.user._id, host_id: account.hostId, is_active: true });
		account.connection = await createConnection(account.user._id, account.hostId, { project_id: account.project._id, name: 'Disposable vault', streamient_folder: `Streamient/${account.project.name}`, device_id: `device-${index}`, device_name: 'Integration test', platform: 'desktop' }, { channel: 'obsidian', user_id: account.user._id });
	}

	const endpoint = process.env.OBSIDIAN_API_TEST_URL || 'http://127.0.0.1:3000';
	for (const account of accounts) {
		const token = signMcpAccessToken({ userId: account.user._id, tenantId: account.tenant._id, host_id: account.hostId, clientId: OBSIDIAN_CLIENT_ID, clientName: 'Streamient Sync', scopes: OBSIDIAN_ALL_SCOPES, audience: getApiResourceUrl() });
		const [identityResponse, projectsResponse] = await Promise.all([
			fetch(`${endpoint}/api/v1/obsidian/account`, { headers: { Authorization: `Bearer ${token}` } }),
			fetch(`${endpoint}/api/v1/obsidian/projects`, { headers: { Authorization: `Bearer ${token}` } }),
		]);
		assert.equal(identityResponse.status, 200);
		assert.equal(projectsResponse.status, 200);
		const identity = await identityResponse.json();
		const projects = await projectsResponse.json();
		assert.equal(identity.account.name, `${account.name} account`);
		assert.equal(identity.account.user.email, account.user.email);
		assert.deepEqual(projects.projects.map((project) => project.name), [account.name]);
	}

	await Note.create({ title: 'Remote work note', content: '<p>Remote</p>', text_content: 'Remote', project: accounts[0].project._id, owner: accounts[0].user._id, host_id: accounts[0].hostId });
	await Url.create({ url: 'https://example.com/reference', normalized_url: 'https://example.com/reference', title: 'Remote reference', description: 'Saved description', text_content: 'Crawler-owned page text', tags: ['reference'], crawl_enabled: true, project: accounts[0].project._id, owner: accounts[0].user._id, host_id: accounts[0].hostId });
	const workPreview = await reconcileManifest(accounts[0].user._id, accounts[0].hostId, accounts[0].connection.id, { files: [], preview: true, summary_only: true, scope: { vault_mode: 'off', selected_paths: [], excluded_paths: [] }, device_id: 'device-0', device_name: 'Integration test', platform: 'desktop' });
	assert.equal(workPreview.actions.length, 0);
	assert.equal(workPreview.summary.counts.download, 2);
	assert.ok(workPreview.summary.bytes.download > 0);

	const workResult = await reconcileManifest(accounts[0].user._id, accounts[0].hostId, accounts[0].connection.id, { files: [], preview: false, scope: { vault_mode: 'off', selected_paths: [], excluded_paths: [] }, device_id: 'device-0', device_name: 'Integration test', platform: 'desktop' });
	assert.equal(workResult.actions.length, 2);
	assert.ok(workResult.actions.every((action) => /^Streamient\/Work\//.test(action.path)));
	const urlAction = workResult.actions.find((action) => action.path.includes('/URLs/'));
	assert.ok(urlAction);
	const urlFile = await ObsidianFile.findById(urlAction.id);
	const exportedUrlMarkdown = await getMarkdownContent(accounts[0].hostId, urlFile._id);
	const parsedUrlMarkdown = syncTest.parsedMarkdown(exportedUrlMarkdown, urlFile.path);
	assert.equal(parsedUrlMarkdown.type, 'url');
	assert.equal(parsedUrlMarkdown.url, 'https://example.com/reference');
	assert.doesNotMatch(exportedUrlMarkdown, /Crawler-owned page text/);
	urlFile.modified_at = new Date();
	await syncTest.projectMarkdownFile(urlFile, '---\ntitle: Edited reference\nstreamient_type: url\nurl: https://example.org/edited\ntags: [obsidian]\n---\nEdited description', accounts[0].user._id);
	const editedUrl = await Url.findById(urlFile.url).lean();
	assert.equal(editedUrl.title, 'Edited reference');
	assert.equal(editedUrl.url, 'https://example.org/edited');
	assert.equal(editedUrl.description, 'Edited description');
	assert.deepEqual(editedUrl.tags, ['obsidian']);
	assert.equal(editedUrl.text_content, 'Crawler-owned page text');
	assert.equal(editedUrl.crawl_enabled, true);
	await assert.rejects(() => syncTest.projectMarkdownFile(urlFile, '---\ntitle: Accidental conversion\nstreamient_type: note\n---\nKeep URL data', accounts[0].user._id), /separate file/);
	await updateUrl(accounts[0].hostId, editedUrl._id, { title: 'Server-edited reference', description: 'Server-edited description', tags: ['server'] });
	const serverEditedMarkdown = syncTest.parsedMarkdown(await getMarkdownContent(accounts[0].hostId, urlFile._id), urlFile.path);
	assert.equal(serverEditedMarkdown.title, 'Server-edited reference');
	assert.equal(serverEditedMarkdown.body.trim(), 'Server-edited description');
	assert.deepEqual(serverEditedMarkdown.tags, ['server']);
	const serverEditedUrl = await Url.findById(editedUrl._id).lean();
	assert.equal(serverEditedUrl.text_content, 'Crawler-owned page text');
	assert.equal(serverEditedUrl.crawl_enabled, true);
	const localUrlFile = await ObsidianFile.create({ connection: accounts[0].connection.id, project: accounts[0].project._id, host_id: accounts[0].hostId, path: 'Streamient/Work/URLs/Local reference.md', kind: 'markdown', mime_type: 'text/markdown', size: 0, sha256: '', revision: 1, modified_at: new Date(), last_source: 'obsidian' });
	await syncTest.projectMarkdownFile(localUrlFile, '---\ntitle: Local reference\nstreamient_type: url\nurl: https://local.example/reference\ntags: [local]\n---\nCreated in Obsidian', accounts[0].user._id);
	await localUrlFile.save();
	const locallyCreatedUrl = await Url.findById(localUrlFile.url).lean();
	assert.equal(locallyCreatedUrl.description, 'Created in Obsidian');
	assert.equal(locallyCreatedUrl.text_content, '');
	assert.equal(String(locallyCreatedUrl.obsidian_source.file_id), String(localUrlFile._id));

	const now = new Date().toISOString();
	const personalPreview = await reconcileManifest(accounts[1].user._id, accounts[1].hostId, accounts[1].connection.id, {
		files: [
			{ path: 'Personal/Selected.md', kind: 'markdown', size: 8, sha256: 'a'.repeat(64), modified_at: now, base_revision: 0, in_trash: false },
			{ path: 'Work/Ignored.md', kind: 'markdown', size: 9, sha256: 'b'.repeat(64), modified_at: now, base_revision: 0, in_trash: false },
		],
		preview: true,
		summary_only: true,
		scope: { vault_mode: 'selected', selected_paths: [{ path: 'Personal', kind: 'folder' }], excluded_paths: [{ path: 'Streamient/Work', kind: 'folder' }] },
		device_id: 'device-1',
		device_name: 'Integration test',
		platform: 'desktop',
	});
	assert.equal(personalPreview.summary.counts.upload, 1);
	assert.equal(personalPreview.summary.counts.ignore, 1);
	await assert.rejects(() => reconcileManifest(accounts[1].user._id, accounts[1].hostId, accounts[0].connection.id, { files: [], preview: true, scope: { vault_mode: 'off', selected_paths: [], excluded_paths: [] } }), /connection not found/i);
});
