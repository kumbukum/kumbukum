import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
	return fs.readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('trash operational wiring', () => {
	it('schedules nightly retention and guarded active-tenant reconciliation', () => {
		const source = read('../modules/scheduler.js');
		assert.match(source, /new Cron\('30 2 \* \* \*'/);
		assert.match(source, /runTrashRetentionCleanup\(\)/);
		assert.match(source, /new Cron\('10 3 \* \* \*'/);
		assert.match(source, /trashReconciliationRunning/);
		assert.match(source, /previous run active/);
		assert.match(source, /SCHEDULER_TRASH_RECONCILIATION_ENABLED !== 'true'/);
		assert.match(source, /reconcileActiveTrashTenants\(\{ dryRun: false \}\)/);
	});

	it('keeps both operational CLIs dry-run by default with explicit apply gates', () => {
		const reconciliation = read('../scripts/reconcile-trash.mjs');
		const migration = read('../scripts/migrate-trash-ttl-indexes.mjs');
		assert.match(reconciliation, /dryRun: !apply/);
		assert.match(reconciliation, /--confirm-typesense-healthy/);
		assert.match(migration, /migrateTrashTtlIndexes\(\{ apply \}\)/);
		assert.match(migration, /--confirm-all-replicas-upgraded/);
	});
});
