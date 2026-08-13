import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
	return readFile(new URL(path, root), 'utf8');
}

describe('Streamient demo integration', () => {
	it('intercepts browser-session API traffic before billing and live handlers', async () => {
		const [api, service, rateLimit] = await Promise.all([
			source('routes/api.js'),
			source('services/streamient_demo_service.js'),
			source('middleware/rate_limit.js'),
		]);
		const authIndex = api.indexOf('router.use(requireAuth, requireTenant);');
		const demoIndex = api.indexOf('router.use(streamientDemoApiMiddleware);');
		const billingIndex = api.indexOf('// Free is a permanent');

		assert.ok(authIndex >= 0);
		assert.ok(demoIndex > authIndex);
		assert.ok(billingIndex > demoIndex);
		assert.deepEqual(service.match(/^import .*$/gm), ["import { createHash } from 'node:crypto';"]);
		for (const liveDependency of ['mongoose', 'typesense', 'redis', 'socket', 'storage', 'openai', 'anthropic', 'google']) assert.doesNotMatch(service, new RegExp(`from ['\"][^'\"]*${liveDependency}`, 'i'));
		assert.match(rateLimit, /shouldSkipCommon\(request\)[\s\S]*hasStreamientDemoSessionEntry\(request\)/);
	});

	it('resolves demo context before layout data can reach live account services', async () => {
		const [app, web, managani] = await Promise.all([
			source('app.js'),
			source('routes/web.js'),
			source('modules/managani_module.js'),
		]);
		const toggleIndex = web.indexOf('router.use(handleStreamientDemoToggle);');
		const contextIndex = web.indexOf('const context = getStreamientDemoSession(req);');
		const fixturesIndex = web.indexOf('const fixtures = buildStreamientDemoFixtures(req.streamientDemoContext);');
		const liveUserIndex = web.indexOf('User.findById(req.userId)');

		assert.ok(toggleIndex >= 0);
		assert.ok(contextIndex > toggleIndex);
		assert.ok(fixturesIndex > contextIndex);
		assert.ok(liveUserIndex > fixturesIndex);
		assert.ok(app.indexOf('hasStreamientDemoSessionEntry(req)') < app.indexOf('app.use(managani.middleware)'));
		assert.match(managani, /if \(req\.managaniSkip === true\) return next\(\);\n\s*refreshIfStale\(\);/);
	});

	it('guards authenticated billing routes before Stripe or billing data', async () => {
		const billing = await source('routes/billing.js');
		const webhookIndex = billing.indexOf("'/billing/webhook'");
		const demoGuardIndex = billing.indexOf("router.use('/billing', requireAuth, requireTenant");
		const checkoutIndex = billing.indexOf("router.get('/billing/checkout'");
		const liveBillingIndex = billing.indexOf('getBillingUserForHost(req.host_id, req.userId)', checkoutIndex);

		assert.ok(webhookIndex >= 0);
		assert.ok(demoGuardIndex > webhookIndex);
		assert.ok(checkoutIndex > demoGuardIndex);
		assert.ok(liveBillingIndex > checkoutIndex);
	});

	it('keeps sockets, uploads, editing, and account controls out of demo mode', async () => {
		const [layout, app, chat, notes] = await Promise.all([
			source('views/layout.pug'),
			source('public/js/app.js'),
			source('public/js/chat.js'),
			source('public/js/notes.js'),
		]);

		assert.match(layout, /if !streamient_demo_mode\n\s+script\(src="\/socket\.io\/socket\.io\.js"\)/);
		assert.match(layout, /var __streamient_demo_mode/);
		assert.match(app, /if \(!isStreamientDemoMode\(\).*typeof io === 'function'/);
		assert.match(app, /if \(isStreamientDemoMode\(\)\) return;/);
		assert.match(chat, /rmApplyDemoReadOnly/);
		assert.match(notes, /if \(typeof __streamient_demo_mode === 'boolean' && __streamient_demo_mode\) return;/);
	});

	it('wires deterministic screenshot scenes for records, chat, and graph', async () => {
		const [app, chat, graph] = await Promise.all([
			source('public/js/app.js'),
			source('public/js/chat.js'),
			source('public/js/graph.js'),
		]);

		assert.match(app, /applyStreamientDemoItemScene/);
		assert.match(chat, /__streamientDemoChatSceneApplied/);
		assert.match(graph, /name: 'circle'/);
		assert.match(graph, /graph_focus_id/);
	});
});
