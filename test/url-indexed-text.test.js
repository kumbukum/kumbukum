import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { load } from 'cheerio';
import pug from 'pug';

import swaggerSpec from '../swagger.js';
import { buildCollectionName, getIndexedPage, listIndexedPages, mergeIndexedTextChunks } from '../modules/typesense.js';

function localPath(relativePath) {
	return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

function read(relativePath) {
	return readFileSync(localPath(relativePath), 'utf8');
}

function fakeClient(search) {
	return {
		collections(collectionName) {
			return {
				documents() {
					return { search: (params) => search(collectionName, params) };
				},
			};
		},
	};
}

describe('URL indexed text', () => {
	it('reassembles ordered Typesense chunks without duplicated overlap', () => {
		const original = `${'a'.repeat(3000)}tail`;
		const result = mergeIndexedTextChunks([
			{ chunk_index: 1, chunk_count: 2, text_content: original.slice(2800) },
			{ chunk_index: 0, chunk_count: 2, text_content: original.slice(0, 3000) },
		]);

		assert.equal(result.text_content, original);
		assert.equal(result.index_complete, true);
	});

	it('reports incomplete indexes and preserves available non-consecutive text', () => {
		const first = 'a'.repeat(3000);
		const third = 'third indexed chunk';
		const result = mergeIndexedTextChunks([
			{ chunk_index: 0, chunk_count: 3, text_content: first },
			{ chunk_index: 2, chunk_count: 3, text_content: third },
		]);

		assert.equal(result.text_content, `${first}\n\n${third}`);
		assert.equal(result.index_complete, false);
	});

	it('lists only anchor chunks so count and pagination represent unique URLs', async () => {
		let capturedCollection = '';
		let capturedParams = null;
		const client = fakeClient(async (collectionName, params) => {
			capturedCollection = collectionName;
			capturedParams = params;
			return { found: 2, hits: [{ document: { id: 'page-1', source_id: 'page-1' } }] };
		});
		const result = await listIndexedPages('host-1', 'parent-1', { page: 2, perPage: 100 }, { client });

		assert.equal(capturedCollection, buildCollectionName('pages', 'host-1'));
		assert.match(capturedParams.filter_by, /parent_url_id:=`parent-1`/);
		assert.match(capturedParams.filter_by, /chunk_index:=0/);
		assert.equal(capturedParams.page, 2);
		assert.equal(capturedParams.per_page, 100);
		assert.equal(result.found, 2);
	});

	it('preserves the existing 500-row API limit across bounded Typesense pages', async () => {
		const calls = [];
		const client = fakeClient(async (collectionName, params) => {
			calls.push({ collectionName, params });
			return { found: 501, hits: [{ document: { id: 'page-501', source_id: 'page-501' } }] };
		});
		const result = await listIndexedPages('host-1', 'parent-1', { page: 2, perPage: 500 }, { client });

		assert.equal(calls.length, 1);
		assert.equal(calls[0].params.page, 3);
		assert.equal(calls[0].params.per_page, 250);
		assert.equal(result.hits[0].document.source_id, 'page-501');
		assert.equal(result.found, 501);
	});

	it('loads only the requested tenant, parent URL, and page chunks', async () => {
		const original = `${'b'.repeat(3000)}finish`;
		let capturedCollection = '';
		let capturedParams = null;
		const client = fakeClient(async (collectionName, params) => {
			capturedCollection = collectionName;
			capturedParams = params;
			return {
				found: 2,
				hits: [
					{ document: { id: 'page-1_chunk_1', source_id: 'page-1', url: 'https://example.com/docs', title: 'Docs', crawled_at: 10, chunk_index: 1, chunk_count: 2, text_content: original.slice(2800) } },
					{ document: { id: 'page-1', source_id: 'page-1', url: 'https://example.com/docs', title: 'Docs', crawled_at: 10, chunk_index: 0, chunk_count: 2, text_content: original.slice(0, 3000) } },
				],
			};
		});
		const page = await getIndexedPage('host-2', 'parent-2', 'page-1', { client });

		assert.equal(capturedCollection, buildCollectionName('pages', 'host-2'));
		assert.match(capturedParams.filter_by, /parent_url_id:=`parent-2`/);
		assert.match(capturedParams.filter_by, /source_id:=`page-1`/);
		assert.equal(page.id, 'page-1');
		assert.equal(page.text_content, original);
		assert.equal(page.index_complete, true);
	});

	it('returns null for a missing indexed page and propagates search failures', async () => {
		const missingClient = fakeClient(async () => {
			const err = new Error('Not found');
			err.httpStatus = 404;
			throw err;
		});
		assert.equal(await getIndexedPage('host-1', 'parent-1', 'missing', { client: missingClient }), null);

		const failedClient = fakeClient(async () => {
			const err = new Error('Invalid search');
			err.httpStatus = 400;
			throw err;
		});
		await assert.rejects(() => getIndexedPage('host-1', 'parent-1', 'broken', { client: failedClient }), /Invalid search/);
	});

	it('maps missing parents, missing pages, and index failures to API errors', () => {
		const routes = read('routes/api.js');
		const start = routes.indexOf("router.get('/urls/:id/pages/:pageId'");
		const end = routes.indexOf('\nasync function removeUrlPages', start);
		const handler = routes.slice(start, end);

		assert.ok(start > 0 && end > start);
		assert.match(handler, /urlService\.getUrl\(req\.host_id, req\.params\.id\)/);
		assert.match(handler, /status\(404\)\.json\(\{ error: 'URL not found' \}\)/);
		assert.match(handler, /getIndexedPage\(req\.host_id, req\.params\.id, req\.params\.pageId\)/);
		assert.match(handler, /status\(404\)\.json\(\{ error: 'Crawled page not found' \}\)/);
		assert.match(handler, /status\(500\)\.json\(\{ error: 'Failed to load indexed page text' \}\)/);
	});

	it('renders accessible Pug controls for parsed and crawled-page text', () => {
		const templateHtml = pug.renderFile(localPath('views/ajax/url_crawled_page.pug'), {
			icon: (name, classes = '') => `<span data-icon="${name}" class="${classes}"></span>`,
		});
		const $ = load(templateHtml);
		assert.equal($('#rm-url-crawl-item-template').length, 1);
		assert.equal($('.rm-crawl-link[target="_blank"][rel="noopener noreferrer"]').length, 1);
		assert.equal($('.rm-crawl-text-btn[type="button"][aria-expanded="false"]').length, 1);
		assert.equal($('.rm-crawl-text-panel.d-none').length, 1);

		const layout = read('views/layout.pug');
		assert.match(layout, /#rm-url-tab-text\(type="button"\) Parsed text/);
		assert.match(layout, /#rm-url-text-index-status Not indexed/);
		assert.match(layout, /#rm-url-text-content/);
		assert.match(layout, /#rm-url-text-help Streamient uses this extracted text for keyword and semantic search\./);
		assert.match(layout, /#rm-url-pages-help Expanded text is read directly from the search index/);
		assert.match(layout, /include ajax\/url_crawled_page/);
	});

	it('lazy-loads and caches row text without page or section reloads', () => {
		const source = read('public/js/chat.js');
		const behavior = source.slice(source.indexOf('function rmSetUrlParsedText'), source.indexOf('function rmGetUrlPagesMetaText'));
		const creator = source.slice(source.indexOf('function rmCreateUrlCrawlItem'), source.indexOf('function rmSetUrlPagesState'));

		assert.match(behavior, /content\.textContent = text/);
		assert.match(behavior, /rmUrlPageTextCache\.get\(page\.id\)/);
		assert.match(behavior, /rmUrlPageTextCache\.set\(page\.id, indexedPage\)/);
		assert.match(behavior, /\/urls\/\$\{urlId\}\/pages\/\$\{encodeURIComponent\(page\.id\)\}/);
		assert.match(behavior, /rmCollapseUrlCrawlItems\(item\)/);
		assert.match(behavior, /showError\('Could not load indexed text:/);
		assert.match(creator, /template\.content\.firstElementChild\.cloneNode\(true\)/);
		assert.match(creator, /button\.setAttribute\('aria-controls', panelId\)/);
		assert.doesNotMatch(creator, /createElement|innerHTML/);
		assert.doesNotMatch(behavior, /location\.reload|window\.location|navigateTo|loadSection/);
	});

	it('documents the unique-page list and indexed-text endpoint in OpenAPI', () => {
		const urlSchema = swaggerSpec.components.schemas.Url.properties;
		assert.ok(urlSchema.text_content);
		assert.ok(urlSchema.is_indexed);
		assert.ok(swaggerSpec.paths['/urls/{id}/pages']?.get);
		assert.ok(swaggerSpec.paths['/urls/{id}/pages/{pageId}']?.get);
		assert.equal(swaggerSpec.paths['/urls/{id}/pages'].get.parameters[2].schema.maximum, 500);
		assert.ok(swaggerSpec.components.schemas.CrawledPage.properties.index_complete);
	});
});
