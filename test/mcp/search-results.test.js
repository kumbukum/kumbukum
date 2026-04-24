import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { slimSearchResults } from '../../apps/mcp/tools/search-results.js';

describe('MCP Search Results', () => {
	it('slims a single Typesense collection response', () => {
		const result = slimSearchResults({
			facet_counts: [],
			found: 1,
			hits: [
				{
					document: { id: 'note-1', title: 'Note 1' },
					highlight: {},
					highlights: [],
					text_match_info: { score: '123' },
					vector_distance: 0.12,
				},
			],
			out_of: 9,
			page: 1,
			request_params: { q: 'test' },
			search_cutoff: false,
			search_time_ms: 3,
		});

		assert.deepEqual(result, {
			found: 1,
			out_of: 9,
			page: 1,
			hits: [{ id: 'note-1', title: 'Note 1' }],
		});
	});

	it('slims multi-collection Typesense responses', () => {
		const result = slimSearchResults({
			notes: {
				found: 1,
				hits: [{ document: { id: 'note-1', title: 'Note 1' }, vector_distance: 0.12 }],
				out_of: 2,
				page: 1,
				request_params: { q: 'test' },
			},
			memory: {
				found: 0,
				hits: [],
				out_of: 0,
				page: 1,
				request_params: { q: 'test' },
			},
		});

		assert.deepEqual(result, {
			notes: {
				found: 1,
				out_of: 2,
				page: 1,
				hits: [{ id: 'note-1', title: 'Note 1' }],
			},
			memory: {
				found: 0,
				out_of: 0,
				page: 1,
				hits: [],
			},
		});
	});

	it('preserves simple array results from non-Typesense mocks', () => {
		const result = slimSearchResults([{ id: 'raw-1', title: 'Raw 1' }]);
		assert.deepEqual(result, [{ id: 'raw-1', title: 'Raw 1' }]);
	});
});
