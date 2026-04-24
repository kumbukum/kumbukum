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

	if (Array.isArray(results.hits)) {
		return slimSearchCollection(results);
	}

	return Object.fromEntries(
		Object.entries(results).map(([key, value]) => [key, slimSearchResults(value)]),
	);
}

function slimSearchCollection(collection) {
	return {
		found: collection.found || 0,
		out_of: collection.out_of || 0,
		page: collection.page || 1,
		hits: collection.hits.map(slimSearchHit),
	};
}

function slimSearchHit(hit) {
	if (hit && typeof hit === 'object' && hit.document) {
		return hit.document;
	}
	return hit;
}
