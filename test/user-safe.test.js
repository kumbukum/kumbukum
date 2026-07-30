import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { describe, it } from 'node:test';
import { User, compareUserPassword, toSafeUser } from '../model/user.js';

describe('User.toSafe', () => {
	it('removes security secrets and access token values', () => {
		const user = new User({
			email: 'safe-user@example.com',
			password: 'password',
			name: 'Safe User',
			totp_secret: 'totp-secret',
			verification_token: 'verify-token',
			password_reset_token: 'reset-token',
			password_reset_expires: new Date(),
			stripe_customer_id: 'stripe-customer',
			stripe_subscription_id: 'stripe-subscription',
			access_tokens: [{ token: 'raw-token', name: 'MCP token' }],
		});

		const safe = user.toSafe();
		assert.ok(!safe.password, 'password must not be exposed');
		assert.ok(!safe.totp_secret, 'totp_secret must not be exposed');
		assert.ok(!safe.verification_token, 'verification_token must not be exposed');
		assert.ok(!safe.password_reset_token, 'password_reset_token must not be exposed');
		assert.ok(!safe.password_reset_expires, 'password_reset_expires must not be exposed');
		assert.ok(!safe.stripe_customer_id, 'stripe_customer_id must not be exposed');
		assert.ok(!safe.stripe_subscription_id, 'stripe_subscription_id must not be exposed');
		assert.equal(safe.access_tokens.length, 1);
		assert.ok(!safe.access_tokens[0].token, 'access token value must not be exposed');
		assert.equal(safe.access_tokens[0].name, 'MCP token');
	});

	it('removes security secrets from plain lean user objects', () => {
		const user = {
			_id: 'user-1',
			email: 'lean-user@example.com',
			password: 'password-hash',
			name: 'Lean User',
			totp_secret: 'totp-secret',
			verification_token: 'verify-token',
			password_reset_token: 'reset-token',
			password_reset_expires: new Date(),
			stripe_customer_id: 'stripe-customer',
			stripe_subscription_id: 'stripe-subscription',
			stripe_free_subscription_id: 'stripe-free-subscription',
			access_tokens: [{ _id: 'token-1', token: 'raw-token', name: 'MCP token', created_at: new Date() }],
		};

		const safe = toSafeUser(user);
		assert.equal(safe.email, user.email);
		assert.equal(safe.password, undefined);
		assert.equal(safe.totp_secret, undefined);
		assert.equal(safe.verification_token, undefined);
		assert.equal(safe.password_reset_token, undefined);
		assert.equal(safe.password_reset_expires, undefined);
		assert.equal(safe.stripe_customer_id, undefined);
		assert.equal(safe.stripe_subscription_id, undefined);
		assert.equal(safe.stripe_free_subscription_id, undefined);
		assert.deepEqual(safe.access_tokens, [{ _id: 'token-1', name: 'MCP token', created_at: user.access_tokens[0].created_at }]);
		assert.equal(user.password, 'password-hash');
	});

	it('compares passwords from plain lean user objects', async () => {
		const user = { password: await bcrypt.hash('correct-password', 4) };
		assert.equal(await compareUserPassword(user, 'correct-password'), true);
		assert.equal(await compareUserPassword(user, 'wrong-password'), false);
	});
});
