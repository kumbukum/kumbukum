import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	STREAMIENT_DEMO_DURATION_MS,
	STREAMIENT_DEMO_READ_ONLY_MESSAGE,
	activateStreamientDemoSession,
	buildStreamientDemoFixtures,
	deactivateStreamientDemoSession,
	getStreamientDemoScene,
	getStreamientDemoSession,
	hasActiveStreamientDemoSession,
	hasStreamientDemoSessionEntry,
	handleStreamientDemoToggle,
	streamientDemoApiMiddleware,
} from '../services/streamient_demo_service.js';

function demoRequest(options = {}) {
	return {
		authMethod: options.authMethod || 'session',
		host_id: options.host_id || 'host-a',
		session: options.session || {},
		method: options.method || 'GET',
		path: options.path || '/projects',
		query: options.query || {},
		body: options.body || {},
	};
}

function invokeApi(req) {
	const result = { status: 200, body: null, next: 0, headers: {}, chunks: '', ended: false };
	const res = {
		status(value) {
			result.status = value;
			return this;
		},
		json(value) {
			result.body = value;
			return this;
		},
		setHeader(name, value) {
			result.headers[name] = value;
		},
		flushHeaders() {},
		write(value) {
			result.chunks += value;
		},
		end() {
			result.ended = true;
			return this;
		},
	};
	streamientDemoApiMiddleware(req, res, () => { result.next += 1; });
	return result;
}

function activeRequest(options = {}) {
	const req = demoRequest(options);
	activateStreamientDemoSession(req, options.scene || 'overview', options.now || Date.now());
	return req;
}

describe('Streamient demo session', () => {
	it('is session-only, tenant-scoped, scene-aware, and expires after twelve hours', () => {
		const session = {};
		const start = Date.parse('2026-08-12T16:00:00.000Z');
		const accountA = demoRequest({ session, host_id: 'host-a' });
		const accountB = demoRequest({ session, host_id: 'host-b' });

		activateStreamientDemoSession(accountA, 'search', start);
		assert.equal(hasActiveStreamientDemoSession(accountA, start + 1), true);
		assert.equal(hasActiveStreamientDemoSession({ ...accountA, headers: { authorization: 'Bearer live-api-token' } }, start + 1), false);
		assert.equal(getStreamientDemoSession(accountA, start + 1)?.scene, 'search');
		assert.equal(getStreamientDemoSession(accountB, start + 1), null);
		assert.equal(getStreamientDemoSession({ ...accountA, authMethod: 'bearer' }, start + 1), null);
		assert.equal(getStreamientDemoSession({ ...accountA, authMethod: 'token' }, start + 1), null);
		assert.equal(getStreamientDemoSession(accountA, start + STREAMIENT_DEMO_DURATION_MS), null);
		assert.equal(hasActiveStreamientDemoSession(accountA, start + STREAMIENT_DEMO_DURATION_MS), false);
		assert.equal(hasStreamientDemoSessionEntry(accountA), true);
		assert.equal(accountA.streamientDemoExpired, true);
	});

	it('preserves the date anchor when switching scenes and deactivates one tenant only', () => {
		const session = {};
		const start = Date.parse('2026-08-12T16:00:00.000Z');
		const accountA = demoRequest({ session, host_id: 'host-a' });
		const accountB = demoRequest({ session, host_id: 'host-b' });
		const first = activateStreamientDemoSession(accountA, 'overview', start);
		activateStreamientDemoSession(accountB, 'graph', start + 1);
		const switched = activateStreamientDemoSession(accountA, 'notes', start + 5000);

		assert.equal(switched.activated_at, first.activated_at);
		assert.equal(switched.scene, 'notes');
		assert.equal(deactivateStreamientDemoSession(accountA), true);
		assert.equal(getStreamientDemoSession(accountA, start + 6000), null);
		assert.equal(getStreamientDemoSession(accountB, start + 6000)?.scene, 'graph');
	});

	it('defaults invalid or missing scenes to overview', () => {
		const session = {};
		const req = demoRequest({ session });
		assert.equal(activateStreamientDemoSession(req, 'unknown-scene').scene, 'overview');

		const redirects = [];
		const toggleReq = demoRequest({ session: { save: (callback) => callback() }, query: { demo: 'true' } });
		handleStreamientDemoToggle(toggleReq, { redirect: (value) => redirects.push(value) }, assert.fail);
		assert.equal(redirects[0], '/dashboard');
		assert.equal(getStreamientDemoSession(toggleReq)?.scene, 'overview');
	});

	it('activates stable scene URLs and strips control parameters', () => {
		const session = { save: (callback) => callback() };
		const redirects = [];
		const res = { redirect: (value) => redirects.push(value) };
		const req = demoRequest({ session, path: '/dashboard', query: { demo: 'true', scene: 'memory' } });
		handleStreamientDemoToggle(req, res, assert.fail);
		assert.equal(redirects[0], '/memories');
		assert.equal(getStreamientDemoSession(req)?.scene, 'memory');

		req.query = { demo: 'false' };
		handleStreamientDemoToggle(req, res, assert.fail);
		assert.equal(redirects[1], '/dashboard');
		assert.equal(getStreamientDemoSession(req), null);
	});
});

