import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { migrateTrashTtlIndexes, OBSOLETE_TRASH_TTL_INDEX } from '../services/trash_ttl_migration_service.js';

function fakeModel(dropCalls) {
	let indexes = [{ name: '_id_' }, { name: OBSOLETE_TRASH_TTL_INDEX }, { name: 'trashed_at_custom' }];
	return {
		collection: {
			indexes: async () => indexes,
			dropIndex: async (name) => {
				dropCalls.push(name);
				indexes = indexes.filter((index) => index.name !== name);
			},
		},
	};
}

describe('trash TTL migration', () => {
	it('is dry-run by default, drops only trashed_at_1, and is idempotent', async () => {
		const dropCalls = [];
		const models = { notes: fakeModel(dropCalls), emails: fakeModel(dropCalls) };

		const dryRun = await migrateTrashTtlIndexes({ models });
		assert.deepEqual(dryRun.results.map((result) => result.status), ['would_drop', 'would_drop']);
		assert.deepEqual(dropCalls, []);

		const applied = await migrateTrashTtlIndexes({ models, apply: true });
		assert.deepEqual(applied.results.map((result) => result.status), ['dropped', 'dropped']);
		assert.deepEqual(dropCalls, [OBSOLETE_TRASH_TTL_INDEX, OBSOLETE_TRASH_TTL_INDEX]);

		const repeated = await migrateTrashTtlIndexes({ models, apply: true });
		assert.deepEqual(repeated.results.map((result) => result.status), ['missing', 'missing']);
		assert.deepEqual(dropCalls, [OBSOLETE_TRASH_TTL_INDEX, OBSOLETE_TRASH_TTL_INDEX]);
	});

	it('removes TTL declarations from all trash models', () => {
		for (const file of ['note.js', 'memory.js', 'url.js', 'email.js']) {
			const source = fs.readFileSync(new URL(`../model/${file}`, import.meta.url), 'utf8');
			assert.doesNotMatch(source, /expireAfterSeconds:\s*2592000/);
		}
	});
});
