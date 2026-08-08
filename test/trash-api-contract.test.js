import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import swaggerSpec from '../swagger.js';

describe('trash API contract', () => {
	it('propagates count failures and keeps permanent delete idempotent', () => {
		const source = fs.readFileSync(new URL('../routes/api.js', import.meta.url), 'utf8');
		const countRoute = source.slice(source.indexOf("router.get('/trash/count'"), source.indexOf("router.post('/trash/restore'"));
		const deleteRoute = source.slice(source.indexOf("router.delete('/trash/:type/:id'"), source.indexOf("router.post('/trash/batch/restore'"));

		assert.match(countRoute, /res\.status\(503\)/);
		assert.doesNotMatch(countRoute, /count:\s*0/);
		assert.match(deleteRoute, /already_missing/);
		assert.doesNotMatch(deleteRoute, /status\(404\)/);
	});

	it('documents exact counts, stale restore, idempotent delete, and 503 responses', () => {
		assert.match(swaggerSpec.paths['/trash'].get.description, /Exact totals count only chunk_index 0/);
		assert.ok(swaggerSpec.paths['/trash'].get.responses[503]);
		assert.match(swaggerSpec.paths['/trash/count'].get.description, /Exact Typesense anchor-document count/);
		assert.ok(swaggerSpec.paths['/trash/count'].get.responses[503]);
		assert.match(swaggerSpec.paths['/trash/restore'].post.description, /removes the stale Typesense document/);
		assert.match(swaggerSpec.paths['/trash/{type}/{id}'].delete.description, /Idempotent/);
		assert.equal(swaggerSpec.paths['/trash/{type}/{id}'].delete.responses[404], undefined);
	});
});
