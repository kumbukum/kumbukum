/**
 * Convert raw Typesense responses into lean MCP search payloads.
 * Search should identify exact items; read tools return full documents.
 */
export function slimSearchResults(results) {
	if (Array.isArray(results)) {
		return results.map(slimSearchHit);
	}

	if (!results || typeof results !== 'object') {
		return results;
	}

	if (Array.isArray(results.hits) || Array.isArray(results.grouped_hits)) {
		return slimSearchCollection(results);
	}

	return Object.fromEntries(
		Object.entries(results).map(([key, value]) => [key, slimSearchResults(value)]),
	);
}

function slimSearchCollection(collection) {
	const hits = Array.isArray(collection.hits)
		? collection.hits
		: (collection.grouped_hits || []).map((group) => group.hits?.[0]).filter(Boolean);

	return {
		found: collection.found || 0,
		out_of: collection.out_of || 0,
		page: collection.page || 1,
		hits: hits.map(slimSearchHit),
	};
}

function slimSearchHit(hit) {
	if (hit && typeof hit === 'object' && hit.document) {
		return hit.document.source_id ? { ...hit.document, id: hit.document.source_id } : hit.document;
	}
	return hit;
}
