import { Router } from 'express';
import crypto from 'node:crypto';
import { generateSecret, verifySync, generateURI } from 'otplib';
import { User } from '../model/user.js';
import { createTenant } from '../modules/tenancy.js';
import { ensureCollections } from '../modules/typesense.js';
import { generateToken } from '../middleware/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email_service.js';
import { sendMagicLink, verifyMagicLink } from '../services/magic_link_service.js';
import * as passkeyService from '../services/passkey_service.js';
import { createDefaultProject } from '../services/project_service.js';
import { PendingSignup } from '../model/pending_signup.js';

const router = Router();

// ---- Registration (email confirmation required before account creation) ----

router.post('/signup', async (req, res) => {
	try {
		const { email, name } = req.body;
		if (!email || !name) {
			return res.status(400).json({ error: 'email and name are required' });
		}

		const existing = await User.findOne({ email });
		if (existing) {
			return res.status(409).json({ error: 'Email already registered' });
		}

		// Generate a random password (user never sees it; they use magic link / passkey / reset)
		const password = crypto.randomBytes(24).toString('base64url');
		const verificationToken = crypto.randomBytes(32).toString('hex');

		// Remove any existing pending signup for this email
		await PendingSignup.deleteMany({ email });

		// Store pending signup (expires in 24 hours)
		await PendingSignup.create({
			email,
			name,
			password,
			token: verificationToken,
			expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
		});

		await sendVerificationEmail(email, verificationToken);

		res.status(200).json({
			message: 'We sent a confirmation link to your email. Please verify to activate your account.',
		});
	} catch (err) {
		console.error('Registration error:', err);
		res.status(500).json({ error: 'Registration failed' });
	}
});

// ---- Email Verification (creates the account) ----

router.get('/verify', async (req, res) => {
	try {
		const { token } = req.query;
		if (!token) return res.status(400).json({ error: 'Token required' });

		const pending = await PendingSignup.findOne({ token, expires_at: { $gt: new Date() } });
		if (!pending) return res.status(404).send('Invalid or expired verification link.');

		// Check again if email was taken in the meantime
		const existing = await User.findOne({ email: pending.email });
		if (existing) {
			await PendingSignup.deleteOne({ _id: pending._id });
			return res.redirect('/login?already_verified=true');
		}

		// Create the actual account
		const user = await User.create({
			email: pending.email,
			password: pending.password,
			name: pending.name,
			is_verified: true,
		});

		const tenant = await createTenant(user._id, pending.name);
		user.tenant = tenant._id;
		user.host_id = tenant.host_id;
		user.is_active = true;
		await user.save();

		ensureCollections(tenant.host_id).catch((e) =>
			console.warn('Typesense collection setup deferred:', e.message),
		);

		await createDefaultProject(user._id, tenant.host_id);

		// Clean up pending signup
		await PendingSignup.deleteOne({ _id: pending._id });

		// Sign the user in directly
		req.session.userId = user._id.toString();
		req.session.tenantId = tenant._id.toString();
		req.session.host_id = tenant.host_id;

		res.redirect('/dashboard');
	} catch (err) {
		console.error('Verification error:', err);
		res.status(500).json({ error: 'Verification failed' });
	}
});

// ---- Login ----

router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) {
			return res.status(400).json({ error: 'email and password required' });
		}

		const user = await User.findOne({ email, is_active: true }).select('+password +totp_secret');
		if (!user || !(await user.comparePassword(password))) {
			if (req.is('application/x-www-form-urlencoded')) return res.render('auth/login', { error: 'Invalid credentials' });
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		// Check if 2FA is required
		if (user.totp_enabled) {
			const tempToken = crypto.randomBytes(32).toString('hex');
			req.session.pending2FA = { userId: user._id.toString(), token: tempToken };
			if (req.is('application/x-www-form-urlencoded')) return res.render('auth/2fa', { tempToken });
			return res.json({ requires2FA: true, tempToken });
		}

		// Set session
		req.session.userId = user._id.toString();
		req.session.tenantId = user.tenant?.toString();
		req.session.host_id = user.host_id;

		if (req.is('application/x-www-form-urlencoded')) return res.redirect('/dashboard');

		res.json({
			user: user.toSafe(),
			token: generateToken(user._id.toString(), user.host_id),
		});
	} catch (err) {
		console.error('Login error:', err);
		res.status(500).json({ error: 'Login failed' });
	}
});

// ---- Password Reset (generate random password, show to user) ----

