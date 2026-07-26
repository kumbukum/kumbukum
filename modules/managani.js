import { createManaganiModule } from './managani_module.js';
import { createLogger } from './logger.js';
import { encrypt, decrypt } from './encryption.js';
import { User } from '../model/user.js';
import { getSetting, setSetting } from '../services/system_settings_service.js';
import { hasProductAccess } from '../services/subscription_access_service.js';

const log = createLogger('managani');
const appInstance = process.env.APP_INSTANCE || 'streamient';
const appVersion = process.env.APP_VERSION || process.env.OTEL_SERVICE_VERSION || '0';
const appLocation = process.env.APP_LOCATION || process.env.STREAMIENT_APP_LOCATION || 'us';
const ignoredPaths = ['/admin', '/login', '/signup', '/logout', '/forgot-password', '/reset-password', '/verify-email', '/oauth', '/static', '/white-label-assets', '/auth-assets', '/health', '/docs', '/api/doc', '/socket.io', '/favicon.ico', '/robots.txt', '/import', '/billing/webhook'];

function idString(value) {
	if (!value) return '';
	return typeof value.toString === 'function' ? value.toString() : String(value);
}

function resolveBackendBaseUrl(baseUrl) {
	const url = new URL(baseUrl);
	if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', 'm.lan'].includes(url.hostname)) return 'http://managani-app-1:3000';
	return baseUrl;
}

function mapStreamientUser(user, context = {}) {
	if (!user) return null;
	const req = context.req;
	const res = context.res;
	const id = idString(user.id || user._id || user.user_id || req?.userId || req?.session?.userId);
	if (!id) return null;
	const memberRole = req?.memberRole || req?.session?.memberRole || user.member_role || user.role || 'member';
	const hostId = idString(req?.host_id || req?.session?.host_id || user.host_id);
	const tenantId = idString(req?.tenantId || req?.session?.tenantId || user.tenant_id);
	const billingUser = context.billingUser || res?.locals?.billing_user || req?.billingUser;
	const isHosted = req?.isHosted ?? res?.locals?.is_hosted ?? true;
	const isPaid = user.is_paid ?? (!isHosted || hasProductAccess(billingUser));
	return {
		id,
		email: user.email || '',
		name: user.name || user.full_name || '',
		avatar: user.avatar || user.avatar_url || '',
		role: ['owner', 'admin'].includes(memberRole) ? 'admin' : 'user',
		host_id: hostId,
		is_paid: isPaid,
		location: appLocation,
		metadata: {
			host_id: hostId,
			tenant_id: tenantId,
			account_role: memberRole,
			is_paid: isPaid,
		},
	};
}

async function resolveStreamientUser(req, res) {
	const userId = req.userId || req.session?.userId;
	if (!userId) return null;
	const viewUser = res.locals?.user;
	if (viewUser && idString(viewUser._id || viewUser.id) === idString(userId)) return viewUser;
	return User.findById(userId).select('email name host_id');
}

function resolveStreamientMetadata(req) {
	return {
		request_host: req.hostname || '',
		member_role: req.memberRole || req.session?.memberRole || '',
		is_hosted: req.isHosted === true,
	};
}

const managani = createManaganiModule({
	settingsStore: { getSetting, setSetting },
	secretCodec: { encrypt, decrypt },
	resolveUser: resolveStreamientUser,
	mapUser: mapStreamientUser,
	resolveMetadata: resolveStreamientMetadata,
	resolveBackendBaseUrl,
	logger: log,
	appInstance,
	appVersion,
	appLocation,
	ignorePaths: ignoredPaths,
});

export const _private = {
	mapStreamientUser,
	resolveStreamientMetadata,
	resolveBackendBaseUrl,
};

export default managani;
