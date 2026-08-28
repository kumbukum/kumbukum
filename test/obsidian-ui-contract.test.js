import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pug from 'pug';

function icon(name, classes = '') {
	return `<span class="st-icon ${classes}">${name}</span>`;
}

test('renders project Obsidian status and controls', () => {
	const render = pug.compileFile(fileURLToPath(new URL('../views/ajax/project_settings.pug', import.meta.url)));
	const html = render({
		project: { _id: 'project-1', name: 'Project', color: '#6655ff', email_filter: '' },
		gitRepos: [],
		gitSyncEnabled: true,
		obsidianSyncEnabled: true,
		obsidianConnections: [{ id: 'connection-1', name: 'Work vault', streamient_folder: 'Streamient', enabled: true, devices: [{ device_id: 'device-1' }], storage_bytes: 42, conflict_count: 1, last_sync_status: 'success', last_synced_at: new Date() }],
		emailFeatureEnabled: true,
		emailForwardDomain: '',
		is_hosted: true,
		icon,
	});
	assert.match(html, /data-project-settings-tab="obsidian"/);
	assert.match(html, /data-obsidian-connection-id="connection-1"/);
	assert.match(html, /Work vault/);
	assert.match(html, /1 device · 42 bytes · 1 conflicts/);
	assert.match(html, /data-obsidian-request-sync/);
	assert.match(html, /data-obsidian-remove/);
	assert.match(html, /data-obsidian-conflicts/);
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
	assert.match(api, /requireOAuthScopes\('vault:read', 'vault:write'\)/);
	assert.match(api, /blobService\.appendUploadChunk/);
});
