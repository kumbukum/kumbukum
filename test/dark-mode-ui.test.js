import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(relativePath) {
	return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

function luminance(hex) {
	const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
	return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrast(first, second) {
	const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
	return (values[0] + 0.05) / (values[1] + 0.05);
}

function cssVariable(block, name) {
	return block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
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

	it('keeps every chat result type badge readable in light and dark themes', () => {
		const tokens = read('public/css/streamient-tabler.css');
		const styles = read('public/css/app.css');
		const root = tokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || '';
		const dark = tokens.match(/\[data-bs-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
		assert.match(styles, /\.st-result-type-badge \{[\s\S]*color: var\(--st-result-emails-text\) !important/);
		for (const block of [root, dark]) {
			for (const type of ['notes', 'memory', 'urls', 'emails', 'pages']) {
				const background = cssVariable(block, `--st-result-${type}-bg`);
				const text = cssVariable(block, `--st-result-${type}-text`);
				assert.ok(background && text, `${type} badge tokens should exist`);
				assert.ok(contrast(background, text) >= 4.5, `${type} badge contrast should meet WCAG AA`);
			}
		}
	});
});
