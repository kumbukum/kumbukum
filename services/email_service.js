import nodemailer from 'nodemailer';
import config from '../config.js';

let transporter;

function getTransporter() {
	if (!transporter) {
		if (!config.smtp.host) {
			console.warn('SMTP not configured — emails will be logged to console');
			return null;
		}
		transporter = nodemailer.createTransport({
			host: config.smtp.host,
			port: config.smtp.port,
			secure: config.smtp.port === 465,
			auth: config.smtp.user
				? { user: config.smtp.user, pass: config.smtp.pass }
				: undefined,
		});
	}
	return transporter;
}

async function sendMail({ to, subject, html }) {
	const t = getTransporter();
	const mailOptions = { from: config.smtp.from, to, subject, html };

	if (!t) {
		console.log('Email (no SMTP):', JSON.stringify({ to, subject }));
		return;
	}

	return t.sendMail(mailOptions);
}

export async function sendVerificationEmail(email, token) {
	const url = `${config.appUrl}/verify?token=${encodeURIComponent(token)}`;
	return sendMail({
		to: email,
		subject: 'Confirm your Kumbukum account',
		html: `<p>Welcome to Kumbukum!</p><p><a href="${url}">Click here to confirm your account</a></p><p>This link expires in 24 hours.</p>`,
	});
}

export async function sendPasswordResetEmail(email, token) {
	const url = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
	return sendMail({
		to: email,
		subject: 'Reset your Kumbukum password',
		html: `<p>You requested a password reset.</p><p><a href="${url}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p>`,
	});
}

export async function sendMagicLinkEmail(email, token) {
	const url = `${config.appUrl}/magic?token=${encodeURIComponent(token)}`;
	return sendMail({
		to: email,
		subject: 'Your Kumbukum login link',
		html: `<p>Click the link below to sign in:</p><p><a href="${url}">Sign in to Kumbukum</a></p><p>This link expires in 15 minutes.</p>`,
	});
}
