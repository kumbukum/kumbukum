import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(relativePath) {
	return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

describe('dark mode UI', () => {
	it('keeps the item detail modal open until an explicit close action', () => {
		const layout = read('views/layout.pug');
		assert.match(layout, /#chat-result-modal[^\n]*data-bs-backdrop="static"[^\n]*data-bs-keyboard="false"/);
		assert.match(layout, /button\.btn-close\(type="button" data-bs-dismiss="modal"/);
		assert.match(layout, /button\.btn\.btn-secondary\.btn-sm\(type="button" data-bs-dismiss="modal"\) Close/);
	});

	it('uses dark surfaces for checkboxes, labels, detail search, and its dropdown', () => {
		const css = read('public/css/app.css');
		assert.match(css, /\[data-bs-theme="dark"\] body\.st-template1 \.form-check-input:not\(:checked\)/);
		assert.match(css, /\[data-bs-theme="dark"\] body\.st-template1 \.tag-badge/);
		assert.match(css, /\.source-search-wrap input \{[\s\S]*background: var\(--st-panel-subtle\)/);
		assert.match(css, /\.source-dropdown \{[\s\S]*background: var\(--st-panel\)/);
		assert.match(css, /\.source-dropdown \.badge\.bg-light \{[\s\S]*background: var\(--st-panel-muted\) !important/);
	});
});
