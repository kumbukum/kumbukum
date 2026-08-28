import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pug from 'pug';

function icon(name, classes = '') {
	return `<span class="st-icon ${classes}">${name}</span>`;
}

const renderProjectSettings = pug.compileFile(fileURLToPath(new URL('../views/ajax/project_settings.pug', import.meta.url)));

function settingsHtml(overrides = {}) {
	return renderProjectSettings({
		project: { _id: 'project-1', name: 'Project', color: '#6655ff', email_filter: '' },
		gitRepos: [],
		gitSyncEnabled: true,
		obsidianSyncAccessEnabled: true,
		obsidianSyncConfigured: true,
		obsidianConnections: [],
		emailFeatureEnabled: true,
		emailForwardDomain: '',
		is_hosted: true,
		icon,
		...overrides,
	});
}

test('renders project Obsidian status and controls', () => {
	const html = settingsHtml({
		obsidianConnections: [{ id: 'connection-1', name: 'Work vault', streamient_folder: 'Streamient', enabled: true, devices: [{ device_id: 'device-1' }], storage_bytes: 42, conflict_count: 1, last_sync_status: 'success', last_synced_at: new Date() }],
	});
	assert.match(html, /data-project-settings-tab="obsidian"/);
	assert.match(html, /data-obsidian-connection-id="connection-1"/);
	assert.match(html, /Work vault/);
	assert.match(html, /1 device · 42 bytes · 1 conflicts/);
	assert.match(html, /data-obsidian-request-sync/);
	assert.match(html, /data-obsidian-remove/);
	assert.match(html, /data-obsidian-conflicts/);
});

test('matches Git Sync plan access while separating Obsidian server readiness', () => {
	const locked = settingsHtml({ obsidianSyncAccessEnabled: false, obsidianSyncConfigured: true });
	assert.match(locked, /Obsidian Sync \(Pro\)/);
	assert.match(locked, /Upgrade to Pro/);
	assert.doesNotMatch(locked, /temporarily unavailable|OBSIDIAN_SYNC_ENABLED=true/);

	const hostedUnavailable = settingsHtml({ obsidianSyncAccessEnabled: true, obsidianSyncConfigured: false });
	assert.match(hostedUnavailable, /temporarily unavailable/);
	assert.doesNotMatch(hostedUnavailable, /Obsidian Sync \(Pro\)|Upgrade to Pro|OBSIDIAN_VAULT_ENCRYPTION_KEY/);

	const selfHostedUnconfigured = settingsHtml({ obsidianSyncAccessEnabled: true, obsidianSyncConfigured: false, is_hosted: false });
	assert.match(selfHostedUnconfigured, /Obsidian Sync is not configured/);
	assert.match(selfHostedUnconfigured, /OBSIDIAN_SYNC_ENABLED=true/);
	assert.match(selfHostedUnconfigured, /OBSIDIAN_VAULT_ENCRYPTION_KEY/);
	assert.doesNotMatch(selfHostedUnconfigured, /Obsidian Sync \(Pro\)|Upgrade to Pro/);
});

