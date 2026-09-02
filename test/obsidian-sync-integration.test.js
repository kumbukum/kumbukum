import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose, { connectDB } from '../db.js';
import { AuditLog } from '../model/audit_log.js';
import { Note } from '../model/note.js';
import { ObsidianConnection } from '../model/obsidian_connection.js';
import { Project } from '../model/project.js';
import { TenantMember } from '../model/tenant_member.js';
import { User } from '../model/user.js';
import { Tenant } from '../modules/tenancy.js';
import { getApiResourceUrl, OBSIDIAN_ALL_SCOPES, OBSIDIAN_CLIENT_ID, signMcpAccessToken } from '../modules/oauth.js';
import { createConnection, deleteObsidianHostDirectory, reconcileManifest, removeConnection } from '../services/obsidian_sync_service.js';

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
	const workPreview = await reconcileManifest(accounts[0].user._id, accounts[0].hostId, accounts[0].connection.id, { files: [], preview: true, summary_only: true, scope: { vault_mode: 'off', selected_paths: [], excluded_paths: [] }, device_id: 'device-0', device_name: 'Integration test', platform: 'desktop' });
	assert.equal(workPreview.actions.length, 0);
	assert.equal(workPreview.summary.counts.download, 1);
	assert.ok(workPreview.summary.bytes.download > 0);

	const workResult = await reconcileManifest(accounts[0].user._id, accounts[0].hostId, accounts[0].connection.id, { files: [], preview: false, scope: { vault_mode: 'off', selected_paths: [], excluded_paths: [] }, device_id: 'device-0', device_name: 'Integration test', platform: 'desktop' });
	assert.equal(workResult.actions.length, 1);
	assert.match(workResult.actions[0].path, /^Streamient\/Work\//);

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