router.post('/reset-password', async (req, res) => {
	try {
		if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

		const user = await User.findById(req.session.userId).select('+password');
		if (!user) return res.status(404).json({ error: 'User not found' });

		const newPassword = crypto.randomBytes(16).toString('base64url');
		user.password = newPassword;
		await user.save();

		res.json({ password: newPassword });
	} catch (err) {
		console.error('Password reset error:', err);
		res.status(500).json({ error: 'Password reset failed' });
	}
});

// ---- Forgot Password (public, unauthenticated) ----

router.post('/forgot-password', async (req, res) => {
	try {
		const { email } = req.body;
		if (!email) return res.status(400).json({ error: 'email is required' });

		const user = await User.findOne({ email, is_active: true });
		if (user) {
			const resetToken = crypto.randomBytes(32).toString('hex');
			user.password_reset_token = resetToken;
			user.password_reset_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
			await user.save();
			sendPasswordResetEmail(email, resetToken).catch((e) =>
				console.warn('Password reset email failed:', e.message),
			);
		}

		// Always return success to prevent email enumeration
		res.json({ message: 'If an account exists with that email, a password reset link has been sent.' });
	} catch (err) {
		console.error('Forgot password error:', err);
		res.status(500).json({ error: 'Failed to send reset email' });
	}
});

router.get('/reset-password', async (req, res) => {
	try {
		const { token } = req.query;
		if (!token) return res.redirect('/forgot-password');

		const user = await User.findOne({
			password_reset_token: token,
			password_reset_expires: { $gt: new Date() },
		}).select('+password_reset_token +password_reset_expires');

		if (!user) {
			return res.render('auth/reset_password', { error: 'Invalid or expired reset link.' });
		}

		// Generate and show the new random password (user must click Continue)
		const newPassword = crypto.randomBytes(16).toString('base64url');

		// Store temporarily — will be applied on confirm
		req.session.pendingReset = {
			userId: user._id.toString(),
			token,
			newPassword,
		};

		res.render('auth/reset_password', { password: newPassword, token });
	} catch (err) {
		console.error('Reset password page error:', err);
		res.render('auth/reset_password', { error: 'Something went wrong. Please try again.' });
	}
});

router.post('/reset-password/confirm', async (req, res) => {
	try {
		const { token } = req.body;
		const pending = req.session.pendingReset;

		if (!pending || pending.token !== token) {
			return res.render('auth/reset_password', { error: 'Invalid reset session. Please request a new link.' });
		}

		const user = await User.findById(pending.userId).select('+password +password_reset_token +password_reset_expires');
		if (!user || user.password_reset_token !== token || user.password_reset_expires < new Date()) {
			return res.render('auth/reset_password', { error: 'Reset link has expired.' });
		}

		user.password = pending.newPassword;
		user.password_reset_token = undefined;
		user.password_reset_expires = undefined;
		await user.save();

		delete req.session.pendingReset;
		res.redirect('/login?reset=true');
	} catch (err) {
		console.error('Reset password confirm error:', err);
		res.render('auth/reset_password', { error: 'Password reset failed. Please try again.' });
	}
});

// ---- 2FA Verify ----

router.post('/2fa/verify', async (req, res) => {
	try {
		const { code, tempToken } = req.body;
		const pending = req.session.pending2FA;

		if (!pending || pending.token !== tempToken) {
			return res.status(401).json({ error: 'Invalid 2FA session' });
		}

		const user = await User.findById(pending.userId).select('+totp_secret');
		if (!user) return res.status(401).json({ error: 'User not found' });

		const result = verifySync({ token: code, secret: user.totp_secret });
		if (!result.valid) return res.status(401).json({ error: 'Invalid 2FA code' });

		delete req.session.pending2FA;
		req.session.userId = user._id.toString();
		req.session.tenantId = user.tenant?.toString();
		req.session.host_id = user.host_id;

		res.json({
			user: user.toSafe(),
			token: generateToken(user._id.toString(), user.host_id),
		});
	} catch (err) {
		console.error('2FA error:', err);
		res.status(500).json({ error: '2FA verification failed' });
	}
});

// ---- 2FA Setup ----

router.post('/2fa/setup', async (req, res) => {
	try {
		if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

		const user = await User.findById(req.session.userId).select('+totp_secret');
		if (!user) return res.status(404).json({ error: 'User not found' });

		const secret = generateSecret();
		const otpauth = generateURI({ issuer: 'Kumbukum', label: user.email, secret });

		user.totp_secret = secret;
		await user.save();

		res.json({ secret, otpauth });
	} catch (err) {
		console.error('2FA setup error:', err);
		res.status(500).json({ error: '2FA setup failed' });
	}
});

