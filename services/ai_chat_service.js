import { searchAll } from '../modules/typesense.js';
import { chatCompletion } from '../modules/llm_client.js';

export async function aiChatSearch(host_id, query, { stream = false } = {}) {
	const results = await searchAll(host_id, query, { perPage: 5 });
	const context = buildContext(results);

	const messages = [
		{
			role: 'system',
			content: `You are Kumbukum, a personal knowledge assistant. Answer the user's question using ONLY the context provided below. If the context doesn't contain relevant information, say so honestly. Be concise and helpful.

CONTEXT:
${context}`,
		},
		{
			role: 'user',
			content: query,
		},
	];

	return chatCompletion({ messages, stream });
}

function buildContext(results) {
	const sections = [];

	if (results.notes?.found > 0) {
		const noteItems = results.notes.hits.map(
			(h) => `[Note] ${h.document.title}: ${h.document.text_content?.slice(0, 500)}`,
		);
		sections.push('NOTES:\n' + noteItems.join('\n'));
	}

	if (results.memory?.found > 0) {
		const memItems = results.memory.hits.map(
			(h) => `[Memory] ${h.document.title}: ${h.document.content?.slice(0, 500)}`,
		);
		sections.push('MEMORIES:\n' + memItems.join('\n'));
	}

	if (results.urls?.found > 0) {
		const urlItems = results.urls.hits.map(
			(h) => `[URL] ${h.document.title} (${h.document.url}): ${h.document.text_content?.slice(0, 500)}`,
		);
		sections.push('SAVED URLS:\n' + urlItems.join('\n'));
	}

	if (results.pages?.found > 0) {
		const pageItems = results.pages.hits.map(
			(h) => `[Page] ${h.document.title} (${h.document.url}): ${h.document.text_content?.slice(0, 500)}`,
		);
		sections.push('CRAWLED PAGES:\n' + pageItems.join('\n'));
	}

	return sections.join('\n\n') || 'No relevant information found in your knowledge base.';
}

export async function searchKnowledge(host_id, query, options = {}) {
	return searchAll(host_id, query, options);
}
