import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';
import { Email } from '../model/email.js';

export const OBSOLETE_TRASH_TTL_INDEX = 'trashed_at_1';

const DEFAULT_MODELS = { notes: Note, memories: Memory, urls: Url, emails: Email };

function isMissingIndexError(err) {
	return err?.code === 26 || err?.code === 27 || err?.codeName === 'NamespaceNotFound' || err?.codeName === 'IndexNotFound';
}

export async function migrateTrashTtlIndexes({ models = DEFAULT_MODELS, apply = false } = {}) {
	const results = [];
	for (const [type, model] of Object.entries(models)) {
		let indexes;
		try {
			indexes = await model.collection.indexes();
		} catch (err) {
			if (isMissingIndexError(err)) {
				results.push({ type, index: OBSOLETE_TRASH_TTL_INDEX, status: 'missing' });
				continue;
			}
			throw err;
		}
		if (!indexes.some((index) => index.name === OBSOLETE_TRASH_TTL_INDEX)) {
			results.push({ type, index: OBSOLETE_TRASH_TTL_INDEX, status: 'missing' });
			continue;
		}
		if (!apply) {
			results.push({ type, index: OBSOLETE_TRASH_TTL_INDEX, status: 'would_drop' });
			continue;
		}
		try {
			await model.collection.dropIndex(OBSOLETE_TRASH_TTL_INDEX);
			results.push({ type, index: OBSOLETE_TRASH_TTL_INDEX, status: 'dropped' });
		} catch (err) {
			if (!isMissingIndexError(err)) throw err;
			results.push({ type, index: OBSOLETE_TRASH_TTL_INDEX, status: 'missing' });
		}
	}
	return { apply, index: OBSOLETE_TRASH_TTL_INDEX, results };
}