router.post('/2fa/confirm', async (req, res) => {
	try {
		if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

		const { code } = req.body;
		const user = await User.findById(req.session.userId).select('+totp_secret');
		if (!user) return res.status(404).json({ error: 'User not found' });

		const result = verifySync({ token: code, secret: user.totp_secret });
		if (!result.valid) return res.status(400).json({ error: 'Invalid code — try again' });

		user.totp_enabled = true;
		await user.save();

		res.json({ message: '2FA enabled successfully' });
	} catch (err) {
		console.error('2FA confirm error:', err);
		res.status(500).json({ error: '2FA confirmation failed' });
	}
});

// ---- Magic Link ----

router.post('/magic-link', async (req, res) => {
	try {
		const { email } = req.body;
		if (!email) return res.status(400).json({ error: 'email required' });

		await sendMagicLink(email);
		res.json({ message: 'If an account exists, a login link has been sent.' });
	} catch (err) {
		console.error('Magic link error:', err);
		res.status(500).json({ error: 'Failed to send magic link' });
	}
});

router.get('/magic', async (req, res) => {
	try {
		const { token } = req.query;
		if (!token) return res.status(400).json({ error: 'Token required' });

		const user = await verifyMagicLink(token);
		if (!user) return res.status(401).json({ error: 'Invalid or expired magic link' });

		req.session.userId = user._id.toString();
		req.session.tenantId = user.tenant?.toString();
		req.session.host_id = user.host_id;

		res.redirect('/dashboard');
	} catch (err) {
		console.error('Magic link verify error:', err);
		res.status(500).json({ error: 'Magic link verification failed' });
	}
});

// ---- Passkey ----

router.post('/passkey/register/options', async (req, res) => {
	try {
		if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
		const user = await User.findById(req.session.userId);
		if (!user) return res.status(404).json({ error: 'User not found' });

		const options = await passkeyService.getRegistrationOptions(user);
		req.session.passkeyChallenge = options.challenge;
		res.json(options);
	} catch (err) {
		console.error('Passkey register options error:', err);
		res.status(500).json({ error: 'Failed to generate passkey options' });
	}
});

router.post('/passkey/register/verify', async (req, res) => {
	try {
		if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
		const user = await User.findById(req.session.userId);
		if (!user) return res.status(404).json({ error: 'User not found' });

		const challenge = req.session.passkeyChallenge;
		delete req.session.passkeyChallenge;

		await passkeyService.verifyAndSaveRegistration(user, req.body, challenge);
		res.json({ message: 'Passkey registered' });
	} catch (err) {
		console.error('Passkey register verify error:', err);
		res.status(500).json({ error: 'Passkey registration failed' });
	}
});

router.post('/passkey/login/options', async (req, res) => {
	try {
		const { email } = req.body;
		const user = await User.findOne({ email, is_active: true });
		if (!user) return res.status(404).json({ error: 'User not found' });

		const options = await passkeyService.getAuthenticationOptions(user);
		req.session.passkeyChallenge = options.challenge;
		req.session.passkeyUserId = user._id.toString();
		res.json(options);
	} catch (err) {
		console.error('Passkey login options error:', err);
		res.status(500).json({ error: 'Failed to generate authentication options' });
	}
});

router.post('/passkey/login/verify', async (req, res) => {
	try {
		const challenge = req.session.passkeyChallenge;
		const userId = req.session.passkeyUserId;
		delete req.session.passkeyChallenge;
		delete req.session.passkeyUserId;

		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ error: 'User not found' });

		const verification = await passkeyService.verifyAuthentication(user, req.body, challenge);
		if (!verification.verified) {
			return res.status(401).json({ error: 'Passkey authentication failed' });
		}

		req.session.userId = user._id.toString();
		req.session.tenantId = user.tenant?.toString();
		req.session.host_id = user.host_id;

		res.json({
			user: user.toSafe(),
			token: generateToken(user._id.toString(), user.host_id),
		});
	} catch (err) {
		console.error('Passkey login verify error:', err);
		res.status(500).json({ error: 'Passkey authentication failed' });
	}
});

// ---- Logout ----

router.post('/logout', (req, res) => {
	req.session.destroy(() => {
		res.clearCookie('connect.sid');
		if (req.accepts('html')) return res.redirect('/login');
		res.json({ message: 'Logged out' });
	});
});

// ---- Render auth pages ----

router.get('/login', (req, res) => res.render('auth/login'));
router.get('/signup', (req, res) => res.render('auth/register'));
router.get('/forgot-password', (req, res) => res.render('auth/forgot_password'));

// ---- Ajax partials ----

router.get('/ajax/signup-success', (req, res) => res.render('ajax/signup_success'));
router.get('/ajax/forgot-password-success', (req, res) => res.render('ajax/forgot_password_success'));

export default router;
