import { Router, raw } from 'express';
import mongoose from 'mongoose';

import config from '../config.js';
import { Project } from '../model/project.js';
import { Tenant } from '../modules/tenancy.js';
import * as emailIngestService from '../services/email_ingest_service.js';

const router = Router();
const is_hosted = new URL(config.appUrl).hostname.endsWith('kumbukum.com');

function parseJsonBody(req) {
	if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
	const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
	if (!rawBody.trim()) throw new Error('Request body is required');
	return JSON.parse(rawBody);
}

function firstValue(value) {
	if (!value) return '';
	if (Array.isArray(value)) return firstValue(value[0]);
	if (typeof value === 'object') {
		return value.address || value.text || value.email || value.recipient || value.sender || firstValue(value.value) || '';
	}
	return String(value);
}

function normalizeForwardedPayload(payload) {
	return {
		...payload,
		to: payload.to || payload.recipient || payload.rcpt_to || payload.envelope?.to || payload.envelope?.recipient || payload.session?.recipient,
		from: payload.from || payload.sender || payload.envelope?.from || payload.envelope?.sender || payload.session?.sender,
	};
}

function findForwardRecipient(email) {
	const forwardDomain = String(config.emailForwardDomain || '').trim().replace(/^@+/, '').toLowerCase();
	if (!forwardDomain) return { error: 'EMAIL_FORWARD_DOMAIN is not configured' };

	for (const address of email.to || []) {
		const value = firstValue(address).trim().toLowerCase();
		const atIndex = value.lastIndexOf('@');
		if (atIndex === -1) continue;

		const localPart = value.slice(0, atIndex);
		const domain = value.slice(atIndex + 1);
		if (domain === forwardDomain) return { localPart, address: value };
	}

	return { error: 'Forwarded email recipient must use EMAIL_FORWARD_DOMAIN' };
}

async function emailForwardingEnabled(host_id) {
	if (!is_hosted) return true;
	const tenant = await Tenant.findOne({ host_id }).select('plan').lean();
	return tenant?.plan === 'pro';
}

router.post('/email', raw({ type: () => true, limit: '25mb' }), async (req, res) => {
	let payload;
	try {
		payload = normalizeForwardedPayload(parseJsonBody(req));
	} catch {
		return res.status(400).json({ error: 'Invalid JSON payload' });
	}

	let normalized;
	try {
		normalized = emailIngestService.parseForwardedEmailInput(payload);
	} catch (err) {
		return res.status(400).json({ error: err.message });
	}

	if (!normalized.to.length) {
		return res.status(400).json({ error: 'Forwarded email recipient is required' });
	}
	if (!normalized.from.length) {
		return res.status(400).json({ error: 'Forwarded email sender is required' });
	}

	const recipient = findForwardRecipient(normalized);
	if (recipient.error) {
		const status = recipient.error.includes('configured') ? 503 : 403;
		return res.status(status).json({ error: recipient.error });
	}

	if (!mongoose.Types.ObjectId.isValid(recipient.localPart)) {
		return res.json({ accepted: false });
	}

	const project = await Project.findOne({ _id: recipient.localPart, is_active: true }).lean();
	if (!project) {
		return res.json({ accepted: false });
	}

	if (!(await emailForwardingEnabled(project.host_id))) {
		return res.json({ accepted: false });
	}

	try {
		const email = await emailIngestService.ingestForwardedEmail(project.owner, project.host_id, {
			...payload,
			project: project._id,
		}, {
			user_id: project.owner,
			channel: 'emailforwarding',
			ip: req.ip,
			user_agent: req.headers['user-agent'],
		});

		res.json({ accepted: true, email_id: email._id.toString() });
	} catch (err) {
		if (err.message === 'Email message already exists') {
			return res.json({ accepted: false });
		}
		res.status(400).json({ error: err.message });
	}
});

export default router;
