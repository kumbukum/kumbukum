import { Router } from 'express';
import express from 'express';

const ALLOWED_PROJECT_IDS = buildAllowlist();

function buildAllowlist() {
	const ids = new Set();
	const csv = (process.env.SENTRY_TUNNEL_PROJECT_IDS || '').trim();
	if (csv) {
		for (const id of csv.split(',')) {
			const trimmed = id.trim();
			if (trimmed) ids.add(trimmed);
		}
	}
	// Fallback: derive project id from SENTRY_DSN (last path segment)
	if (ids.size === 0 && process.env.SENTRY_DSN) {
		try {
			const dsn = new URL(process.env.SENTRY_DSN);
			const projectId = dsn.pathname.replace(/\//g, '');
			if (projectId) ids.add(projectId);
		} catch { /* invalid DSN — skip */ }
	}
	return ids;
}

// Simple circuit breaker: if Sentry ingest fails repeatedly, stop trying
// for a cool-down period so the app isn't blocked waiting on a dead upstream.
let _failures = 0;
let _circuitOpenUntil = 0;
const CB_THRESHOLD = 5;
const CB_COOLDOWN_MS = 60_000;

const router = Router();

router.post('/', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
	res.status(200).json({ ok: true });

	const body = req.body;
	if (!body || !body.length) return;

	try {
		const text = typeof body === 'string' ? body : body.toString();
		const firstLine = text.split('\n', 1)[0];
		const header = JSON.parse(firstLine);
		const dsnStr = header.dsn;
		if (!dsnStr) return;

		const dsn = new URL(dsnStr);
		const publicKey = dsn.username;
		const ingestHost = dsn.hostname;
		const projectId = dsn.pathname.replace(/\//g, '');

		if (ALLOWED_PROJECT_IDS.size > 0 && !ALLOWED_PROJECT_IDS.has(projectId)) return;

		if (Date.now() < _circuitOpenUntil) return;

		const url = `https://${ingestHost}/api/${projectId}/envelope/`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);

		const resp = await fetch(url, {
			method: 'POST',
			body,
			headers: {
				'Content-Type': 'application/x-sentry-envelope',
				'X-Sentry-Auth': `Sentry sentry_key=${publicKey}, sentry_version=10`,
			},
			signal: controller.signal,
		});
		clearTimeout(timeout);

		if (resp.ok) {
			_failures = 0;
		} else {
			_failures++;
			if (_failures >= CB_THRESHOLD) _circuitOpenUntil = Date.now() + CB_COOLDOWN_MS;
		}
	} catch {
		_failures++;
		if (_failures >= CB_THRESHOLD) _circuitOpenUntil = Date.now() + CB_COOLDOWN_MS;
	}
});

export default router;
