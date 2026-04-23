import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MagicLink } from '../model/magic_link.js';
import { User } from '../model/user.js';
import { isMagicLinkValid, verifyMagicLink } from '../services/magic_link_service.js';

describe('magic link flow hardening', () => {
	it('checks link validity without consuming token', async () => {
		const originalFindOne = MagicLink.findOne;
		const originalVerify = MagicLink.verify;

		let capturedQuery = null;
		let verifyCalled = false;

		try {
			MagicLink.findOne = (query) => {
				capturedQuery = query;
				return {
					select() {
						return { _id: 'magic-id' };
					},
				};
			};
			MagicLink.verify = async () => {
				verifyCalled = true;
				return null;
			};

			const isValid = await isMagicLinkValid('token-123');
			assert.equal(isValid, true);
			assert.equal(capturedQuery.token, 'token-123');
			assert.equal(capturedQuery.used, false);
			assert.equal(verifyCalled, false);
			assert.ok(capturedQuery.expires_at?.$gt instanceof Date);
		} finally {
			MagicLink.findOne = originalFindOne;
			MagicLink.verify = originalVerify;
		}
	});

	it('consumes token exactly once through verification', async () => {
		const originalVerify = MagicLink.verify;
		const originalFindById = User.findById;

		let verifyCount = 0;

		try {
			MagicLink.verify = async () => {
				verifyCount += 1;
				if (verifyCount === 1) return { user: 'user-1' };
				return null;
			};
			User.findById = async () => ({ _id: 'user-1', is_active: true });

			const firstResult = await verifyMagicLink('token-once');
			const secondResult = await verifyMagicLink('token-once');

			assert.equal(firstResult?._id, 'user-1');
			assert.equal(secondResult, null);
			assert.equal(verifyCount, 2);
		} finally {
			MagicLink.verify = originalVerify;
			User.findById = originalFindById;
		}
	});

	it('keeps token redeemable after preview-like validity check', async () => {
		const originalFindOne = MagicLink.findOne;
		const originalVerify = MagicLink.verify;
		const originalFindById = User.findById;

		let verifyCount = 0;

		try {
			MagicLink.findOne = () => ({
				select() {
					return { _id: 'still-unused' };
				},
			});
			MagicLink.verify = async () => {
				verifyCount += 1;
				return { user: 'user-2' };
			};
			User.findById = async () => ({ _id: 'user-2', is_active: true });

			const previewIsValid = await isMagicLinkValid('preview-token');
			const loginUser = await verifyMagicLink('preview-token');

			assert.equal(previewIsValid, true);
			assert.equal(loginUser?._id, 'user-2');
			assert.equal(verifyCount, 1);
		} finally {
			MagicLink.findOne = originalFindOne;
			MagicLink.verify = originalVerify;
			User.findById = originalFindById;
		}
	});
});
