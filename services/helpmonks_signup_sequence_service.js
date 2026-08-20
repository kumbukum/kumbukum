import axios from 'axios';
import { MongoQueue, MongoWorker } from '../modules/mongo_queue.js';
import { User } from '../model/user.js';
import { createLogger } from '../modules/logger.js';

export const HELPMONKS_SIGNUP_SEQUENCE_QUEUE = 'helpmonks-signup-sequence';
export const HELPMONKS_SIGNUP_SEQUENCE_MAX_ATTEMPTS = 12;
export const HELPMONKS_SIGNUP_SEQUENCE_RETRY_DELAY_MS = 5 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10000;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const INCLUDE_SIGNUP_NAME = true;
const log = createLogger('helpmonks-signup-sequence');

function configuration(options = {}) {
	return {
		apiUrl: String(options.apiUrl ?? process.env.HELPMONKS_SIGNUP_API_URL ?? '').trim().replace(/\/+$/, ''),
		hostId: String(options.helpmonksHostId ?? process.env.HELPMONKS_SIGNUP_HOST_ID ?? '').trim(),
		sequenceId: String(options.sequenceId ?? process.env.HELPMONKS_SIGNUP_SEQUENCE_ID ?? '').trim(),
	};
}

function configurationErrors(config) {
	const errors = [];
	if (!/^https?:\/\//i.test(config.apiUrl)) errors.push('api_url');
	if (!OBJECT_ID_RE.test(config.hostId)) errors.push('host_id');
	if (!OBJECT_ID_RE.test(config.sequenceId)) errors.push('sequence_id');
	return errors;
}

function userNameFields(user, includeName) {
	const email = String(user.email || '').trim().toLowerCase();
	const customer = { email, labels: [] };
	const name = String(user.name || '').trim();
	if (!includeName || !name || name.toLowerCase() === email) return customer;
	const [firstName, ...lastName] = name.split(/\s+/);
	if (firstName) customer.first_name = firstName;
	if (lastName.length) customer.last_name = lastName.join(' ');
	return customer;
}

async function findUser(userId, hostId, userModel) {
	let query = userModel.findOne({ _id: userId, host_id: hostId });
	if (typeof query?.select === 'function') query = query.select('_id email name host_id');
	if (typeof query?.lean === 'function') query = query.lean();
	return query;
}

export async function enqueueHelpmonksSignupSequence(user, tenant, options = {}) {
	const userId = String(user?._id || '').trim();
	const hostId = String(tenant?.host_id || user?.host_id || '').trim();
	if (!userId || !hostId) throw new Error('Helpmonks signup sequence enrollment requires local user and host IDs');
	const config = configuration(options);
	const invalid = configurationErrors(config);
	if (invalid.length) {
		(options.logger || log).error({ user_id: userId, host_id: hostId, invalid_config: invalid }, 'Helpmonks signup sequence enrollment is not configured');
		return null;
	}
	const queueAdd = options.queueAdd || MongoQueue.add.bind(MongoQueue);
	return queueAdd(HELPMONKS_SIGNUP_SEQUENCE_QUEUE, { user_id: userId, host_id: hostId }, {
		dedupKey: `${userId}:${config.sequenceId}`,
		maxAttempts: HELPMONKS_SIGNUP_SEQUENCE_MAX_ATTEMPTS,
	});
}

export async function processHelpmonksSignupSequence(data, options = {}) {
	const userId = String(data?.user_id || '').trim();
	const hostId = String(data?.host_id || '').trim();
	if (!userId || !hostId) throw new Error('Helpmonks signup sequence job requires local user and host IDs');
	const config = configuration(options);
	const invalid = configurationErrors(config);
	if (invalid.length) throw new Error(`Helpmonks signup sequence configuration is invalid: ${invalid.join(', ')}`);
	const user = await findUser(userId, hostId, options.userModel || User);
	if (!user) throw new Error(`Helpmonks signup sequence user '${userId}' was not found`);
	const customer = userNameFields(user, options.includeName ?? INCLUDE_SIGNUP_NAME);
	if (!customer.email) throw new Error(`Helpmonks signup sequence user '${userId}' has no email`);
	const post = options.post || axios.post.bind(axios);
	const response = await post(`${config.apiUrl}/api/v1/trusted/company_user/create`, {
		customer,
		host_id: config.hostId,
		campaign_id: config.sequenceId,
	}, { timeout: options.timeoutMs || REQUEST_TIMEOUT_MS });
	const body = response?.data || {};
	if (!body.success || !body.results?._id || !body.sequence_enrollment || String(body.sequence_enrollment.campaign_id || '') !== config.sequenceId) {
		throw new Error('Helpmonks signup sequence enrollment returned an incomplete response');
	}
	(options.logger || log).info({ user_id: userId, host_id: hostId, helpmonks_contact_id: String(body.results._id), sequence_id: config.sequenceId }, 'Helpmonks signup sequence enrollment completed');
	return { contact_id: String(body.results._id), sequence_enrollment: body.sequence_enrollment };
}

export function createHelpmonksSignupSequenceWorker(options = {}) {
	const Worker = options.Worker || MongoWorker;
	return new Worker({
		queue: HELPMONKS_SIGNUP_SEQUENCE_QUEUE,
		concurrency: 1,
		retryDelayMs: HELPMONKS_SIGNUP_SEQUENCE_RETRY_DELAY_MS,
		handler: (job) => processHelpmonksSignupSequence(job.data, options),
	});
}

export async function startHelpmonksSignupSequenceWorker(options = {}) {
	const worker = createHelpmonksSignupSequenceWorker(options);
	await worker.start();
	return worker;
}
