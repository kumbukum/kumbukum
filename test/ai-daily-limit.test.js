import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { Tenant } from '../modules/tenancy.js';
import { createAiDailyLimiter } from '../middleware/rate_limit.js';

function createServer(decorate) {
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		decorate(req);
		next();
	});
	app.post('/chat', createAiDailyLimiter(), (_req, res) => res.json({ ok: true }));
	return app.listen(0);
}

async function post(server) {
	const { port } = server.address();
	return fetch(`http://127.0.0.1:${port}/chat`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}',
	});
}

function closeServer(server) {
	return new Promise((resolve) => server.close(resolve));
}

describe('stored daily AI limit', () => {
	const originalTenantFindOne = Tenant.findOne;
	const hostPrefix = `${Date.now()}-${process.pid}`;
	let hostSequence = 0;
	let tenant;

	const hostedAccount = (req, hostId = 'host-1') => {
		req.isHosted = true;
		req.host_id = hostId;
	};

	beforeEach(() => {
		tenant = {
			host_id: 'host-1',
			plan: 'free',
			limit_ai_workflows_per_day: 3,
			settings: { byo_ai: { global: { openai_api_key: '', gemini_api_key: '' } } },
		};
		Tenant.findOne = () => ({ select: () => ({ lean: async () => tenant }) });
	});

	afterEach(() => {
		Tenant.findOne = originalTenantFindOne;
	});

	async function assertCapped(decorate = hostedAccount) {
		const hostId = `host-${hostPrefix}-${++hostSequence}`;
		const server = createServer((req) => decorate(req, hostId));
		try {
			for (let i = 0; i < 3; i++) {
				assert.equal((await post(server)).status, 200);
			}
			const response = await post(server);
			const json = await response.json();
			assert.equal(response.status, 429);
			assert.equal(json.code, 'AI_DAILY_LIMIT');
			assert.equal(json.limit, 3);
			assert.match(json.error, /account allows 3 AI workflows/);
		} finally {
			await closeServer(server);
		}
	}

	it('enforces the stored limit for hosted Free accounts', async () => {
		await assertCapped();
	});

	it('still enforces it with BYO keys, Pro, or an active trial', async () => {
		tenant.settings.byo_ai.global.gemini_api_key = 'encrypted-value';
		await assertCapped();

		tenant.plan = 'pro';
		await assertCapped();

		await assertCapped((req, hostId) => {
			hostedAccount(req, hostId);
			req.billingUser = {
				subscription_status: 'trialing',
				trial_source: 'no_card',
				trial_ends_at: new Date(Date.now() + 86_400_000),
			};
		});
	});

	it('is unlimited for self-hosted requests', async () => {
		const server = createServer((req) => {
			req.isHosted = false;
			req.host_id = 'host-1';
		});
		try {
			for (let i = 0; i < 5; i++) assert.equal((await post(server)).status, 200);
		} finally {
			await closeServer(server);
		}
	});

	it('treats a stored zero as unlimited', async () => {
		tenant.limit_ai_workflows_per_day = 0;
		const server = createServer(hostedAccount);
		try {
			for (let i = 0; i < 5; i++) assert.equal((await post(server)).status, 200);
		} finally {
			await closeServer(server);
		}
	});
});
