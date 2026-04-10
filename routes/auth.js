import { Router } from 'express';
import crypto from 'node:crypto';
import { authenticator } from 'otplib';
import { User } from '../model/user.js';
import { createTenant } from '../modules/tenancy.js';
import { ensureCollections } from '../modules/typesense.js';
import { generateToken } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/email_service.js';
import { sendMagicLink, verifyMagicLink } from '../services/magic_link_service.js';
import * as passkeyService from '../services/passkey_service.js';
import { createDefaultProject } from '../services/project_service.js';

const router = Router();

// ---- Registration (no password — auto-generated) ----

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

		const user = await User.create({
			email,
			password,
			name,
			verification_token: verificationToken,
		});

		// Create tenant + default project
		const tenant = await createTenant(user._id, name);
		user.tenant = tenant._id;
		user.host_id = tenant.host_id;
		user.is_active = true;
		await user.save();

		ensureCollections(tenant.host_id).catch((e) =>
			console.warn('Typesense collection setup deferred:', e.message),
		);

		await createDefaultProject(user._id, tenant.host_id);

		sendVerificationEmail(email, verificationToken).catch((e) =>
			console.warn('Verification email failed:', e.message),
		);

		// Set session for immediate login
		req.session.userId = user._id.toString();
		req.session.tenantId = tenant._id.toString();
		req.session.host_id = tenant.host_id;

		if (req.accepts('html')) {
			return res.redirect('/dashboard');
		}

		res.status(201).json({
			message: 'Registration successful. Check your email to verify your account.',
			token: generateToken(user._id.toString(), tenant.host_id),
		});
	} catch (err) {
		console.error('Registration error:', err);
		res.status(500).json({ error: 'Registration failed' });
	}
});

// ---- Email Verification ----

router.get('/verify', async (req, res) => {
	try {
		const { token } = req.query;
		if (!token) return res.status(400).json({ error: 'Token required' });

		const user = await User.findOne({ verification_token: token }).select('+verification_token');
		if (!user) return res.status(404).json({ error: 'Invalid or expired token' });

		user.is_verified = true;
		user.verification_token = undefined;
		await user.save();

		res.redirect('/login?verified=true');
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

		const isValid = authenticator.verify({ token: code, secret: user.totp_secret });
		if (!isValid) return res.status(401).json({ error: 'Invalid 2FA code' });

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

		const secret = authenticator.generateSecret();
		const otpauth = authenticator.keyuri(user.email, 'Kumbukum', secret);

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

		const isValid = authenticator.verify({ token: code, secret: user.totp_secret });
		if (!isValid) return res.status(400).json({ error: 'Invalid code — try again' });

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

export default router;
