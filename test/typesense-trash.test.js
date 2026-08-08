import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCollectionName, exportTrashDocuments, listTrashDocuments } from '../modules/typesense.js';

const TYPES = ['notes', 'memory', 'urls', 'emails'];

describe('Typesense trash queries', () => {
	it('uses one anchor-only multi-search and returns exact source totals', async () => {
		const calls = [];
		const documents = {
			notes: [
				{ id: 'note-1', source_id: 'note-1', chunk_index: 0, in_trash: true, trashed_at: 20 },
				{ id: 'note-1_chunk_1', source_id: 'note-1', chunk_index: 1, in_trash: true, trashed_at: 20 },
			],
			memory: [],
			urls: [{ id: 'url-1', source_id: 'url-1', chunk_index: 0, in_trash: true, trashed_at: 10 }],
			emails: [{ id: 'email-1', source_id: 'email-1', chunk_index: 0, in_trash: true, trashed_at: 30 }],
		};
		const typeByCollection = new Map(TYPES.map((type) => [buildCollectionName(type, 'host-1'), type]));
		const client = {
			multiSearch: {
				perform: async (payload, common) => {
					calls.push({ payload, common });
					return {
						results: payload.searches.map((search) => {
							const type = typeByCollection.get(search.collection);
							const hits = documents[type].filter((doc) => doc.in_trash && doc.chunk_index === 0).map((document) => ({ document }));
							return { found: hits.length, hits };
						}),
					};
				},
			},
		};

		const results = await listTrashDocuments('host-1', TYPES, { perPage: 10 }, { client });

		assert.equal(calls.length, 1);
		assert.equal(calls[0].payload.searches.length, 4);
		assert.deepEqual(calls[0].common, {});
		assert.ok(calls[0].payload.searches.every((search) => search.filter_by === 'in_trash:=true && chunk_index:=0'));
		assert.ok(calls[0].payload.searches.every((search) => !('group_by' in search)));
		assert.ok(calls[0].payload.searches.every((search) => search.sort_by === 'trashed_at:desc'));
		assert.equal(results.notes.found, 1);
		assert.equal(Object.values(results).reduce((sum, result) => sum + result.found, 0), 3);
	});

	it('uses union pagination without expanding the multi-search request', async () => {
		let request;
		let common;
		const client = {
			multiSearch: {
				perform: async (payload, params) => {
					request = payload;
					common = params;
					return { found: 0, hits: [] };
				},
			},
		};

		await listTrashDocuments('host-1', TYPES, { union: true, page: 700, perPage: 50 }, { client });

		assert.equal(request.union, true);
		assert.equal(request.searches.length, 4);
		assert.ok(request.searches.every((search) => !('page' in search) && !('per_page' in search) && !('group_by' in search)));
		assert.deepEqual(common, { page: 700, per_page: 50 });
	});

	it('propagates a partial multi-search failure', async () => {
		const client = {
			multiSearch: {
				perform: async ({ searches }) => ({ results: searches.map((search, index) => index === 2 ? { error: 'collection unavailable', code: 400 } : { found: 0, hits: [] }) }),
			},
		};

		await assert.rejects(() => listTrashDocuments('host-1', TYPES, { perPage: 1 }, { client }), /collection unavailable/);
	});

	it('exports trash chunks as JSON documents for reconciliation', async () => {
		const client = {
			collections: (collection) => ({
				documents: () => ({
					export: async (options) => {
						assert.equal(collection, buildCollectionName('notes', 'host-1'));
						assert.equal(options.filter_by, 'in_trash:=true');
						return '{"source_id":"note-1","chunk_index":0}\n{"source_id":"note-1","chunk_index":1}\n';
					},
				}),
			}),
		};

		const docs = await exportTrashDocuments('host-1', 'notes', { client });
		assert.deepEqual(docs.map((doc) => doc.chunk_index), [0, 1]);
	});
});
