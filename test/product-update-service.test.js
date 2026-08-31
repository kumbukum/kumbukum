import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from '../model/mongoose.js';
import { backfillProductUpdatesSeenAt, getModalProductUpdates, getProductUpdateStatus, listProductUpdates, markProductUpdatesSeen, syncProductUpdates, _private } from '../services/product_update_service.js';
import { runProductUpdateSync } from '../modules/scheduler.js';

function queryResult(result, capture = {}) {
	const query = {
		sort(value) { capture.sort = value; return query; },
		limit(value) { capture.limit = value; return query; },
		select(value) { capture.select = value; return query; },
		lean() { return Promise.resolve(result); },
	};
	return query;
}

test('syncs every Ghost product post and maps #modal safely', async () => {
	let requestedUrl;
	let bulkOperations;
	let staleQuery;
	const productUpdateModel = {
		bulkWrite: async (operations) => { bulkOperations = operations; return { upsertedCount: 2 }; },
		updateMany: async (query) => { staleQuery = query; return { modifiedCount: 1 }; },
	};
	const fetchImpl = async (url) => {
		requestedUrl = url;
		return {
			ok: true,
			json: async () => ({
				posts: [
					{ id: 'ghost-1', title: 'Modal update', slug: 'modal-update', excerpt: '<strong>Safe copy</strong>', feature_image: 'https://cdn.example.com/image.jpg', published_at: '2026-08-30T12:00:00.000Z', tags: [{ name: '#modal', slug: 'hash-modal' }] },
					{ id: 'ghost-2', title: 'Regular update', slug: 'regular-update', custom_excerpt: 'Regular copy', feature_image: 'javascript:alert(1)', published_at: '2026-08-29T12:00:00.000Z', tags: [{ name: 'product', slug: 'product' }] },
				],
				meta: { pagination: { pages: 1 } },
			}),
		};
	};

	const result = await syncProductUpdates({ fetchImpl, productUpdateModel, config: { contentApiKey: 'content-key', ghostBaseUrl: 'https://streamient.com' } });
	assert.equal(requestedUrl.searchParams.get('filter'), 'tag:product');
	assert.equal(requestedUrl.searchParams.get('include'), 'tags');
	assert.equal(bulkOperations.length, 2);
	assert.equal(bulkOperations[0].updateOne.update.$set.show_modal, true);
	assert.equal(bulkOperations[0].updateOne.update.$set.excerpt, 'Safe copy');
	assert.equal(bulkOperations[0].updateOne.update.$set.link, 'https://streamient.com/blog/modal-update/');
	assert.equal(bulkOperations[1].updateOne.update.$set.feature_image, '');
	assert.deepEqual(staleQuery, { active: true, ghost_id: { $nin: ['ghost-1', 'ghost-2'] } });
	assert.deepEqual(result, { enabled: true, fetched: 2, upserted: 2, deactivated: 1 });
});

test('does not change stored updates when Ghost fails', async () => {
	let wrote = false;
	const productUpdateModel = { bulkWrite: async () => { wrote = true; }, updateMany: async () => { wrote = true; } };
	await assert.rejects(syncProductUpdates({ fetchImpl: async () => ({ ok: false, status: 503 }), productUpdateModel, config: { contentApiKey: 'content-key', ghostBaseUrl: 'https://streamient.com' } }), /503/);
	assert.equal(wrote, false);
});

test('follows Ghost pagination before reconciling stored posts', async () => {
	const requestedPages = [];
	let operationCount = 0;
	const fetchImpl = async (url) => {
		const page = Number(url.searchParams.get('page'));
		requestedPages.push(page);
		return { ok: true, json: async () => ({ posts: [{ id: `ghost-${page}`, title: `Update ${page}`, slug: `update-${page}`, excerpt: '', published_at: `2026-08-${31 - page}T12:00:00.000Z`, tags: [{ name: 'product' }] }], meta: { pagination: { pages: 2 } } }) };
	};
	const productUpdateModel = { bulkWrite: async (operations) => { operationCount = operations.length; return {}; }, updateMany: async () => ({}) };
	await syncProductUpdates({ fetchImpl, productUpdateModel, config: { contentApiKey: 'content-key', ghostBaseUrl: 'https://streamient.com' } });
	assert.deepEqual(requestedPages, [1, 2]);
	assert.equal(operationCount, 2);
});