describe('Streamient demo fixtures', () => {
	const context = { anchor_ms: Date.parse('2026-08-12T16:00:00.000Z'), host_id: 'host-a', scene: 'search' };
	const fixtures = buildStreamientDemoFixtures(context);

	it('builds the exact Northstar Labs inventory with deterministic IDs', () => {
		const repeated = buildStreamientDemoFixtures(context);
		const shifted = buildStreamientDemoFixtures({ ...context, anchor_ms: context.anchor_ms + 60 * 60 * 1000 });
		assert.equal(fixtures.projects.length, 3);
		assert.equal(fixtures.notes.length, 12);
		assert.equal(fixtures.memories.length, 18);
		assert.equal(fixtures.urls.length, 9);
		assert.equal(fixtures.emails.length, 9);
		assert.deepEqual(fixtures.projects.map((item) => item._id), repeated.projects.map((item) => item._id));
		for (const collection of [fixtures.projects, fixtures.notes, fixtures.memories, fixtures.urls, fixtures.emails]) {
			for (const item of collection) assert.match(String(item._id), /^[a-f0-9]{24}$/);
		}
		assert.deepEqual(fixtures.notes.map((item) => item._id), shifted.notes.map((item) => item._id));
		assert.equal(Date.parse(shifted.notes[0].createdAt) - Date.parse(fixtures.notes[0].createdAt), 60 * 60 * 1000);
		assert.deepEqual(Object.values(fixtures.counts), [
			{ notes: 5, memory: 8, urls: 4, emails: 3 },
			{ notes: 4, memory: 6, urls: 3, emails: 3 },
			{ notes: 3, memory: 4, urls: 2, emails: 3 },
		]);
	});

	it('contains only fictional Northstar content and no remote image assets', () => {
		const serialized = JSON.stringify(fixtures);
		assert.ok(serialized.includes('Maya Chen'));
		assert.ok(serialized.includes('Northstar Labs'));
		assert.ok(serialized.includes('Brightfield launch partnership'));
		assert.ok(!serialized.includes('/Users/nitai'));
		assert.ok(!serialized.includes('Kumbukum'));
		assert.ok(!serialized.includes('app.streamient.com'));
		assert.ok(fixtures.urls.every((item) => !item.og_image && !item.screenshot && !item.screenshot_url));
		assert.ok(fixtures.all_emails.every((item) => item.html_content_has_remote_images === false));
	});

	it('keeps links, graph edges, threads, and scenes referentially valid', () => {
		const ids = new Set([...fixtures.notes, ...fixtures.memories, ...fixtures.urls, ...fixtures.all_emails].map((item) => String(item._id)));
		const projectIds = new Set(fixtures.projects.map((item) => String(item._id)));
		for (const record of [...fixtures.notes, ...fixtures.memories, ...fixtures.urls, ...fixtures.all_emails]) assert.ok(projectIds.has(String(record.project)));
		for (const link of fixtures.links) {
			assert.ok(ids.has(String(link.source_id)));
			assert.ok(ids.has(String(link.target_id)));
		}
		const graphIds = new Set(fixtures.graph_nodes.map((node) => node.id));
		for (const edge of fixtures.graph_edges) {
			assert.ok(graphIds.has(edge.source));
			assert.ok(graphIds.has(edge.target));
		}
		for (const email of fixtures.emails) assert.equal(fixtures.email_threads[email._id].length, 2);
		for (const name of ['overview', 'search', 'notes', 'memory', 'urls', 'emails', 'graph']) {
			const scene = getStreamientDemoScene({ ...context, scene: name }, fixtures);
			assert.equal(scene.name, name);
			assert.ok(scene.path.startsWith('/'));
			assert.ok(scene.project_id);
		}
	});
});

