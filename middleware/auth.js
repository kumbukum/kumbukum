import jwt from 'jsonwebtoken';
import config from '../config.js';
import { User } from '../model/user.js';
import { Tenant } from '../modules/tenancy.js';

async function resolveTenantId(req) {
	if (req.host_id) {
		const tenant = await Tenant.findOne({ host_id: req.host_id, is_active: true }, '_id').lean();
		if (tenant) req.tenantId = tenant._id.toString();
	}
}

export async function requireAuth(req, res, next) {
	if (req.session?.userId) {
		req.userId = req.session.userId;
		req.host_id = req.session.host_id;
		return next();
	}

	const authHeader = req.headers.authorization;
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7);
		try {
			const payload = jwt.verify(token, config.jwtSecret);
			req.userId = payload.userId;
			req.host_id = payload.host_id;
			await resolveTenantId(req);
			return next();
		} catch {
			return res.status(401).json({ error: 'Invalid token' });
		}
	}

	if (authHeader?.startsWith('Token ')) {
		const accessToken = authHeader.slice(6);
		const user = await User.findOne(
			{ 'access_tokens.token': accessToken, is_active: true },
			'host_id tenant',
		);
		if (user) {
			req.userId = user._id.toString();
			req.host_id = user.host_id;
			req.tenantId = user.tenant?.toString();
			return next();
		}
	}

	if (req.accepts('html')) {
		return res.redirect('/login');
	}
	return res.status(401).json({ error: 'Authentication required' });
}

export function generateToken(userId, host_id) {
	return jwt.sign({ userId, host_id }, config.jwtSecret, { expiresIn: '7d' });
}