test('returns a stable cursor page using lean queries', async () => {
	const capture = {};
	const updates = Array.from({ length: 8 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), published_at: new Date(2026, 7, 30 - index) }));
	const productUpdateModel = { find: (query) => { capture.query = query; return queryResult(updates, capture); } };
	const page = await listProductUpdates({ productUpdateModel, limit: 7 });
	assert.deepEqual(capture.query, { active: true });
	assert.deepEqual(capture.sort, { published_at: -1, _id: -1 });
	assert.equal(capture.limit, 8);
	assert.equal(page.updates.length, 7);
	assert.ok(_private.decodeCursor(page.next_cursor));
	assert.equal(page.latest_update_id, updates[0]._id.toString());
});

test('counts unseen updates and returns modal posts newer than the user marker', async () => {
	const seenAt = new Date('2026-08-20T00:00:00.000Z');
	const userModel = { findById: () => queryResult({ product_updates_seen_at: seenAt }) };
	const capturedCounts = [];
	const modalUpdates = [{ _id: new mongoose.Types.ObjectId(), published_at: new Date('2026-08-30T00:00:00.000Z') }];
	const throughUpdate = { _id: new mongoose.Types.ObjectId(), published_at: new Date('2026-08-31T00:00:00.000Z') };
	const productUpdateModel = {
		countDocuments: async (query) => { capturedCounts.push(query); return query.show_modal ? 1 : 3; },
		find: () => queryResult(modalUpdates),
		findOne: () => queryResult(throughUpdate),
	};
	assert.deepEqual(await getProductUpdateStatus('user-1', { productUpdateModel, userModel }), { new_count: 3, has_modal: true });
	const modal = await getModalProductUpdates('user-1', { productUpdateModel, userModel });
	assert.equal(capturedCounts[0].published_at.$gt, seenAt);
	assert.equal(capturedCounts[1].show_modal, true);
	assert.equal(modal.updates.length, 1);
	assert.equal(modal.through_update_id, throughUpdate._id.toString());
});

test('marks seen state monotonically and backfills only missing users', async () => {
	const updateId = new mongoose.Types.ObjectId();
	const publishedAt = new Date('2026-08-31T00:00:00.000Z');
	let userWrite;
	const productUpdateModel = { findOne: () => queryResult({ _id: updateId, published_at: publishedAt }) };
	const userModel = {
		updateOne: async (query, update) => { userWrite = { query, update }; },
		updateMany: async (query, update, options) => { userWrite = { query, update, options }; return { modifiedCount: 4 }; },
	};
	await markProductUpdatesSeen('user-1', updateId.toString(), { productUpdateModel, userModel });
	assert.deepEqual(userWrite, { query: { _id: 'user-1' }, update: { $max: { product_updates_seen_at: publishedAt } } });
	const now = new Date('2026-08-31T12:00:00.000Z');
	assert.deepEqual(await backfillProductUpdatesSeenAt({ userModel, now }), { migrated: 4 });
	assert.deepEqual(userWrite.query, { $or: [{ product_updates_seen_at: { $exists: false } }, { product_updates_seen_at: null }] });
	assert.deepEqual(userWrite.update, { $set: { product_updates_seen_at: now } });
	assert.deepEqual(userWrite.options, { timestamps: false });
});

test('scheduler sync delegates once and reports disabled configuration', async () => {
	let calls = 0;
	const result = await runProductUpdateSync(async () => { calls += 1; return { enabled: false, fetched: 0, upserted: 0, deactivated: 0 }; });
	assert.equal(calls, 1);
	assert.deepEqual(result, { enabled: false, fetched: 0, upserted: 0, deactivated: 0 });
});
