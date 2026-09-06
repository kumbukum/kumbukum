import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

function localPath(relativePath) {
	return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

describe('URLs section UI', () => {
	it('applies one rem horizontal padding to every section', () => {
		const source = readFileSync(localPath('views/layout.pug'), 'utf8');

		assert.match(source, /#page-content\.px-3/);
	});

	it('uses a contrast-safe crawl badge in dark mode', () => {
		const source = readFileSync(localPath('public/js/urls.js'), 'utf8');

		assert.match(source, /class="badge text-bg-success mt-1"/);
		assert.doesNotMatch(source, /class="badge bg-success mt-1"/);
	});

	it('reuses the AJAX section from the full-page route', () => {
		const source = readFileSync(localPath('views/urls.pug'), 'utf8');

		assert.match(source, /include ajax\/section\/urls/);
	});
});