test('links ready accounts to the Obsidian BRAT beta and setup guide', () => {
	const html = settingsHtml();
	assert.match(html, /https:\/\/github\.com\/streamient\/streamient-obsidian#beta-installation/);
	assert.match(html, /Install beta with BRAT/);
	assert.match(html, /https:\/\/docs\.streamient\.com\/guide\/obsidian-sync/);
	assert.match(html, /plugin runs inside Obsidian/);
	assert.doesNotMatch(html, /Community plugins/);
});

test('updates Obsidian connection controls incrementally without a project settings reload', () => {
	const source = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
	const start = source.indexOf("bodyEl.querySelectorAll('[data-obsidian-connection-id]')");
	const end = source.indexOf('\n\tif (colorInput)', start);
	const behavior = source.slice(start, end);
	assert.ok(start > 0 && end > start);
	assert.match(behavior, /item\.dataset\.obsidianConnectionEnabled/);
	assert.match(behavior, /enabledBadge\.textContent/);
	assert.doesNotMatch(behavior, /loadProjectSettingsBody|refreshProjectSettingsIfOpen|loadProjectOverview|window\.location/);
	assert.match(source, /\['obsidian:file-changed', 'obsidian:sync-requested'\]/);
	assert.match(behavior, /\/conflicts\?limit=100/);
});

test('uses canonical Markdown controls for synchronized Notes and Memories', () => {
	const layout = fs.readFileSync(new URL('../views/layout.pug', import.meta.url), 'utf8');
	const modal = fs.readFileSync(new URL('../public/js/chat.js', import.meta.url), 'utf8');
	assert.match(layout, /textarea\.form-control\.form-control-sm#rm-note-markdown/);
	assert.match(layout, /textarea\.form-control\.form-control-sm#rm-memory-markdown/);
	assert.match(modal, /markdown_content: editorContent\.markdown_content/);
	assert.match(modal, /rmRenderObsidianPreview/);
	assert.match(modal, /rmSanitizePreviewHtml/);
	assert.match(modal, /\/obsidian\/connections\/\$\{rmObsidianConnectionId\}\/resolve/);
});

test('documents the scoped Obsidian API and encrypted resumable uploads', () => {
	const swagger = fs.readFileSync(new URL('../swagger.js', import.meta.url), 'utf8');
	const api = fs.readFileSync(new URL('../routes/obsidian_api.js', import.meta.url), 'utf8');
	assert.match(swagger, /ObsidianOAuth/);
	assert.match(swagger, /'vault:read'/);
	assert.match(swagger, /'vault:write'/);
	assert.match(swagger, /'\/obsidian\/connections\/\{connectionId\}\/mutations'/);
	assert.match(swagger, /application\/offset\+octet-stream/);
	assert.match(swagger, /Remove a connection, encrypted mirror, attachments, and history/);
	assert.match(swagger, /obsidian_sync_configured/);
	assert.match(swagger, /Obsidian encryption is not configured/);
	assert.match(api, /requireOAuthScopes\('vault:read', 'vault:write'\)/);
	assert.match(api, /blobService\.appendUploadChunk/);
});

test('includes Obsidian storage settings in the self-hosted Compose example', () => {
	const source = fs.readFileSync(new URL('../compose.prod.yml', import.meta.url), 'utf8');
	assert.match(source, /OBSIDIAN_SYNC_ENABLED: \$\{OBSIDIAN_SYNC_ENABLED:-false\}/);
	assert.match(source, /OBSIDIAN_VAULTS_DIR: \$\{OBSIDIAN_VAULTS_DIR:-\/opt\/streamient\/assets\/obsidian-vaults\}/);
	assert.match(source, /OBSIDIAN_VAULT_ENCRYPTION_KEY: \$\{OBSIDIAN_VAULT_ENCRYPTION_KEY:-\}/);
	assert.match(source, /OBSIDIAN_SYNC_MAX_FILE_BYTES: \$\{OBSIDIAN_SYNC_MAX_FILE_BYTES:-200000000\}/);
	assert.match(source, /OBSIDIAN_SYNC_MAX_VAULT_BYTES: \$\{OBSIDIAN_SYNC_MAX_VAULT_BYTES:-10000000000\}/);
	assert.match(source, /API_RATE_LIMIT_OBSIDIAN_PER_MINUTE: "\$\{API_RATE_LIMIT_OBSIDIAN_PER_MINUTE:-3000\}"/);
});

test('enables Obsidian Sync with a stable development-only key in local Compose', () => {
	const source = fs.readFileSync(new URL('../compose.yml', import.meta.url), 'utf8');
	assert.match(source, /OBSIDIAN_SYNC_ENABLED: "\$\{OBSIDIAN_SYNC_ENABLED:-true\}"/);
	assert.match(source, /OBSIDIAN_VAULT_ENCRYPTION_KEY: "\$\{OBSIDIAN_VAULT_ENCRYPTION_KEY:-000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\}"/);
	assert.match(source, /API_RATE_LIMIT_OBSIDIAN_PER_MINUTE: "\$\{API_RATE_LIMIT_OBSIDIAN_PER_MINUTE:-3000\}"/);
});
