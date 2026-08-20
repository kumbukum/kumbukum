import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import mongoose from '../model/mongoose.js';
import { MongoWorker, STATUS } from '../modules/mongo_queue.js';

describe('Mongo queue retry delay', () => {
	let originalDb;

	beforeEach(() => {
		originalDb = mongoose.connection.db;
	});

	afterEach(() => {
		mongoose.connection.db = originalDb;
	});

	function installCollection(attempts, maxAttempts, updates) {
		const claimed = { _id: 'job-1', queue: 'retry-test', status: STATUS.PROCESSING, data: {}, attempts, max_attempts: maxAttempts };
		mongoose.connection.db = {
			collection: () => ({
				findOneAndUpdate: async () => claimed,
				updateOne: async (query, update) => {
					updates.push({ query, update });
					return { modifiedCount: 1 };
				},
			}),
		};
		return claimed;
	}

	it('reschedules retryable jobs after the configured delay', async () => {
		const updates = [];
		const claimed = installCollection(1, 3, updates);
		const worker = new MongoWorker({ queue: 'retry-test', appInstance: 'test', retryDelayMs: 90000, handler: async () => { throw new Error('temporary failure'); } });
		const startedAt = Date.now();

		await assert.rejects(worker.processJob(claimed), /temporary failure/);

		assert.equal(updates[0].update.$set.status, STATUS.PENDING);
		assert.ok(updates[0].update.$set.scheduled_at.getTime() >= startedAt + 90000);
		assert.ok(updates[0].update.$set.scheduled_at.getTime() <= Date.now() + 90000);
	});

	it('retains exhausted jobs as failed without another schedule', async () => {
		const updates = [];
		const claimed = installCollection(3, 3, updates);
		const worker = new MongoWorker({ queue: 'retry-test', appInstance: 'test', retryDelayMs: 90000, handler: async () => { throw new Error('final failure'); } });

		await assert.rejects(worker.processJob(claimed), /final failure/);

		assert.equal(updates[0].update.$set.status, STATUS.FAILED);
		assert.equal(updates[0].update.$set.scheduled_at, undefined);
	});
});