describe('Streamient demo API middleware', () => {
	it('serves every core collection without reaching live handlers', () => {
		const req = activeRequest();
		for (const [path, key, count] of [
			['/projects', 'projects', 3],
			['/notes', 'notes', 12],
			['/memories', 'memories', 18],
			['/urls', 'urls', 9],
			['/emails', 'emails', 9],
		]) {
			const result = invokeApi({ ...req, path, query: {} });
			assert.equal(result.next, 0);
			assert.equal(result.status, 200);
			assert.equal(result.body[key].length, count);
		}
	});

	it('filters and paginates records by project', () => {
		const req = activeRequest();
		const fixtures = buildStreamientDemoFixtures(getStreamientDemoSession(req));
		const productId = fixtures.project_ids.product;
		const page = invokeApi({ ...req, path: '/memories', query: { project: productId, page: '1', limit: '3' } });
		assert.equal(page.body.memories.length, 3);
		assert.ok(page.body.memories.every((item) => item.project === productId));
		assert.equal(invokeApi({ ...req, path: '/batch/count', query: { type: 'memories', project: productId } }).body.count, 8);
	});

	it('serves details, URL pages, email threads, connections, graph, and empty trash', () => {
		const req = activeRequest();
		const fixtures = buildStreamientDemoFixtures(getStreamientDemoSession(req));
		const note = fixtures.notes.find((item) => item.key === 'beta-launch-plan');
		const url = fixtures.urls.find((item) => item.key === 'private-beta-brief');
		const email = fixtures.emails.find((item) => item.key === 'brightfield-launch');
		assert.equal(invokeApi({ ...req, path: `/notes/${note._id}`, query: {} }).body.note.title, note.title);
		assert.equal(invokeApi({ ...req, path: `/urls/${url._id}/pages`, query: {} }).body.pages.length, 2);
		assert.equal(invokeApi({ ...req, path: `/emails/${email._id}/thread`, query: {} }).body.thread.length, 2);
		assert.ok(invokeApi({ ...req, path: `/connections/${note._id}`, query: {} }).body.links.length >= 2);
		assert.ok(invokeApi({ ...req, path: '/graph', query: { project_id: fixtures.project_ids.product } }).body.nodes.length > 0);
		const conversations = invokeApi({ ...req, path: '/chat/conversations', query: {} }).body.conversations;
		assert.equal(conversations.length, 1);
		assert.equal(invokeApi({ ...req, path: `/chat/conversations/${conversations[0].conversation_id}/messages`, query: {} }).body.messages.length, 2);
		assert.deepEqual(invokeApi({ ...req, path: '/trash', query: {} }).body.items, []);
	});

	it('provides deterministic search and source-backed chat', () => {
		const req = activeRequest();
		const quick = invokeApi({ ...req, method: 'POST', path: '/search/quick', body: { query: 'beta launch', limit: 4 } });
		const repeated = invokeApi({ ...req, method: 'POST', path: '/search/quick', body: { query: 'beta launch', limit: 4 } });
		assert.equal(quick.status, 200);
		assert.ok(quick.body.results.length > 0);
		assert.deepEqual(quick.body.results, repeated.body.results);
		assert.ok(quick.body.results.some((item) => item.title === 'Beta launch plan — August 26'));
		const fixtures = buildStreamientDemoFixtures(getStreamientDemoSession(req));
		const filtered = invokeApi({ ...req, method: 'POST', path: '/search/quick', body: { query: 'security', project_id: fixtures.project_ids.operations, limit: 2 } });
		assert.ok(filtered.body.results.length > 0);
		assert.ok(filtered.body.results.every((item) => item.project_id === fixtures.project_ids.operations));

		const chat = invokeApi({ ...req, method: 'POST', path: '/chat', body: { query: 'What did we decide about the beta launch?' } });
		assert.match(chat.body.answer, /August 26/);
		assert.match(chat.body.answer, /\$49\/month/);
		assert.equal(chat.body.results.length, 4);
		assert.equal(chat.body.results.find((item) => item._type === 'emails').title, 'Brightfield launch partnership');
		assert.equal(chat.body.display_in, 'panel');

		const stream = invokeApi({ ...req, method: 'POST', path: '/chat/stream', body: { query: 'Summarize the enterprise pilot' } });
		assert.equal(stream.headers['Content-Type'], 'text/event-stream');
		assert.match(stream.chunks, /event: token/);
		assert.match(stream.chunks, /event: done/);
		assert.match(stream.chunks, /60-day enterprise pilot/);
		assert.equal(stream.ended, true);
	});

	it('blocks mutations and unknown demo reads before live storage', () => {
		const mutation = invokeApi(activeRequest({ method: 'PUT', path: '/notes/507f1f77bcf86cd799439011' }));
		assert.equal(mutation.next, 0);
		assert.equal(mutation.status, 409);
		assert.deepEqual(mutation.body, { error: STREAMIENT_DEMO_READ_ONLY_MESSAGE, code: 'DEMO_READ_ONLY' });
		const missing = invokeApi(activeRequest({ path: '/notes/507f1f77bcf86cd799439011' }));
		assert.equal(missing.status, 404);
		assert.equal(missing.next, 0);
		const unknown = invokeApi(activeRequest({ path: '/settings/byo-ai' }));
		assert.equal(unknown.status, 404);
		assert.equal(unknown.next, 0);
	});

	it('leaves inactive sessions and non-session authentication live', () => {
		assert.equal(invokeApi(demoRequest()).next, 1);
		const req = activeRequest();
		for (const authMethod of ['bearer', 'token', 'oauth-api', 'mcp-bridge']) assert.equal(invokeApi({ ...req, authMethod }).next, 1);
	});

	it('returns 410 after expiry instead of falling through to live data', () => {
		const start = Date.parse('2026-08-12T16:00:00.000Z');
		const req = activeRequest({ now: start });
		const originalNow = Date.now;
		Date.now = () => start + STREAMIENT_DEMO_DURATION_MS;
		try {
			const result = invokeApi(req);
			assert.equal(result.status, 410);
			assert.equal(result.body.code, 'DEMO_EXPIRED');
			assert.equal(result.next, 0);
		} finally {
			Date.now = originalNow;
		}
	});
});
