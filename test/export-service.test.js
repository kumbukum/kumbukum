import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Export } from '../model/export.js';
import { cleanupExpiredExports } from '../services/export_service.js';

test('expired export cleanup deletes lean results through the model', async () => {
	const originalFind = Export.find;
	const originalDeleteOne = Export.deleteOne;
	const deleted = [];
	Export.find = async () => [{ _id: 'export-1', file_path: '' }, { _id: 'export-2', file_path: '' }];
	Export.deleteOne = async (query) => {
		deleted.push(query);
		return { deletedCount: 1 };
	};

	try {
		const cleaned = await cleanupExpiredExports();
		assert.equal(cleaned, 2);
		assert.deepEqual(deleted, [{ _id: 'export-1' }, { _id: 'export-2' }]);
	} finally {
		Export.find = originalFind;
		Export.deleteOne = originalDeleteOne;
	}
});
