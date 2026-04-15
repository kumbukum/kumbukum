import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
	{
		host_id: { type: String, required: true, unique: true, index: true },
		name: { type: String, required: true },
		owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		is_active: { type: Boolean, default: true },
		plan: { type: String, enum: ['free', 'starter', 'pro'], default: 'free' },
		settings: {
			timezone: { type: String, default: 'UTC' },
		},
	},
	{ timestamps: true },
);

export const Tenant = mongoose.model('Tenant', tenantSchema);

export function resolveTenant(req, res, next) {
	if (req.path.startsWith('/login') || req.path.startsWith('/signup') || req.path.startsWith('/static') || req.path.startsWith('/admin') || req.path.startsWith('/sysadmin')) {
		return next();
	}

	if (req.session?.tenantId) {
		req.tenantId = req.session.tenantId;
		req.host_id = req.session.host_id;
	}

	next();
}

export async function createTenant(userId, name) {
	const host_id = new mongoose.Types.ObjectId().toString();
	const tenant = await Tenant.create({
		host_id,
		name,
		owner: userId,
	});
	return tenant;
}

export function requireTenant(req, res, next) {
	if (!req.tenantId) {
		return res.status(401).json({ error: 'Tenant not resolved' });
	}
	next();
}
