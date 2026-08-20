import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
	createHelpmonksSignupSequenceWorker,
	enqueueHelpmonksSignupSequence,
	HELPMONKS_SIGNUP_SEQUENCE_MAX_ATTEMPTS,
	HELPMONKS_SIGNUP_SEQUENCE_QUEUE,
	HELPMONKS_SIGNUP_SEQUENCE_RETRY_DELAY_MS,
	processHelpmonksSignupSequence,
} from '../services/helpmonks_signup_sequence_service.js';

const API_URL = 'http://helpmonks.internal';
const HELPMONKS_HOST_ID = '53837271b7b1cbce6da6ce06';
const SEQUENCE_ID = '6a869484a85ea1bd4735fc67';
const USER_ID = '6a8699999999999999999999';
const LOCAL_HOST_ID = '6a8698888888888888888888';

function configured(options = {}) {
	return { apiUrl: API_URL, helpmonksHostId: HELPMONKS_HOST_ID, sequenceId: SEQUENCE_ID, ...options };
}

function userModel(user) {
	return {
		findOne(query) {
			assert.deepEqual(query, { _id: USER_ID, host_id: LOCAL_HOST_ID });
			return {
				select(fields) {
					assert.equal(fields, '_id email name host_id');
					return this;
				},
				async lean() {
					return user;
				},
			};
		},
	};
}

describe('Helpmonks signup sequence enrollment', () => {
	it('queues only local IDs with a stable user-and-sequence deduplication key', async () => {
		let queued;
		const result = await enqueueHelpmonksSignupSequence({ _id: USER_ID }, { host_id: LOCAL_HOST_ID }, configured({
			queueAdd: async (queue, data, options) => {
				queued = { queue, data, options };
				return { _id: 'job-1' };
			},
		}));

		assert.equal(result._id, 'job-1');
		assert.equal(queued.queue, HELPMONKS_SIGNUP_SEQUENCE_QUEUE);
		assert.deepEqual(queued.data, { user_id: USER_ID, host_id: LOCAL_HOST_ID });
		assert.deepEqual(queued.options, { dedupKey: `${USER_ID}:${SEQUENCE_ID}`, maxAttempts: HELPMONKS_SIGNUP_SEQUENCE_MAX_ATTEMPTS });
	});

	it('does not queue or call Helpmonks when configuration is missing', async () => {
		let queued = false;
		let logged;
		const result = await enqueueHelpmonksSignupSequence({ _id: USER_ID }, { host_id: LOCAL_HOST_ID }, {
			apiUrl: '',
			helpmonksHostId: '',
			sequenceId: '',
			queueAdd: async () => { queued = true; },
			logger: { error: (details) => { logged = details; } },
		});

		assert.equal(result, null);
		assert.equal(queued, false);
		assert.deepEqual(logged.invalid_config, ['api_url', 'host_id', 'sequence_id']);
	});

	it('finds the local user lean and enrolls the Helpmonks contact with name fields', async () => {
		let request;
		const result = await processHelpmonksSignupSequence({ user_id: USER_ID, host_id: LOCAL_HOST_ID }, configured({
			userModel: userModel({ _id: USER_ID, host_id: LOCAL_HOST_ID, email: ' Owner@Example.com ', name: 'Ada Lovelace' }),
			post: async (...args) => {
				request = args;
				return { data: { success: true, results: { _id: '6a8697777777777777777777' }, sequence_enrollment: { campaign_id: SEQUENCE_ID, record_id: '6a8696666666666666666666' } } };
			},
			logger: { info: () => {} },
		}));

		assert.equal(request[0], `${API_URL}/api/v1/trusted/company_user/create`);
		assert.deepEqual(request[1], {
			customer: { email: 'owner@example.com', labels: [], first_name: 'Ada', last_name: 'Lovelace' },
			host_id: HELPMONKS_HOST_ID,
			campaign_id: SEQUENCE_ID,
		});
		assert.equal(request[2].timeout, 10000);
		assert.equal(result.contact_id, '6a8697777777777777777777');
	});

	it('rejects incomplete Helpmonks responses so the queue retries', async () => {
		await assert.rejects(
			processHelpmonksSignupSequence({ user_id: USER_ID, host_id: LOCAL_HOST_ID }, configured({
				userModel: userModel({ _id: USER_ID, host_id: LOCAL_HOST_ID, email: 'owner@example.com', name: 'Owner' }),
				post: async () => ({ data: { success: true, results: { _id: '6a8697777777777777777777' } } }),
			})),
			/incomplete response/,
		);
	});

	it('propagates Helpmonks transport failures so the queue retries', async () => {
		await assert.rejects(
			processHelpmonksSignupSequence({ user_id: USER_ID, host_id: LOCAL_HOST_ID }, configured({
				userModel: userModel({ _id: USER_ID, host_id: LOCAL_HOST_ID, email: 'owner@example.com', name: 'Owner' }),
				post: async () => { throw new Error('Helpmonks unavailable'); },
			})),
			/Helpmonks unavailable/,
		);
	});

	it('creates a single worker with twelve delayed attempts', () => {
		let workerOptions;
		class Worker {
			constructor(options) {
				workerOptions = options;
			}
		}
		createHelpmonksSignupSequenceWorker(configured({ Worker }));
		assert.equal(workerOptions.queue, HELPMONKS_SIGNUP_SEQUENCE_QUEUE);
		assert.equal(workerOptions.concurrency, 1);
		assert.equal(workerOptions.retryDelayMs, HELPMONKS_SIGNUP_SEQUENCE_RETRY_DELAY_MS);
	});

	it('is wired only into verified hosted public signup', () => {
		const source = fs.readFileSync(new URL('../routes/auth.js', import.meta.url), 'utf8');
		const signupBlock = source.slice(source.indexOf("router.post('/signup'"), source.indexOf("router.get('/verify'"));
		const verifyBlock = source.slice(source.indexOf("router.post('/verify'"), source.indexOf('// ---- Login ----'));
		assert.doesNotMatch(signupBlock, /enqueueHelpmonksSignupSequence/);
		assert.match(verifyBlock, /if \(req\.isHosted\)/);
		assert.match(verifyBlock, /await enqueueHelpmonksSignupSequence\(user, tenant\)/);
	});
});
